export interface CameraServerStatus {
  mediamtx: boolean;
  ffmpeg: boolean;
  hls_ready: boolean;
  camera_rtsp: string;
  stream: string;
  stream_local: string;
  lan_ip: string;
  error: string | null;
}

export interface StartResult {
  success: boolean;
  stream?: string;
  stream_local?: string;
  camera_rtsp?: string;
  message?: string;
  error?: string;
}

const SERVER_KEY = 'msd-camera-server-url';
const RTSP_KEY = 'msd-camera-rtsp';

export const DEFAULT_SERVER_URL = 'http://127.0.0.1:5000';

export const loadServerUrl = () =>
  localStorage.getItem(SERVER_KEY) || DEFAULT_SERVER_URL;
export const saveServerUrl = (url: string) => localStorage.setItem(SERVER_KEY, url);
export const loadRtsp = () => localStorage.getItem(RTSP_KEY) || '';
export const saveRtsp = (url: string) => localStorage.setItem(RTSP_KEY, url);

const base = (url: string) => url.trim().replace(/\/+$/, '');

async function req<T>(url: string, init?: RequestInit, timeoutMs = 20000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export const getStatus = (server: string) =>
  req<CameraServerStatus>(`${base(server)}/status`, undefined, 6000);

export const startMonitoring = (server: string, rtsp?: string) =>
  req<StartResult>(`${base(server)}/start-monitoring`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rtsp ? { rtsp } : {}),
  });

export const stopMonitoring = (server: string) =>
  req<{ success: boolean }>(`${base(server)}/stop-monitoring`, { method: 'POST' }, 10000);

const HLS_PORT = '8888';

/** Guarantee an HLS playlist URL that never points at the FastAPI API port. */
function normalizeHls(raw: string, fallbackHost?: string) {
  try {
    const u = new URL(raw);
    if (fallbackHost && /^(127\.0\.0\.1|localhost)$/i.test(u.hostname)) u.hostname = fallbackHost;
    // The API (default :5000) is never the video stream.
    if (u.port === '5000' || !u.port) u.port = HLS_PORT;
    if (!/\.m3u8$/i.test(u.pathname)) {
      u.pathname = `${u.pathname.replace(/\/+$/, '')}/index.m3u8`;
    }
    return u.toString();
  } catch {
    return raw;
  }
}

/**
 * Pick the stream URL that this device can actually reach: if the dashboard is
 * talking to a remote PC (not 127.0.0.1), prefer the LAN URL the server reports.
 */
export function resolveStreamUrl(server: string, s: Pick<StartResult, 'stream' | 'stream_local'>) {
  const isLocal = /(^|\/\/)(127\.0\.0\.1|localhost)/i.test(server);
  const url = isLocal ? s.stream_local || s.stream : s.stream || s.stream_local;
  if (!url) return '';
  if (isLocal) return normalizeHls(url);
  let serverHost: string | undefined;
  try {
    serverHost = new URL(base(server)).hostname;
  } catch {
    serverHost = undefined;
  }
  return normalizeHls(url, serverHost);
}


export function connectionHint(server: string) {
  const httpsPage = typeof location !== 'undefined' && location.protocol === 'https:';
  if (httpsPage && /^http:\/\//i.test(server.trim())) {
    return 'This page is served over HTTPS, so the browser blocks plain-HTTP local servers. Open the dashboard over http:// on the same PC/Wi-Fi, or use the native app build.';
  }
  return '';
}
