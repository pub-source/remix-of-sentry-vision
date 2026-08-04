import { useCallback, useEffect, useRef, useState } from 'react';
import { Server, Play, Square, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import {
  CameraServerStatus,
  connectionHint,
  getStatus,
  loadRtsp,
  loadServerUrl,
  resolveStreamUrl,
  saveRtsp,
  saveServerUrl,
  startMonitoring,
  stopMonitoring,
} from '@/lib/cameraServer';

interface Props {
  /** Called with a browser-playable HLS URL once the local gateway is live. */
  onStream: (url: string) => void;
}

const Dot = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className="flex items-center gap-1.5 text-[14px]">
    {ok ? (
      <CheckCircle2 className="w-4 h-4 text-success" />
    ) : (
      <XCircle className="w-4 h-4 text-muted-foreground" />
    )}
    <span className={ok ? 'text-success' : 'text-muted-foreground'}>{label}</span>
  </span>
);

export const CameraServerPanel = ({ onStream }: Props) => {
  const [server, setServer] = useState(loadServerUrl);
  const [rtsp, setRtsp] = useState(loadRtsp);
  const [status, setStatus] = useState<CameraServerStatus | null>(null);
  const [busy, setBusy] = useState<'' | 'check' | 'start' | 'stop'>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const poll = useRef<number | null>(null);

  const check = useCallback(
    async (silent = false) => {
      if (!silent) {
        setBusy('check');
        setError('');
      }
      try {
        const s = await getStatus(server);
        setStatus(s);
        if (!rtsp && s.camera_rtsp) setRtsp(s.camera_rtsp);
        if (!silent) setMessage('Connected to the local camera server.');
        return s;
      } catch {
        setStatus(null);
        if (!silent) {
          setMessage('');
          setError(
            connectionHint(server) ||
              `Could not reach ${server}. Make sure camera_server.py is running on that machine.`,
          );
        }
        return null;
      } finally {
        if (!silent) setBusy('');
      }
    },
    [server, rtsp],
  );

  // Keep the status light fresh while the dialog is open.
  useEffect(() => {
    poll.current = window.setInterval(() => {
      if (status) check(true);
    }, 5000);
    return () => {
      if (poll.current) window.clearInterval(poll.current);
    };
  }, [status, check]);

  const handleStart = async () => {
    setBusy('start');
    setError('');
    setMessage('');
    try {
      saveServerUrl(server);
      if (rtsp) saveRtsp(rtsp);
      const res = await startMonitoring(server, rtsp || undefined);
      if (!res.success) {
        setError(res.error || 'The server could not start MediaMTX/ffmpeg.');
        return;
      }
      const url = resolveStreamUrl(server, res);
      setMessage(`Streaming: ${url}`);
      await check(true);
      if (url) onStream(url);
    } catch {
      setError(
        connectionHint(server) ||
          `Could not reach ${server}. Start camera_server.py (see local-server/README.md).`,
      );
    } finally {
      setBusy('');
    }
  };

  const handleStop = async () => {
    setBusy('stop');
    try {
      await stopMonitoring(server);
      setMessage('Monitoring stopped.');
      await check(true);
    } catch {
      setError('Could not stop the server processes.');
    } finally {
      setBusy('');
    }
  };

  const running = !!status?.ffmpeg && !!status?.hls_ready;

  return (
    <div className="space-y-3">
      <label className="text-[15px] font-semibold flex items-center gap-2">
        <Server className="w-4 h-4 text-primary" /> Local camera server (MediaMTX + ffmpeg)
      </label>
      <p className="text-[14px] text-muted-foreground">
        Run <code>local-server/camera_server.py</code> on the PC that can see your CCTV, then start
        the bridge here — the HLS link is connected automatically.
      </p>

      <div className="space-y-1">
        <label className="text-[14px] font-semibold">Server URL</label>
        <input
          type="url"
          value={server}
          onChange={e => setServer(e.target.value)}
          onBlur={() => saveServerUrl(server)}
          placeholder="http://127.0.0.1:5000"
          className="w-full text-[15px] px-3 py-2.5 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[14px] font-semibold">Camera RTSP (optional override)</label>
        <input
          type="text"
          value={rtsp}
          onChange={e => setRtsp(e.target.value)}
          onBlur={() => rtsp && saveRtsp(rtsp)}
          placeholder="rtsp://192.168.18.98:554/live/ch00_1"
          className="w-full text-[15px] px-3 py-2.5 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => check()}
          disabled={busy !== ''}
          className="flex items-center gap-2 text-[15px] font-semibold px-3 py-2.5 rounded-lg border border-border hover:bg-muted transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${busy === 'check' ? 'animate-spin' : ''}`} /> Check
        </button>
        <button
          onClick={handleStart}
          disabled={busy !== '' || !server.trim()}
          className="flex-1 flex items-center justify-center gap-2 text-[15px] font-semibold px-3 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 transition-all disabled:opacity-50"
        >
          <Play className="w-4 h-4" /> {busy === 'start' ? 'Starting…' : 'Start monitoring'}
        </button>
        <button
          onClick={handleStop}
          disabled={busy !== '' || !running}
          className="flex items-center gap-2 text-[15px] font-semibold px-3 py-2.5 rounded-lg border border-border hover:bg-muted transition-all disabled:opacity-50"
        >
          <Square className="w-4 h-4" /> Stop
        </button>
      </div>

      {status && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 rounded-lg bg-secondary/30 border border-border">
          <Dot ok={status.mediamtx} label="MediaMTX" />
          <Dot ok={status.ffmpeg} label="ffmpeg" />
          <Dot ok={status.hls_ready} label="HLS" />
          {status.lan_ip && (
            <span className="text-[14px] text-muted-foreground">LAN {status.lan_ip}</span>
          )}
        </div>
      )}

      {message && <p className="text-[14px] text-success break-all">{message}</p>}
      {error && (
        <p className="text-[14px] text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}
    </div>
  );
};

export default CameraServerPanel;
