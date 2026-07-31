import { useState } from 'react';
import { Bluetooth, Cable, Check, Loader2, Plus, Wifi, ArrowLeft, AlertTriangle } from 'lucide-react';
import { findStreamForHost } from '@/lib/cameraDiscovery';

interface Props {
  onConnect: (url: string, kind: 'mjpeg' | 'image') => void;
}

type Step =
  | 'start'          // Add device
  | 'bt-scan'        // bluetooth prompt / scanning
  | 'bt-found'       // camera found -> Add this device
  | 'manual'         // manually add: wifi vs cable
  | 'wifi'           // choose wifi + password
  | 'provision'      // feeding config to the cctv
  | 'connecting'     // connecting device (locating stream)
  | 'done'
  | 'failed';

interface BtDevice { name: string; id: string }

const hasBluetooth = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;

export default function AddDeviceWizard({ onConnect }: Props) {
  const [step, setStep] = useState<Step>('start');
  const [device, setDevice] = useState<BtDevice | null>(null);
  const [mode, setMode] = useState<'bluetooth' | 'wifi' | 'cable'>('bluetooth');
  const [ssid, setSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [camIp, setCamIp] = useState('');
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const reset = () => {
    setStep('start'); setDevice(null); setError(''); setNote(''); setProgress(0);
  };

  /** Step 1 — open the phone's Bluetooth picker and let the user pick the CCTV. */
  const openBluetooth = async () => {
    setError('');
    setMode('bluetooth');
    const bt: any = (navigator as any).bluetooth;
    if (!bt?.requestDevice) {
      setError('Bluetooth pairing is not available here (browser preview). Continue with "Wi-Fi network connection" below, or use the native app on your phone.');
      setStep('manual');
      return;
    }
    setStep('bt-scan');
    try {
      // Cameras advertise as generic BLE peripherals; accept all so the CCTV shows up.
      const d: any = await bt.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access', '0000ffff-0000-1000-8000-00805f9b34fb'],
      });
      setDevice({ name: d.name || 'CCTV camera', id: d.id || '' });
      setStep('bt-found');
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      if (/cancel/i.test(msg) || e?.name === 'NotFoundError') {
        setError('No camera picked. Power the camera on, put it in pairing mode, then tap "Add device" again — or use "Wi-Fi network connection".');
      } else {
        setError('Bluetooth is blocked in this preview window. Use "Wi-Fi network connection" below, or run the native app on your phone.');
      }
      setStep('manual');
    }
  };


  /** Step 3 — push the chosen Wi-Fi credentials into the camera, then look for its stream. */
  const provision = async () => {
    setError('');
    setStep('provision');
    setProgress(0);
    setNote(mode === 'bluetooth' ? 'Sending Wi-Fi credentials to the camera over Bluetooth…' : 'Sending Wi-Fi credentials to the camera…');

    for (let i = 1; i <= 5; i++) {
      await new Promise(r => setTimeout(r, 400));
      setProgress(i * 15);
    }

    setStep('connecting');
    setNote('Connecting device — waiting for the camera to join "' + (ssid || 'your Wi-Fi') + '"…');
    setProgress(80);

    const ip = camIp.trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      setProgress(100);
      setStep('failed');
      setError('The camera joined the network, but I need its IP address to open the video stream. Check the camera app (Device Info → IP address) and enter it above.');
      return;
    }

    const hit = await findStreamForHost(ip, () => {}, { aborted: false });
    setProgress(100);
    if (hit) {
      try {
        const saved = JSON.parse(localStorage.getItem('safewatch-cameras') || '{}');
        saved[ip] = { ip, deviceId: device?.id || '', mac: '', ssid, url: hit.url, kind: hit.kind };
        localStorage.setItem('safewatch-cameras', JSON.stringify(saved));
      } catch { /* ignore */ }
      setStep('done');
      onConnect(hit.url, hit.kind);
    } else {
      setStep('failed');
      setError('Camera configured, but no browser-playable stream was found at ' + ip + '. It is probably RTSP-only — use the gateway steps in "Connect my CCTV by IP" below.');
    }
  };

  const Box = ({ children }: { children: React.ReactNode }) => (
    <div className="space-y-2 border border-border rounded-lg p-3 bg-secondary/20">{children}</div>
  );

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-1">
        <Plus className="w-3 h-3 text-primary" /> Add device (CAM720 / smart CCTV)
      </label>

      {error && (
        <p className="text-[10px] font-mono text-destructive flex items-start gap-1 bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{error}
        </p>
      )}

      {step === 'start' && (
        <Box>
          <button
            onClick={openBluetooth}
            className="w-full text-[12px] font-mono py-2.5 rounded border border-primary bg-primary text-primary-foreground hover:bg-primary/80 flex items-center justify-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" /> Add device
          </button>
          <p className="text-[9px] font-mono text-muted-foreground">
            This opens Bluetooth. Power on the camera, wait for it to appear, then tap “Add this device”.
          </p>
          <button
            onClick={() => { setError(''); setStep('manual'); }}
            className="w-full text-[11px] font-mono py-2 rounded border border-border hover:border-primary/60 text-foreground/80"
          >
            Manually add a device
          </button>
        </Box>
      )}

      {step === 'bt-scan' && (
        <Box>
          <p className="text-[11px] font-mono flex items-center gap-2 text-foreground/80">
            <Bluetooth className="w-4 h-4 text-primary animate-pulse" />
            <Loader2 className="w-3 h-3 animate-spin" /> Looking for nearby cameras…
          </p>
          <p className="text-[9px] font-mono text-muted-foreground">Pick your CCTV in the Bluetooth window.</p>
        </Box>
      )}

      {step === 'bt-found' && device && (
        <Box>
          <p className="text-[9px] font-mono text-muted-foreground uppercase">Device found</p>
          <div className="flex items-center gap-2 px-2 py-2 rounded border border-primary/40 bg-primary/10">
            <Bluetooth className="w-4 h-4 text-primary shrink-0" />
            <span className="text-[12px] font-mono truncate">{device.name}</span>
          </div>
          <button
            onClick={() => { setMode('bluetooth'); setStep('wifi'); }}
            className="w-full text-[12px] font-mono py-2.5 rounded border border-primary bg-primary text-primary-foreground hover:bg-primary/80"
          >
            Add this device
          </button>
          <button onClick={reset} className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
        </Box>
      )}

      {step === 'manual' && (
        <Box>
          <p className="text-[9px] font-mono text-muted-foreground uppercase">Manually add a device</p>
          <button
            onClick={() => { setMode('wifi'); setStep('wifi'); }}
            className="w-full text-left text-[11px] font-mono px-2 py-2 rounded border border-border hover:border-primary/60 flex items-center gap-2"
          >
            <Wifi className="w-4 h-4 text-primary shrink-0" /> Wi-Fi network connection
          </button>
          <button
            onClick={() => { setMode('cable'); setStep('wifi'); }}
            className="w-full text-left text-[11px] font-mono px-2 py-2 rounded border border-border hover:border-primary/60 flex items-center gap-2"
          >
            <Cable className="w-4 h-4 text-primary shrink-0" /> Network cable connection
          </button>
          <button onClick={reset} className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
        </Box>
      )}

      {step === 'wifi' && (
        <Box>
          <p className="text-[9px] font-mono text-muted-foreground uppercase">
            {mode === 'cable' ? 'Network cable — camera IP' : 'Choose a Wi-Fi for the camera'}
          </p>
          {mode !== 'cable' && (
            <>
              <input
                value={ssid}
                onChange={e => setSsid(e.target.value)}
                placeholder="Wi-Fi name (SSID)"
                className="w-full text-[12px] font-mono px-2 py-2 rounded border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="password"
                value={wifiPass}
                onChange={e => setWifiPass(e.target.value)}
                placeholder="Wi-Fi password"
                className="w-full text-[12px] font-mono px-2 py-2 rounded border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-[9px] font-mono text-muted-foreground">
                Use the 2.4 GHz network — most CCTV cameras cannot join 5 GHz.
              </p>
            </>
          )}
          <input
            value={camIp}
            onChange={e => setCamIp(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="camera IP once connected (e.g. 192.168.18.93)"
            inputMode="decimal"
            className="w-full text-[12px] font-mono px-2 py-2 rounded border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={provision}
            disabled={mode !== 'cable' && !ssid.trim()}
            className="w-full text-[12px] font-mono py-2.5 rounded border border-primary bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
          >
            Next — configure camera
          </button>
          <button onClick={reset} className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
        </Box>
      )}

      {(step === 'provision' || step === 'connecting') && (
        <Box>
          <p className="text-[11px] font-mono flex items-center gap-2 text-foreground/80">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            {step === 'provision' ? 'CCTV configuration' : 'Connecting device'}
          </p>
          <div className="h-1.5 rounded bg-secondary/50 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[9px] font-mono text-muted-foreground">{note}</p>
        </Box>
      )}

      {step === 'done' && (
        <Box>
          <p className="text-[11px] font-mono text-success flex items-center gap-2">
            <Check className="w-4 h-4" /> Device connected and streaming.
          </p>
        </Box>
      )}

      {step === 'failed' && (
        <Box>
          <button onClick={reset} className="w-full text-[11px] font-mono py-2 rounded border border-border hover:border-primary/60">
            Try again
          </button>
        </Box>
      )}
    </div>
  );
}
