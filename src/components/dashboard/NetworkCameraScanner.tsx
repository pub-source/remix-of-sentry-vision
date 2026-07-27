import { useEffect, useRef, useState } from 'react';
import { Loader2, Radar, Video } from 'lucide-react';
import {
  scanNetworkForCameras,
  guessLocalSubnet,
  type DiscoveredCamera,
} from '@/lib/cameraDiscovery';

interface Props {
  onSelect: (url: string, kind: 'mjpeg' | 'image' | 'hls') => void;
}

export default function NetworkCameraScanner({ onSelect }: Props) {
  const [subnet, setSubnet] = useState('192.168.1');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [found, setFound] = useState<DiscoveredCamera[]>([]);
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });

  useEffect(() => {
    guessLocalSubnet().then(setSubnet);
    return () => { abortRef.current.aborted = true; };
  }, []);

  const startScan = async () => {
    abortRef.current = { aborted: false };
    setFound([]);
    setProgress(0);
    setScanning(true);
    await scanNetworkForCameras({
      subnet,
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
        <Radar className="w-3 h-3 text-primary" /> Scan Wi-Fi network for cameras
      </label>

      <div className="flex gap-1">
        <input
          value={subnet}
          onChange={e => setSubnet(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="192.168.1"
          className="flex-1 text-[11px] font-mono px-2 py-1.5 rounded border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <span className="text-[11px] font-mono self-center text-muted-foreground">.1–254</span>
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
            <Loader2 className="w-3 h-3 animate-spin" /> Probing {subnet}.1–254 … {progress}%
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
          Nothing answered on {subnet}.x. Check the subnet matches your Wi-Fi, or the camera only speaks RTSP — see docs/RTSP_GATEWAY_SETUP.md.
        </p>
      )}

      <p className="text-[9px] font-mono text-muted-foreground italic">
        Scans your local network from this browser for cameras exposing an HTTP snapshot/MJPEG stream. RTSP-only cameras (V380, Hikvision, Dahua) still need a gateway.
      </p>
    </div>
  );
}
