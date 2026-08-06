import { useCallback, useEffect, useRef, useState } from 'react';
import { Server, Play, Square, RefreshCw, CheckCircle2, XCircle, Loader2, Grid2x2, Square as SquareIcon, Columns2 } from 'lucide-react';
import {
  CameraServerStatus,
  connectionHint,
  getStatus,
  startMonitoring,
  stopMonitoring,
  resolveStreamUrl,
} from '@/lib/cameraServer';
import {
  useCameraSlots,
  slotServerUrl,
  slotHlsHost,
  slotPath,
  type CameraSlot,
  type SlotCount,
} from '@/hooks/useCameraSlots';

interface Props {
  /** Called with a browser-playable HLS URL for camera 1 (drives the main dashboard). */
  onStream: (url: string) => void;
  playbackError?: string | null;
  playing?: boolean;
}

const Dot = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className="flex items-center gap-1.5 text-[14px]">
    {ok ? <CheckCircle2 className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
    <span className={ok ? 'text-success' : 'text-muted-foreground'}>{label}</span>
  </span>
);

function SlotCard({
  slot,
  onRename,
  onIp,
  onAi,
  onStream,
}: {
  slot: CameraSlot;
  onRename: (v: string) => void;
  onIp: (v: string) => void;
  onAi: (v: boolean) => void;
  onStream?: (url: string) => void;
}) {
  const [status, setStatus] = useState<CameraServerStatus | null>(null);
  const [busy, setBusy] = useState<'' | 'check' | 'start' | 'stop'>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const autoLoaded = useRef(false);
  const server = slotServerUrl(slot);
  const defaultHls = slotHlsHost(slot) ? `${slotHlsHost(slot)}/${slotPath(slot)}/index.m3u8` : '';
  const [streamUrl, setStreamUrl] = useState('');
  const hls = streamUrl || defaultHls;

  const check = useCallback(async (silent = true) => {
    if (!server) return null;
    if (!silent) { setBusy('check'); setError(''); }
    try {
      const s = await getStatus(server);
      setStatus(s);
      const resolved = resolveStreamUrl(server, s);
      if (resolved) setStreamUrl(resolved);
      if (!silent) setMessage(`Connected to ${slot.name} local server.`);
      return s;
    } catch {
      setStatus(null);
      if (!silent) {
        setMessage('');
        setError(connectionHint(server) || `Could not reach ${server}. Run camera_server.py on ${slot.ip}.`);
      }
      return null;
    } finally {
      if (!silent) setBusy('');
    }
  }, [server, slot.name, slot.ip]);

  useEffect(() => {
    if (!server) return;
    const id = window.setInterval(async () => {
      const s = await check(true);
      if (!s) { autoLoaded.current = false; return; }
      if (s.hls_ready && s.ffmpeg && hls && !autoLoaded.current) {
        autoLoaded.current = true;
        onStream?.(hls);
      }
      if (!s.hls_ready) autoLoaded.current = false;
    }, 2500);
    return () => window.clearInterval(id);
  }, [server, hls, check, onStream]);

  const handleStart = async () => {
    if (!server) { setError('Enter the camera IP address first.'); return; }
    setBusy('start'); setError(''); setMessage(`Starting ${slot.name}…`);
    try {
      const res = await startMonitoring(server);
      if (!res.success) { setError(res.error || 'The local server could not start MediaMTX/ffmpeg.'); return; }
      const resolved = resolveStreamUrl(server, res);
      if (resolved) setStreamUrl(resolved);
      setMessage(`Streaming: ${resolved || hls}`);
      autoLoaded.current = true;
      if (resolved || hls) onStream?.(resolved || hls);
      await check(true);
    } catch {
      setError(connectionHint(server) || `Could not reach ${server}.`);
    } finally { setBusy(''); }
  };

  const handleStop = async () => {
    setBusy('stop'); autoLoaded.current = false;
    try { await stopMonitoring(server); setMessage(`${slot.name} stopped.`); await check(true); }
    catch { setError('Could not stop the local server processes.'); }
    finally { setBusy(''); }
  };

  const live = !!status?.ffmpeg && !!status?.hls_ready;

  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[15px] font-bold">
          <Server className="w-4 h-4 text-primary" /> CAM {slot.index} local server
        </span>
        <span className={`text-[13px] font-semibold px-2 py-0.5 rounded-full ${live ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
          {live ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[14px] font-semibold">Camera name</label>
          <input
            value={slot.name}
            onChange={e => onRename(e.target.value)}
            className="w-full text-[15px] px-3 py-2.5 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[14px] font-semibold">IP address</label>
          <input
            value={slot.ip}
            onChange={e => onIp(e.target.value)}
            placeholder="192.168.18.93"
            inputMode="decimal"
            className="w-full text-[15px] px-3 py-2.5 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <p className="text-[13px] text-muted-foreground break-all">
        API {server || '—'} · Stream {hls || '—'}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => check(false)}
          disabled={busy !== '' || !server}
          className="flex items-center gap-2 text-[15px] font-semibold px-3 py-2.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${busy === 'check' ? 'animate-spin' : ''}`} /> Check
        </button>
        <button
          onClick={handleStart}
          disabled={busy !== '' || !server}
          className="flex-1 flex items-center justify-center gap-2 text-[15px] font-semibold px-3 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
        >
          {busy === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {busy === 'start' ? 'Starting…' : 'Connect'}
        </button>
        <button
          onClick={handleStop}
          disabled={busy !== '' || !live}
          className="flex items-center gap-2 text-[15px] font-semibold px-3 py-2.5 rounded-lg border border-border hover:bg-muted disabled:opacity-50"
        >
          <Square className="w-4 h-4" /> Stop
        </button>
        <label className="flex items-center gap-2 text-[14px] font-semibold">
          <input type="checkbox" checked={slot.aiEnabled} onChange={e => onAi(e.target.checked)} />
          AI detection
        </label>
      </div>

      {status && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 rounded-lg bg-background/60 border border-border">
          <Dot ok={status.mediamtx} label="MediaMTX" />
          <Dot ok={status.ffmpeg} label="ffmpeg" />
          <Dot ok={status.hls_ready} label="HLS" />
        </div>
      )}
      {message && <p className="text-[14px] text-success break-all">{message}</p>}
      {error && (
        <p className="text-[14px] text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2 rounded-lg">{error}</p>
      )}
    </div>
  );
}

export const MultiCameraConnect = ({ onStream, playbackError, playing }: Props) => {
  const { count, activeSlots, setCount, updateSlot } = useCameraSlots();

  return (
    <div className="space-y-3">
      <label className="text-[15px] font-semibold flex items-center gap-2">
        <Server className="w-4 h-4 text-primary" /> Connect cameras
      </label>
      <p className="text-[14px] text-muted-foreground">
        Choose how many cameras you want. Each camera gets its own local server section — you only
        type its IP address, and every feed runs a fully independent saliency detection pipeline.
      </p>

      <div className="space-y-1">
        <label className="text-[14px] font-semibold">Number of cameras</label>
        <div className="flex items-center gap-2">
          {([1, 2, 4] as SlotCount[]).map(n => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[15px] font-bold border transition-colors ${
                count === n
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {n === 1 ? <SquareIcon className="w-4 h-4" /> : n === 2 ? <Columns2 className="w-4 h-4" /> : <Grid2x2 className="w-4 h-4" />}
              {n} camera{n === 1 ? '' : 's'}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground">
          Layout updates automatically: {count === 1 ? 'single view' : count === 2 ? '1 x 2 grid' : '2 x 2 grid'}.
        </p>
      </div>

      <div className={`grid gap-3 ${count === 1 ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
        {activeSlots.map(slot => (
          <SlotCard
            key={slot.index}
            slot={slot}
            onRename={v => updateSlot(slot.index, { name: v })}
            onIp={v => updateSlot(slot.index, { ip: v })}
            onAi={v => updateSlot(slot.index, { aiEnabled: v })}
            onStream={slot.index === 1 ? onStream : undefined}
          />
        ))}
      </div>

      {playing && <p className="text-[15px] font-semibold text-success">Camera 1 online in the dashboard.</p>}
      {playbackError && (
        <p className="text-[14px] text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2 rounded-lg">
          Playback error: {playbackError}
        </p>
      )}
    </div>
  );
};

export default MultiCameraConnect;
