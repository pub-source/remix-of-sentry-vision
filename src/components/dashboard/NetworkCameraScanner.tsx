import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Radar, Video } from 'lucide-react';
import {
  scanNetworkForCameras,
  detectLocalSubnets,
  isMixedContentBlocked,
  COMMON_SUBNETS,
  type DiscoveredCamera,
} from '@/lib/cameraDiscovery';

interface Props {
  onSelect: (url: string, kind: 'mjpeg' | 'image' | 'hls') => void;
}

export default function NetworkCameraScanner({ onSelect }: Props) {
  const [subnets, setSubnets] = useState<string[]>(['192.168.1']);
  const [selected, setSelected] = useState<string[]>(['192.168.1']);
  const [extra, setExtra] = useState('');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [found, setFound] = useState<DiscoveredCamera[]>([]);
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });
  const blocked = isMixedContentBlocked();

  useEffect(() => {
    detectLocalSubnets().then(detected => {
      const all = Array.from(new Set([...detected, ...COMMON_SUBNETS]));
      setSubnets(all);
      setSelected(detected.length ? detected : ['192.168.1', '192.168.0']);
    });
    return () => { abortRef.current.aborted = true; };
  }, []);

  const toggle = (s: string) =>
    setSelected(prev => (prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]));

  const startScan = async () => {
    const list = Array.from(new Set([...selected, ...extra.split(',').map(s => s.trim()).filter(Boolean)]));
    if (!list.length) return;
    abortRef.current = { aborted: false };
    setFound([]);
    setProgress(0);
    setScanning(true);
    await scanNetworkForCameras({
      subnets: list,
      signal: abortRef.current,
      onProgress: (done, total) => setProgress(Math.round((done / total) * 100)),
      onFound: cam => setFound(prev => [...prev, cam]),
    });
    setScanning(false);
  };

  const stopScan = () => { abortRef.current.aborted = true; setScanning(false); };

  const playable = found.filter(c => c.playable);
  const others = found.filter(c => !c.playable);

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-1">
        <Radar className="w-3 h-3 text-primary" /> Scan your Wi-Fi for cameras
      </label>

      {blocked && (
        <p className="text-[9px] font-mono text-destructive flex items-start gap-1 bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          This page is HTTPS, so the browser blocks plain-HTTP cameras on your LAN. Open the app over
          http:// (or use the native/Capacitor build) for the scan and live feed to work.
        </p>
      )}

      <div className="flex flex-wrap gap-1">
        {subnets.map(s => (
          <button
            key={s}
            onClick={() => toggle(s)}
            className={`text-[10px] font-mono px-2 py-1 rounded border transition-all ${
              selected.includes(s)
                ? 'bg-primary/20 border-primary text-primary'
                : 'bg-secondary/30 border-border text-muted-foreground hover:border-primary/50'
            }`}
          >
            {s}.x
          </button>
        ))}
      </div>

      <div className="flex gap-1">
        <input
          value={extra}
          onChange={e => setExtra(e.target.value.replace(/[^0-9.,]/g, ''))}
          placeholder="add subnet e.g. 192.168.2"
          className="flex-1 text-[11px] font-mono px-2 py-1.5 rounded border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={scanning ? stopScan : startScan}
          className={`text-[10px] font-mono px-3 py-1.5 rounded border transition-all ${
            scanning
              ? 'bg-destructive/20 border-destructive/50 text-destructive'
              : 'bg-primary text-primary-foreground border-primary hover:bg-primary/80'
          }`}
        >
          {scanning ? 'Stop' : 'Scan'}
        </button>
      </div>

      {scanning && (
        <div className="space-y-1">
          <div className="h-1 rounded bg-secondary/50 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[9px] font-mono text-muted-foreground flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Probing {selected.join(', ')} … {progress}%
          </p>
        </div>
      )}

      {playable.length > 0 && (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {playable.map(cam => (
            <button
              key={cam.url}
              onClick={() => onSelect(cam.url, cam.kind === 'unknown' ? 'mjpeg' : cam.kind)}
              className="w-full text-left text-[10px] font-mono px-2 py-1.5 rounded border border-success/40 bg-success/10 text-success hover:border-success transition-all"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate flex items-center gap-1">
                  <Video className="w-3 h-3 shrink-0" /> {cam.host}:{cam.port}{cam.path}
                </span>
                <span className="text-[8px] px-1 py-0.5 rounded bg-success/20 shrink-0">
                  {cam.kind.toUpperCase()}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <details className="text-[9px] font-mono text-muted-foreground">
          <summary className="cursor-pointer">
            {others.length} other device(s) responding — no known camera path
          </summary>
          <div className="mt-1 space-y-1 max-h-24 overflow-y-auto">
            {others.map(cam => (
              <button
                key={cam.url}
                onClick={() => onSelect(cam.url, 'mjpeg')}
                className="w-full text-left px-2 py-1 rounded border border-border bg-secondary/30 hover:border-primary/50"
              >
                {cam.host}:{cam.port} — try manually
              </button>
            ))}
          </div>
        </details>
      )}

      {!scanning && found.length === 0 && progress > 0 && (
        <p className="text-[9px] font-mono text-muted-foreground italic">
          Nothing answered. Make sure your phone/PC is on the same Wi-Fi as the camera, try another
          subnet above, or the camera may be RTSP-only — see docs/RTSP_GATEWAY_SETUP.md.
        </p>
      )}

      <p className="text-[9px] font-mono text-muted-foreground italic">
        Probes every address on the selected Wi-Fi subnets for cameras serving an HTTP snapshot/MJPEG
        stream. RTSP-only cameras (V380, Hikvision, Dahua) still need a gateway.
      </p>
    </div>
  );
}
