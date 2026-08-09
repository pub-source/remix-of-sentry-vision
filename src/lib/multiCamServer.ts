import type { CameraConfig } from '@/types/multicam';

export interface BackendCameraStatus {
  id: string;
  path: string;
  name: string;
  enabled: boolean;
  ffmpeg: boolean;
  hls_ready: boolean;
  stream: string;
  stream_local: string;
  restarts: number;
  error: string | null;
}

export interface BackendStatus {
  mediamtx: boolean;
  hls_port: number;
  lan_ip: string;
  whisper: boolean;
  cameras: BackendCameraStatus[];
  /** Resolved binary paths reported by the local bridge (null = missing). */
  ffmpeg_path?: string | null;
  ffprobe_path?: string | null;
  error: string | null;
}


export interface AudioEvent {
  camera_id: string;
  timestamp: string;
  transcript: string;
  keyword: string;
  confidence: number;
}

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

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const getMultiStatus = (server: string) =>
  req<BackendStatus>(`${base(server)}/status`, undefined, 6000);

/** Push the locally-stored camera list to the Python backend. */
export const syncCameras = (server: string, cameras: CameraConfig[]) =>
  req<{ success: boolean }>(
    `${base(server)}/cameras/sync`,
    json({
      cameras: cameras.map(c => ({
        id: c.id, path: c.path, name: c.name, rtsp: c.rtspUrl, enabled: c.enabled,
      })),
    }),
    15000,
  );

export const startCamera = (server: string, id: string) =>
  req<{ success: boolean; error?: string; stream?: string }>(
    `${base(server)}/cameras/${id}/start`, { method: 'POST' }, 30000);

export const stopCamera = (server: string, id: string) =>
  req<{ success: boolean }>(`${base(server)}/cameras/${id}/stop`, { method: 'POST' }, 15000);

export const startAll = (server: string) =>
  req<{ success: boolean }>(`${base(server)}/start-all`, { method: 'POST' }, 60000);

export const stopAll = (server: string) =>
  req<{ success: boolean }>(`${base(server)}/stop-all`, { method: 'POST' }, 30000);

export const testCamera = (server: string, rtsp: string) =>
  req<{ success: boolean; error?: string; info?: string }>(
    `${base(server)}/test-connection`, json({ rtsp }), 25000);

/** Audio distress events produced by ffmpeg -> Whisper on the backend. */
export const getAudioEvents = (server: string, id: string, since?: string) =>
  req<{ events: AudioEvent[] }>(
    `${base(server)}/cameras/${id}/audio-events${since ? `?since=${encodeURIComponent(since)}` : ''}`,
    undefined,
    8000,
  );

export function backendHint(server: string) {
  const httpsPage = typeof location !== 'undefined' && location.protocol === 'https:';
  if (httpsPage && /^http:\/\//i.test(server.trim())) {
    return 'This page is served over HTTPS, so the browser blocks plain-HTTP local servers. Open the dashboard over http:// on the same PC, or use the native app build.';
  }
  return '';
}
