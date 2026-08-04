import { useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2, Radio, Video } from 'lucide-react';
import { isMixedContentBlocked } from '@/lib/cameraDiscovery';
import {
  gatewayStreamUrl,
  onvifGetStreamUris,
  rtspCandidates,
  withCredentials,
} from '@/lib/onvif';

interface Props {
  onConnect: (url: string, kind: 'hls' | 'mjpeg' | 'image') => void;
}

export default function OnvifRtspConnect({ onConnect }: Props) {
  const [host, setHost] = useState('');
  const [onvifPort, setOnvifPort] = useState('80');
  const [rtspPort, setRtspPort] = useState('554');
  const [user, setUser] = useState('admin');
  const [pass, setPass] = useState('');
  const [gateway, setGateway] = useState('');
  const [kind, setKind] = useState<'hls' | 'mjpeg'>('hls');

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [uris, setUris] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const validHost = /^[\w.-]+$/.test(host.trim()) && host.trim().length > 3;
  const target = {
    host: host.trim(),
    onvifPort: Number(onvifPort) || 80,
    rtspPort: Number(rtspPort) || 554,
    username: user,
    password: pass,
  };

  const discover = async () => {
    if (!validHost) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setStatus('Asking the camera for its ONVIF media profiles…');
    const found = await onvifGetStreamUris(target, ctrl.signal);
    setBusy(false);
    if (found.length) {
      setUris(found);
      setSelected(found[0]);
      setStatus(`ONVIF replied with ${found.length} stream URI(s).`);
    } else {
      const fallback = rtspCandidates(target).map(c => c.url);
      setUris(fallback);
      setSelected(fallback[0]);
      setStatus('No ONVIF reply (camera offline, not ONVIF, or blocked by the browser). Showing standard RTSP paths — pick the one that matches your camera.');
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  const rtsp = selected ? withCredentials(selected, user, pass) : '';
  const playUrl = rtsp && gateway.trim() ? gatewayStreamUrl(gateway, rtsp, kind) : '';

  const field =
    'w-full text-[15px] px-3 py-2.5 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary';
  const lbl = 'text-[14px] font-medium text-muted-foreground';

  return (
    <div className="space-y-3">
      <label className="text-[15px] font-semibold flex items-center gap-2">
        <Radio className="w-4 h-4 text-primary" /> ONVIF / RTSP live stream
      </label>

      {isMixedContentBlocked() && (
        <p className="text-[14px] text-destructive flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          This preview runs over HTTPS, which blocks plain-HTTP cameras. Use the native app build or open the app over http:// on the same Wi-Fi.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1 col-span-2">
          <label className={lbl}>Camera IP / hostname</label>
          <input value={host} onChange={e => setHost(e.target.value.trim())} placeholder="192.168.18.93" className={field} />
        </div>
        <div className="space-y-1">
          <label className={lbl}>ONVIF port</label>
          <input value={onvifPort} onChange={e => setOnvifPort(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={field} />
        </div>
        <div className="space-y-1">
          <label className={lbl}>RTSP port</label>
          <input value={rtspPort} onChange={e => setRtspPort(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={field} />
        </div>
        <div className="space-y-1">
          <label className={lbl}>Username</label>
          <input value={user} onChange={e => setUser(e.target.value)} className={field} />
        </div>
        <div className="space-y-1">
          <label className={lbl}>Password</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} className={field} />
        </div>
      </div>

      <button
        onClick={discover}
        disabled={!validHost || busy}
        className="w-full text-[15px] font-semibold py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
        {busy ? 'Discovering…' : 'Discover ONVIF streams'}
      </button>

      {status && <p className="text-[14px] text-muted-foreground">{status}</p>}

      {uris.length > 0 && (
        <div className="space-y-2">
          <label className={lbl}>RTSP stream</label>
          <div className="space-y-1 max-h-44 overflow-y-auto">
            {uris.map(u => (
              <button
                key={u}
                onClick={() => setSelected(u)}
                className={`w-full text-left text-[14px] px-3 py-2 rounded-lg border transition-all break-all ${
                  selected === u ? 'border-primary bg-primary/10 text-foreground' : 'border-border hover:border-primary/50 text-foreground/80'
                }`}
              >
                {u.replace(/:\/\/[^@/]*@/, '://•••@')}
              </button>
            ))}
          </div>
          <button
            onClick={() => copy(rtsp)}
            className="text-[14px] flex items-center gap-1.5 text-primary hover:underline"
          >
            {copied === rtsp ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy full RTSP URL
          </button>
        </div>
      )}

      <div className="space-y-1">
        <label className={lbl}>RTSP-to-web gateway (go2rtc / MediaMTX)</label>
        <input value={gateway} onChange={e => setGateway(e.target.value)} placeholder="192.168.18.10:1984" className={field} />
        <p className="text-[14px] text-muted-foreground">
          Browsers cannot play RTSP directly. Run the one-line gateway below on any PC on the same Wi-Fi, then enter its address here.
        </p>
        <button
          onClick={() => copy('docker run --rm --network host alexxit/go2rtc')}
          className="w-full text-left text-[14px] px-3 py-2 rounded-lg border border-border hover:border-primary/60 break-all"
        >
          docker run --rm --network host alexxit/go2rtc <span className="text-primary">(click to copy)</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(['hls', 'mjpeg'] as const).map(k => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`text-[14px] font-semibold py-2 rounded-lg border transition-all ${
              kind === k ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground/70 hover:border-primary/50'
            }`}
          >
            {k.toUpperCase()}
          </button>
        ))}
      </div>

      {playUrl && (
        <p className="text-[14px] text-muted-foreground break-all">
          Playback URL: <span className="text-primary">{playUrl.replace(/%3A[^%]*%40/, '%3A•••%40')}</span>
        </p>
      )}

      <button
        onClick={() => playUrl && onConnect(playUrl, kind)}
        disabled={!playUrl}
        className="w-full text-[16px] font-semibold py-3 rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
      >
        <Video className="w-5 h-5" /> Start live stream
      </button>
    </div>
  );
}
