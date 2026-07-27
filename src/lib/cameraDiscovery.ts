/**
 * Browser-side LAN camera discovery.
 *
 * Browsers cannot open raw sockets, so we discover cameras the only way a page
 * can: by firing HTTP probes at every host on the local subnet and watching
 * which ones answer. Two probe types are used:
 *   1. Port liveness  — fetch(..., { mode: 'no-cors' }) resolves (opaque) when
 *      something is listening; it rejects fast when the port is closed.
 *   2. Snapshot probe — an <img> pointed at a known camera snapshot/MJPEG path.
 *      If it decodes, we have a directly playable browser stream.
 */

export interface DiscoveredCamera {
  host: string;          // 192.168.1.50
  port: number;
  url: string;           // full probe URL that worked
  kind: 'mjpeg' | 'image' | 'hls' | 'unknown';
  path: string;
  playable: boolean;     // true when an <img> actually decoded a frame
}

export const COMMON_PORTS = [80, 8080, 81, 8081, 8000, 8888, 1984, 88];

/** Snapshot / MJPEG paths used by the most common consumer + pro cameras. */
export const COMMON_PATHS: { path: string; kind: DiscoveredCamera['kind'] }[] = [
  { path: '/video', kind: 'mjpeg' },                    // Android IP Webcam
  { path: '/shot.jpg', kind: 'image' },                 // Android IP Webcam
  { path: '/mjpg/video.mjpg', kind: 'mjpeg' },          // Axis
  { path: '/videostream.cgi', kind: 'mjpeg' },          // Foscam / clones
  { path: '/snapshot.cgi', kind: 'image' },             // Foscam / clones
  { path: '/cgi-bin/snapshot.cgi', kind: 'image' },     // Dahua
  { path: '/onvif-http/snapshot', kind: 'image' },      // Generic ONVIF
  { path: '/ISAPI/Streaming/channels/101/picture', kind: 'image' }, // Hikvision
  { path: '/cam/realmonitor', kind: 'mjpeg' },          // Dahua
  { path: '/tmpfs/auto.jpg', kind: 'image' },           // Tapo / cheap cams
  { path: '/api/frame.mjpeg', kind: 'mjpeg' },          // go2rtc gateway
  { path: '/index.m3u8', kind: 'hls' },                 // MediaMTX gateway
];

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

/** Returns true when *something* is listening on host:port over HTTP. */
export async function probePort(host: string, port: number, timeoutMs = 900): Promise<boolean> {
  const url = `http://${host}:${port}/`;
  try {
    await withTimeout(fetch(url, { mode: 'no-cors', cache: 'no-store' }), timeoutMs);
    return true;
  } catch {
    return false;
  }
}

/** Returns true when the URL decodes as an image (snapshot / MJPEG first frame). */
export function probeImage(url: string, timeoutMs = 2500): Promise<boolean> {
  return new Promise(resolve => {
    const img = new Image();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      img.src = '';
      resolve(ok);
    };
    const t = setTimeout(() => finish(false), timeoutMs);
    img.onload = () => { clearTimeout(t); finish(img.naturalWidth > 0); };
    img.onerror = () => { clearTimeout(t); finish(false); };
    const sep = url.includes('?') ? '&' : '?';
    img.src = `${url}${sep}_t=${Date.now()}`;
  });
}

/** Best-effort guess of the local subnet prefix via WebRTC host candidates. */
export async function guessLocalSubnet(): Promise<string> {
  try {
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel('probe');
    const found = await new Promise<string | null>(resolve => {
      const t = setTimeout(() => resolve(null), 1500);
      pc.onicecandidate = e => {
        const c = e.candidate?.candidate;
        if (!c) return;
        const m = c.match(/(\d+\.\d+\.\d+)\.\d+/);
        if (m && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(m[1])) {
          clearTimeout(t);
          resolve(m[1]);
        }
      };
      pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => {});
    });
    pc.close();
    if (found) return found;
  } catch { /* ignore */ }
  return '192.168.1';
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}

export interface ScanOptions {
  subnet: string;                 // e.g. "192.168.1"
  from?: number;                  // default 1
  to?: number;                    // default 254
  ports?: number[];
  onProgress?: (done: number, total: number) => void;
  onFound?: (cam: DiscoveredCamera) => void;
  signal?: { aborted: boolean };
}

/**
 * Sweeps the subnet for HTTP-reachable hosts, then fingerprints each live host
 * against the common camera snapshot paths.
 */
export async function scanNetworkForCameras(opts: ScanOptions): Promise<DiscoveredCamera[]> {
  const { subnet, from = 1, to = 254, ports = COMMON_PORTS, onProgress, onFound, signal } = opts;
  const hosts: string[] = [];
  for (let i = from; i <= to; i++) hosts.push(`${subnet}.${i}`);

  const results: DiscoveredCamera[] = [];
  const total = hosts.length;
  let done = 0;

  await pool(hosts, 32, async host => {
    if (signal?.aborted) return;

    // Stage 1 — which ports answer at all?
    const openPorts: number[] = [];
    await Promise.all(ports.map(async p => {
      if (await probePort(host, p)) openPorts.push(p);
    }));

    // Stage 2 — fingerprint every open port against known camera paths.
    for (const port of openPorts) {
      if (signal?.aborted) break;
      let matched = false;
      for (const { path, kind } of COMMON_PATHS) {
        if (signal?.aborted) break;
        const url = `http://${host}:${port}${path}`;
        if (kind === 'hls') continue; // can't verify HLS with <img>
        if (await probeImage(url)) {
          const cam: DiscoveredCamera = { host, port, url, kind, path, playable: true };
          results.push(cam);
          onFound?.(cam);
          matched = true;
          break;
        }
      }
      if (!matched) {
        const cam: DiscoveredCamera = {
          host, port,
          url: `http://${host}:${port}/`,
          kind: 'unknown', path: '/', playable: false,
        };
        results.push(cam);
        onFound?.(cam);
      }
    }

    done++;
    onProgress?.(done, total);
  });

  return results;
}
