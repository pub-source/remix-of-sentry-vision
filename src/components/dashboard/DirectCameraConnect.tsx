import { useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2, Plug } from 'lucide-react';
import { findStreamForHost, isMixedContentBlocked, rtspTemplates } from '@/lib/cameraDiscovery';

interface Props {
  onConnect: (url: string, kind: 'mjpeg' | 'image') => void;
}

export default function DirectCameraConnect({ onConnect }: Props) {
  const [ip, setIp] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [mac, setMac] = useState('');
  const [user, setUser] = useState('admin');
  const [pass, setPass] = useState('');

  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState<{ url: string; i: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });
  const blocked = isMixedContentBlocked();

  const validIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip.trim());

  const run = async () => {
    if (!validIp) return;
    abortRef.current = { aborted: false };
    setBusy(true);
    setFailed(false);
    const hit = await findStreamForHost(
      ip.trim(),
      (url, i, total) => setTried({ url, i, total }),
      abortRef.current,
    );
    setBusy(false);
    setTried(null);
    if (hit) onConnect(hit.url, hit.kind);
    else setFailed(true);
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  };

  const templates = rtspTemplates(ip.trim() || '192.168.1.50', user || 'admin', pass || 'PASSWORD');

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-1">
        <Plug className="w-3 h-3 text-primary" /> Connect my CCTV by IP
      </label>

      {blocked && (
        <p className="text-[9px] font-mono text-destructive flex items-start gap-1 bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          The preview runs over HTTPS, which blocks plain-HTTP cameras on your Wi-Fi. Use the
          native app build (Capacitor) or open the app over http:// on the same network.
        </p>
      )}

      <div className="space-y-1.5">
        <div className="space-y-0.5">
          <label className="text-[10px] font-mono uppercase text-muted-foreground">ip:</label>
          <input
            value={ip}
            onChange={e => setIp(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder=""
            inputMode="decimal"
            className="w-full text-[11px] font-mono px-2 py-1.5 rounded border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="space-y-0.5">
          <label className="text-[10px] font-mono uppercase text-muted-foreground">device id:</label>
          <input
            value={deviceId}
            onChange={e => setDeviceId(e.target.value.toUpperCase())}
            placeholder=""
            className="w-full text-[11px] font-mono px-2 py-1.5 rounded border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="space-y-0.5">
          <label className="text-[10px] font-mono uppercase text-muted-foreground">mac address:</label>
          <input
            value={mac}
            onChange={e => setMac(e.target.value.toUpperCase().replace(/[^0-9A-F:]/g, ''))}
            placeholder=""
            className="w-full text-[11px] font-mono px-2 py-1.5 rounded border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="grid grid-cols-3 gap-1 pt-1">
          <input
            value={user}
            onChange={e => setUser(e.target.value)}
            placeholder="username"
            className="text-[11px] font-mono px-2 py-1.5 rounded border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            placeholder="password"
            className="text-[11px] font-mono px-2 py-1.5 rounded border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={() => (busy ? (abortRef.current.aborted = true, setBusy(false)) : run())}
            disabled={!validIp && !busy}
            className="text-[10px] font-mono px-2 py-1.5 rounded border bg-primary text-primary-foreground border-primary hover:bg-primary/80 disabled:opacity-50 transition-all"
          >
            {busy ? 'Stop' : 'Connect'}
          </button>
        </div>
        <p className="text-[9px] font-mono text-muted-foreground">
          IP is required. Device ID and MAC are saved with the camera so the native (Capacitor) app can
          re-find it on the Wi-Fi even if its IP changes.
        </p>
      </div>


      {busy && tried && (
        <div className="space-y-1">
          <div className="h-1 rounded bg-secondary/50 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${(tried.i / tried.total) * 100}%` }} />
          </div>
          <p className="text-[9px] font-mono text-muted-foreground flex items-center gap-1 truncate">
            <Loader2 className="w-3 h-3 animate-spin shrink-0" /> Trying {tried.url}
          </p>
        </div>
      )}

      {failed && (
        <div className="space-y-1.5 border border-border rounded p-2 bg-secondary/20">
          <p className="text-[10px] font-mono text-foreground/80">
            No browser-playable stream on {ip}. This camera is most likely <b>RTSP-only</b> — browsers
            can't play RTSP, so run a small gateway on your PC and it will show up here as HLS.
          </p>
          <p className="text-[9px] font-mono text-muted-foreground uppercase">1 — pick your camera's RTSP URL</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {templates.map(t => (
              <button
                key={t.url}
                onClick={() => copy(t.url)}
                className="w-full text-left text-[9px] font-mono px-2 py-1 rounded border border-border hover:border-primary/60 transition-all flex items-center justify-between gap-2"
              >
                <span className="truncate">
                  <span className="text-primary">{t.label}</span> — {t.url}
                </span>
                {copied === t.url ? <Check className="w-3 h-3 text-success shrink-0" /> : <Copy className="w-3 h-3 shrink-0 opacity-60" />}
              </button>
            ))}
          </div>
          <p className="text-[9px] font-mono text-muted-foreground uppercase">2 — run the gateway (one line)</p>
          <button
            onClick={() => copy(`docker run --rm --network host -e RTSP=rtsp://${user || 'admin'}:${pass || 'PASSWORD'}@${ip}:554/live/ch00_0 alexxit/go2rtc`)}
            className="w-full text-left text-[9px] font-mono px-2 py-1 rounded border border-border hover:border-primary/60 break-all"
          >
            docker run --rm --network host -e RTSP=rtsp://{user || 'admin'}:•••@{ip}:554/live/ch00_0 alexxit/go2rtc
            <span className="text-primary"> (click to copy)</span>
          </button>
          <p className="text-[9px] font-mono text-muted-foreground">
            3 — then connect with URL <code className="text-primary">http://&lt;PC-IP&gt;:1984/api/stream.mjpeg?src=RTSP</code> below.
            Full guide in docs/RTSP_GATEWAY_SETUP.md.
          </p>
        </div>
      )}
    </div>
  );
}
