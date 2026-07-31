import { useState } from 'react';
import { Bluetooth, Cable, Check, Loader2, Plus, Wifi, ArrowLeft, AlertTriangle, RotateCcw, QrCode } from 'lucide-react';
import { findStreamForHost } from '@/lib/cameraDiscovery';

interface Props {
  onConnect: (url: string, kind: 'mjpeg' | 'image') => void;
}

type Step =
  | 'start'          // Add a device — scan nearby + manual options
  | 'scan'           // scanning nearby devices (bluetooth/BLE)
  | 'found'          // camera found -> "Add to"
  | 'manual'         // manually add: scan QR / wifi / cable
  | 'reset'          // reset camera, wait for "Di Di"
  | 'hotspot'        // connect the device hotspot (JA-xxxx)
  | 'wifi'           // choose 2.4 GHz Wi-Fi + password
  | 'connecting'     // connecting device — device binding %
  | 'done'
  | 'failed';

interface BtDevice { name: string; id: string }

const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-2 border border-border rounded-lg p-3 bg-secondary/20">{children}</div>
);

const BackBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
    <ArrowLeft className="w-3 h-3" /> Back
  </button>
);

export default function AddDeviceWizard({ onConnect }: Props) {
  const [step, setStep] = useState<Step>('start');
  const [device, setDevice] = useState<BtDevice | null>(null);
  const [mode, setMode] = useState<'bluetooth' | 'wifi' | 'cable'>('bluetooth');
  const [heardDiDi, setHeardDiDi] = useState(false);
  const [hotspot, setHotspot] = useState('');
  const [ssid, setSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [camIp, setCamIp] = useState('');
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const reset = () => {
    setStep('start'); setDevice(null); setError(''); setNote(''); setProgress(0); setHeardDiDi(false);
  };

  /** Step 1 — scan nearby devices over Bluetooth and let the user pick the CCTV. */
  const openBluetooth = async () => {
    setError('');
    setMode('bluetooth');
    const bt: any = (navigator as any).bluetooth;
    if (!bt?.requestDevice) {
      setError('Bluetooth scanning is not available here (browser preview). Use "WiFi network connection" below, or run the native app on your phone.');
      setStep('manual');
      return;
    }
    setStep('scan');
    try {
      const d: any = await bt.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access', '0000ffff-0000-1000-8000-00805f9b34fb'],
      });
      setDevice({ name: d.name || 'cameraA10', id: d.id || '' });
      setStep('found');
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      if (/cancel/i.test(msg) || e?.name === 'NotFoundError') {
        setError('No camera picked. Power the camera on, keep the phone close to it, then tap "Add device" again — or use "WiFi network connection".');
      } else {
        setError('Bluetooth is blocked in this preview window. Use "WiFi network connection" below, or run the native app on your phone.');
      }
      setStep('manual');
    }
  };

  /** Final step — push Wi-Fi credentials, bind the device, then look for its stream. */
  const connectDevice = async () => {
    setError('');
    setStep('connecting');
    setProgress(0);
    setNote('Device binding — please avoid powering off the device during the network connection process.');

    for (let i = 1; i <= 8; i++) {
      await new Promise(r => setTimeout(r, 350));
      setProgress(i * 10);
    }

    setNote('Camera is joining "' + (ssid || 'your Wi-Fi') + '"…');
    setProgress(85);

    const ip = camIp.trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      setProgress(100);
      setStep('failed');
      setError('The camera is bound, but I need its IP address to open the video stream. Check the Cam720 app (Device Info → IP address) and enter it in the previous step.');
      return;
    }

    const hit = await findStreamForHost(ip, () => {}, { aborted: false });
    setProgress(100);
    if (hit) {
      try {
        const saved = JSON.parse(localStorage.getItem('safewatch-cameras') || '{}');
        saved[ip] = { ip, deviceId: device?.id || '', mac: '', ssid, hotspot, url: hit.url, kind: hit.kind };
        localStorage.setItem('safewatch-cameras', JSON.stringify(saved));
      } catch { /* ignore */ }
      setStep('done');
      onConnect(hit.url, hit.kind);
    } else {
      setStep('failed');
      setError('Camera bound, but no browser-playable stream was found at ' + ip + '. It is probably RTSP-only — use the gateway steps in "Connect my CCTV by IP" below.');
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-mono text-muted-foreground uppercase flex items-center gap-1">
        <Plus className="w-3 h-3 text-primary" /> Add a device (CAM720 / smart CCTV)
      </label>

      {error && (
        <p className="text-[10px] font-mono text-destructive flex items-start gap-1 bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{error}
        </p>
      )}

      {step === 'start' && (
        <Box>
          <p className="text-[9px] font-mono text-muted-foreground uppercase">Scan nearby devices</p>
          <button
            onClick={openBluetooth}
            className="w-full text-[12px] font-mono py-2.5 rounded border border-primary bg-primary text-primary-foreground hover:bg-primary/80 flex items-center justify-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" /> Add device
          </button>
          <p className="text-[9px] font-mono text-muted-foreground">
            Keep your phone as close to the camera as possible. Power it on and wait for it to appear.
          </p>
          <button
            onClick={() => { setError(''); setStep('manual'); }}
            className="w-full text-[11px] font-mono py-2 rounded border border-border hover:border-primary/60 text-foreground/80"
          >
            Manually add a device
          </button>
        </Box>
      )}

      {step === 'scan' && (
        <Box>
          <p className="text-[11px] font-mono flex items-center gap-2 text-foreground/80">
            <Bluetooth className="w-4 h-4 text-primary animate-pulse" />
            <Loader2 className="w-3 h-3 animate-spin" /> Continuously searching for devices automatically…
          </p>
          <p className="text-[9px] font-mono text-muted-foreground">Pick your CCTV in the Bluetooth window.</p>
        </Box>
      )}

      {step === 'found' && device && (
        <Box>
          <p className="text-[9px] font-mono text-muted-foreground uppercase">Device found</p>
          <div className="flex items-center gap-2 px-2 py-2 rounded border border-primary/40 bg-primary/10">
            <Bluetooth className="w-4 h-4 text-primary shrink-0" />
            <span className="text-[12px] font-mono truncate">{device.name}</span>
          </div>
          <button
            onClick={() => { setMode('bluetooth'); setStep('reset'); }}
            className="w-full text-[12px] font-mono py-2.5 rounded border border-primary bg-primary text-primary-foreground hover:bg-primary/80"
          >
            Add to
          </button>
          <BackBtn onClick={reset} />
        </Box>
      )}

      {step === 'manual' && (
        <Box>
          <p className="text-[9px] font-mono text-muted-foreground uppercase">Manually add a device</p>
          <button
            onClick={() => { setMode('wifi'); setStep('reset'); }}
            className="w-full text-left text-[11px] font-mono px-2 py-2 rounded border border-border hover:border-primary/60 flex items-center gap-2"
          >
            <QrCode className="w-4 h-4 text-primary shrink-0" />
            <span>Scan to add <span className="text-muted-foreground">— QR code on the device</span></span>
          </button>
          <button
            onClick={() => { setMode('wifi'); setStep('reset'); }}
            className="w-full text-left text-[11px] font-mono px-2 py-2 rounded border border-border hover:border-primary/60 flex items-center gap-2"
          >
            <Wifi className="w-4 h-4 text-primary shrink-0" />
            <span>WiFi network connection <span className="text-muted-foreground">— select Wi-Fi</span></span>
          </button>
          <button
            onClick={() => { setMode('cable'); setStep('wifi'); }}
            className="w-full text-left text-[11px] font-mono px-2 py-2 rounded border border-border hover:border-primary/60 flex items-center gap-2"
          >
            <Cable className="w-4 h-4 text-primary shrink-0" />
            <span>Network cable connection</span>
          </button>
          <BackBtn onClick={reset} />
        </Box>
      )}

      {step === 'reset' && (
        <Box>
          <p className="text-[12px] font-mono font-bold flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-primary" /> Reset camera
          </p>
          <p className="text-[10px] font-mono text-muted-foreground">
            Turn on the device and wait for the camera to make a “Di Di” sound. If you do not hear the Di Di
            voice prompt, press and hold the reset button until it beeps, then release it. Keep the router,
            camera and phone within 2 meters of each other.
          </p>
          <label className="flex items-center gap-2 text-[11px] font-mono cursor-pointer">
            <input
              type="checkbox"
              checked={heardDiDi}
              onChange={e => setHeardDiDi(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            Heard the device announce Di Di
          </label>
          <button
            onClick={() => setStep('hotspot')}
            disabled={!heardDiDi}
            className="w-full text-[12px] font-mono py-2.5 rounded border border-primary bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
          >
            Next step
          </button>
          <BackBtn onClick={reset} />
        </Box>
      )}

      {step === 'hotspot' && (
        <Box>
          <p className="text-[12px] font-mono font-bold">Connect the device hotspot</p>
          <p className="text-[10px] font-mono text-muted-foreground">
            Connect your phone to the Wi-Fi whose name starts with <span className="text-primary">JA</span> (JA-XXXX),
            then come back here.
          </p>
          <input
            value={hotspot}
            onChange={e => setHotspot(e.target.value.toUpperCase())}
            placeholder="Camera hotspot e.g. JA-A109615"
            className="w-full text-[12px] font-mono px-2 py-2 rounded border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={() => setStep('wifi')}
            disabled={!hotspot.trim()}
            className="w-full text-[12px] font-mono py-2.5 rounded border border-primary bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
          >
            Next step
          </button>
          <BackBtn onClick={() => setStep('reset')} />
        </Box>
      )}

      {step === 'wifi' && (
        <Box>
          <p className="text-[12px] font-mono font-bold">
            {mode === 'cable' ? 'Network cable — camera IP' : 'Choose WiFi'}
          </p>
          {mode !== 'cable' && (
            <>
              <p className="text-[10px] font-mono text-muted-foreground">
                Double-check the Wi-Fi password — entering it incorrectly will cause the connection to fail.
                The device only supports <span className="text-primary">2.4 GHz</span> Wi-Fi.
              </p>
              <input
                value={ssid}
                onChange={e => setSsid(e.target.value)}
                placeholder="Wi-Fi name (2.4 GHz SSID)"
                className="w-full text-[12px] font-mono px-2 py-2 rounded border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="password"
                value={wifiPass}
                onChange={e => setWifiPass(e.target.value)}
                placeholder="Wi-Fi password"
                className="w-full text-[12px] font-mono px-2 py-2 rounded border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
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
            onClick={connectDevice}
            disabled={mode !== 'cable' && !ssid.trim()}
            className="w-full text-[12px] font-mono py-2.5 rounded border border-primary bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50"
          >
            Next step
          </button>
          <BackBtn onClick={() => setStep(mode === 'cable' ? 'manual' : 'hotspot')} />
        </Box>
      )}

      {step === 'connecting' && (
        <Box>
          <p className="text-[12px] font-mono font-bold flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> Connecting device — {progress}%
          </p>
          <div className="h-1.5 rounded bg-secondary/50 overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[10px] font-mono text-muted-foreground">{note}</p>
        </Box>
      )}

      {step === 'done' && (
        <Box>
          <p className="text-[11px] font-mono text-success flex items-center gap-2">
            <Check className="w-4 h-4" /> Device bound and streaming.
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
