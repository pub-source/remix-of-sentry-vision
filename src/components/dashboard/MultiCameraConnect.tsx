import { useCallback, useEffect, useRef, useState } from 'react';
import { Server, Play, Square, RefreshCw, CheckCircle2, XCircle, Loader2, Grid2x2, Square as SquareIcon, Columns2 } from 'lucide-react';
import {
  backendHint,
  getMultiStatus,
  startCamera,
  stopCamera,
  syncCameras,
  type BackendCameraStatus,
} from '@/lib/multiCamServer';
import {
  useCameraSlots,
  slotPath,
  slotRtsp,
  loadServerHost,
  saveServerHost,
  serverUrlFor,
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
  server,
  onRename,
  onIp,
  onAi,
  onStream,
}: {
  slot: CameraSlot;
  server: string;
  onRename: (v: string) => void;
  onIp: (v: string) => void;
  onAi: (v: boolean) => void;
  onStream?: (url: string) => void;
}) {
  const [status, setStatus] = useState<BackendCameraStatus | null>(null);
  const [busy, setBusy] = useState<'' | 'check' | 'start' | 'stop'>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const autoLoaded = useRef(false);
  const id = `slot-${slot.index}`;
  const rtsp = slotRtsp(slot);

  const check = useCallback(async (silent = true) => {
    if (!server) return null;
    if (!silent) { setBusy('check'); setError(''); }
    try {
      const s = await getMultiStatus(server);
      const mine = s.cameras.find(c => c.id === id) ?? null;
      setStatus(mine);
      if (!silent) setMessage(mine ? `${slot.name} registered on the local server.` : 'Local server reachable — press Connect.');
      return mine;
    } catch {
      setStatus(null);
      if (!silent) {
        setMessage('');
        setError(backendHint(server) || `Could not reach ${server}. Run camera_server.py on that PC.`);
      }
      return null;
    } finally {
      if (!silent) setBusy('');
    }
  }, [server, id, slot.name]);

  useEffect(() => {
    if (!server || !slot.ip.trim()) return;
    const t = window.setInterval(async () => {
      const c = await check(true);
      if (!c) { autoLoaded.current = false; return; }
      if (c.hls_ready && c.ffmpeg && !autoLoaded.current) {
        autoLoaded.current = true;
        onStream?.(c.stream_local || c.stream);
      }
      if (!c.hls_ready) autoLoaded.current = false;
    }, 2500);
    return () => window.clearInterval(t);
  }, [server, slot.ip, check, onStream]);

  const handleStart = async () => {
    if (!slot.ip.trim()) { setError('Enter the camera IP address first.'); return; }
    setBusy('start'); setError(''); setMessage(`Starting ${slot.name}…`);
    try {
      await syncCameras(server, [{
        id, path: slotPath(slot), name: slot.name, location: '', rtspUrl: rtsp,
        enabled: true, aiEnabled: slot.aiEnabled, recording: false, createdAt: new Date().toISOString(),
      }]);
      const res = await startCamera(server, id);
      if (!res.success) { setError(res.error || 'The local server could not start ffmpeg for this camera.'); return; }
      if (res.stream) { autoLoaded.current = true; onStream?.(res.stream); }
      setMessage(`Streaming ${slotPath(slot)} from ${slot.ip}.`);
      await check(true);
    } catch {
      setError(backendHint(server) || `Could not reach ${server}.`);
    } finally { setBusy(''); }
  };

  const handleStop = async () => {
    setBusy('stop'); autoLoaded.current = false;
    try { await stopCamera(server, id); setMessage(`${slot.name} stopped.`); await check(true); }
    catch { setError('Could not stop this camera on the local server.'); }
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
          <label className="text-[14px] font-semibold">Camera IP address</label>
          <input
            value={slot.ip}
            onChange={e => onIp(e.target.value)}
            placeholder="192.168.18.93"
            className="w-full text-[15px] px-3 py-2.5 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      <p className="text-[13px] text-muted-foreground break-all">
        Section <span className="font-semibold text-foreground">{slotPath(slot)}</span> · {rtsp || 'no camera IP yet'}
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
          <Dot ok={status.ffmpeg} label="ffmpeg" />
          <Dot ok={status.hls_ready} label="HLS" />
          {status.error && <span className="text-[13px] text-destructive">{status.error}</span>}
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
  const [host, setHost] = useState(loadServerHost);
  const server = serverUrlFor(host);

  return (
    <div className="space-y-3">
      <label className="text-[15px] font-semibold flex items-center gap-2">
        <Server className="w-4 h-4 text-primary" /> Connect cameras
      </label>
      <p className="text-[14px] text-muted-foreground">
        Choose how many cameras you want. Each camera gets its own local-server section (cam1, cam2,
        …) — you only type its IP address, and every feed runs a fully independent saliency
        detection pipeline.
      </p>

      <div className="space-y-1">
        <label className="text-[14px] font-semibold">Number of cameras</label>
        <div className="flex items-center gap-2">
          {([1, 2, 4] as SlotCount[]).map(n => (
            <button
              key={n}
              onClick={() => setCount(n)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[15px] font-bold border transition-colors ${
                count === n ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
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

      <div className="space-y-1">
        <label className="text-[14px] font-semibold">Local server IP (PC running camera_server.py)</label>
        <input
          value={host}
          onChange={e => setHost(e.target.value)}
          onBlur={() => saveServerHost(host)}
          placeholder="127.0.0.1"
          className="w-full text-[15px] px-3 py-2.5 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="text-[13px] text-muted-foreground break-all">API {server}</p>
      </div>

      <div className={`grid gap-3 ${count === 1 ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
        {activeSlots.map(slot => (
          <SlotCard
            key={slot.index}
            slot={slot}
            server={server}
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
