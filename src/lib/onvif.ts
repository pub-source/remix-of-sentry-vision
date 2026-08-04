/**
 * Minimal ONVIF / RTSP helper.
 *
 * ONVIF cameras expose a SOAP service (usually at /onvif/device_service).
 * We ask the camera for its media profiles and the RTSP stream URI.
 * Browsers cannot play RTSP, so the resulting RTSP URL is handed to a local
 * gateway (go2rtc / MediaMTX) which re-publishes it as HLS the browser can play.
 */

export interface OnvifTarget {
  host: string;
  onvifPort?: number;
  rtspPort?: number;
  username?: string;
  password?: string;
}

const soapEnvelope = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
 xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
 xmlns:tt="http://www.onvif.org/ver10/schema">
 <s:Body>${body}</s:Body>
</s:Envelope>`;

async function soapCall(url: string, body: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
      body: soapEnvelope(body),
      signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function pickAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1].trim());
  return out;
}

function pickAttr(xml: string, tag: string, attr: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*\\b${attr}="([^"]+)"`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

/** Injects user:pass into an rtsp:// URL. */
export function withCredentials(rtspUrl: string, user?: string, pass?: string) {
  if (!user) return rtspUrl;
  return rtspUrl.replace(/^rtsp:\/\/(?:[^@/]*@)?/, `rtsp://${encodeURIComponent(user)}:${encodeURIComponent(pass || '')}@`);
}

/** Common RTSP paths used by consumer CCTV brands (V380 / Hik / Dahua / Tapo / Reolink...). */
export function rtspCandidates(t: OnvifTarget): { label: string; url: string }[] {
  const port = t.rtspPort || 554;
  const base = `rtsp://${t.host}:${port}`;
  const paths: [string, string][] = [
    ['ONVIF profile 1', '/onvif1'],
    ['V380 / JA main', '/live/ch00_0'],
    ['V380 / JA sub', '/live/ch00_1'],
    ['Hikvision main', '/Streaming/Channels/101'],
    ['Hikvision sub', '/Streaming/Channels/102'],
    ['Dahua main', '/cam/realmonitor?channel=1&subtype=0'],
    ['Dahua sub', '/cam/realmonitor?channel=1&subtype=1'],
    ['Tapo / TP-Link', '/stream1'],
    ['Reolink main', '/h264Preview_01_main'],
    ['Generic', '/11'],
    ['Generic live', '/live'],
  ];
  return paths.map(([label, p]) => ({ label, url: withCredentials(base + p, t.username, t.password) }));
}

/**
 * Queries an ONVIF camera for its RTSP stream URIs.
 * Returns [] when the camera is unreachable, not ONVIF, or blocked by
 * CORS / mixed content (browser preview over HTTPS).
 */
export async function onvifGetStreamUris(t: OnvifTarget, signal?: AbortSignal): Promise<string[]> {
  const port = t.onvifPort || 80;
  const endpoints = [
    `http://${t.host}:${port}/onvif/device_service`,
    `http://${t.host}:${port}/onvif/media_service`,
    `http://${t.host}:${port}/onvif/Media`,
  ];

  for (const ep of endpoints) {
    const profilesXml = await soapCall(ep, '<trt:GetProfiles/>', signal);
    if (!profilesXml) continue;

    const tokens = [
      ...pickAttr(profilesXml, 'Profiles', 'token'),
      ...pickAll(profilesXml, 'ProfileToken'),
    ];
    const uris: string[] = [];
    for (const token of tokens.length ? tokens : ['Profile_1']) {
      const uriXml = await soapCall(
        ep,
        `<trt:GetStreamUri><trt:StreamSetup><tt:Stream>RTP-Unicast</tt:Stream>` +
          `<tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport></trt:StreamSetup>` +
          `<trt:ProfileToken>${token}</trt:ProfileToken></trt:GetStreamUri>`,
        signal,
      );
      if (!uriXml) continue;
      for (const u of pickAll(uriXml, 'Uri')) {
        if (u.startsWith('rtsp://')) uris.push(withCredentials(u, t.username, t.password));
      }
    }
    if (uris.length) return Array.from(new Set(uris));
  }
  return [];
}

/** Normalises a gateway base like "192.168.1.10" or "http://pc:1984" to an origin. */
export function gatewayOrigin(raw: string) {
  const v = raw.trim().replace(/\/+$/, '');
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `http://${v}${/:\d+$/.test(v) ? '' : ':1984'}`;
}

/** go2rtc / MediaMTX playback URL for an RTSP source. */
export function gatewayStreamUrl(gateway: string, rtspUrl: string, kind: 'hls' | 'mjpeg') {
  const origin = gatewayOrigin(gateway);
  const src = encodeURIComponent(rtspUrl);
  return kind === 'hls'
    ? `${origin}/api/stream.m3u8?src=${src}`
    : `${origin}/api/stream.mjpeg?src=${src}`;
}

/** Verifies a gateway stream URL actually responds. */
export async function probeUrl(url: string, timeout = 4000): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    await fetch(url, { mode: 'no-cors', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
