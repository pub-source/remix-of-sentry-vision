import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, Plus, Trash2, Play, Square, Video, Wifi, WifiOff, Save, X, Brain, Circle, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCameraRegistry } from '@/hooks/useCameraRegistry';
import {
  getMultiStatus, syncCameras, startAll, stopAll, startCamera, stopCamera, testCamera,
  backendHint, type BackendStatus,
} from '@/lib/multiCamServer';
import type { CameraConfig } from '@/types/multicam';
import { hlsUrlFor } from '@/types/multicam';

const emptyForm = { name: '', location: '', rtspUrl: '', aiEnabled: true, recording: false };

export default function Cameras() {
  const navigate = useNavigate();
  const { cameras, settings, addCamera, updateCamera, deleteCamera, updateSettings } = useCameraRegistry();
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [backend, setBackend] = useState<BackendStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const hint = backendHint(settings.pythonServer);

  // Poll backend status
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const s = await getMultiStatus(settings.pythonServer);
        if (!stop) setBackend(s);
      } catch {
        if (!stop) setBackend(null);
      }
    };
    void poll();
    const id = window.setInterval(poll, 3000);
    return () => { stop = true; window.clearInterval(id); };
  }, [settings.pythonServer]);

  const backendFor = (id: string) => backend?.cameras.find(c => c.id === id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.rtspUrl.trim()) {
      toast.error('Camera name and RTSP URL are required');
      return;
    }
    if (!editing && cameras.length >= settings.maxCameras) {
      toast.error(`Maximum of ${settings.maxCameras} cameras reached`);
      return;
    }
    if (editing) {
      updateCamera(editing, { ...form });
      toast.success('Camera updated');
    } else {
      addCamera({ ...form, enabled: true });
      toast.success('Camera added');
    }
    setForm(emptyForm);
    setEditing(null);
  };

  const withBusy = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Backend request failed');
    } finally {
      setBusy(false);
    }
  };

  const push = () => withBusy(() => syncCameras(settings.pythonServer, cameras), 'Cameras synced to server');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur-sm px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 group">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-lg font-bold group-hover:text-primary transition-colors">MSDSystem</h1>
        </button>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[14px] font-semibold ${
            backend ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'
          }`}>
            {backend ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {backend ? `Server online${backend.whisper ? ' · Whisper' : ''}` : 'Server offline'}
          </span>
          <button
            onClick={() => navigate('/monitoring')}
            className="flex items-center gap-1.5 text-[15px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-full"
          >
            <Video className="w-4 h-4" /> Monitoring
          </button>
        </div>
      </header>

      <main className="p-4 max-w-6xl mx-auto space-y-6">
        <h2 className="text-2xl font-bold">Camera Management</h2>
        {hint && <p className="text-[15px] text-warning bg-warning/10 rounded-lg p-3">{hint}</p>}

        {/* Server settings */}
        <section className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-[17px] font-bold">Server &amp; detection settings</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[14px] font-semibold">Python server (RTSP + Whisper)</span>
              <input
                value={settings.pythonServer}
                onChange={e => updateSettings({ pythonServer: e.target.value })}
                className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-[15px]"
              />
            </label>
            <label className="block">
              <span className="text-[14px] font-semibold">MediaMTX HLS host</span>
              <input
                value={settings.mediamtxHost}
                onChange={e => updateSettings({ mediamtxHost: e.target.value })}
                className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-[15px]"
              />
            </label>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {([
              ['Fire sensitivity', 'fireThreshold'],
              ['Object confidence', 'objectThreshold'],
              ['Audio distress confidence', 'audioThreshold'],
            ] as const).map(([label, key]) => (
              <label key={key} className="block">
                <span className="text-[14px] font-semibold">
                  {label}: {(settings[key] * 100).toFixed(0)}%
                </span>
                <input
                  type="range" min={0.1} max={0.95} step={0.05}
                  value={settings[key]}
                  onChange={e => updateSettings({ [key]: Number(e.target.value) })}
                  className="w-full mt-2 accent-primary"
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={push} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-[15px] font-bold disabled:opacity-50">
              <RefreshCw className="w-4 h-4" /> Sync cameras to server
            </button>
            <button onClick={() => withBusy(() => startAll(settings.pythonServer), 'All cameras started')} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-success/15 text-success text-[15px] font-bold disabled:opacity-50">
              <Play className="w-4 h-4" /> Start all
            </button>
            <button onClick={() => withBusy(() => stopAll(settings.pythonServer), 'All cameras stopped')} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-destructive/15 text-destructive text-[15px] font-bold disabled:opacity-50">
              <Square className="w-4 h-4" /> Stop all
            </button>
          </div>
        </section>

        {/* Add / edit camera */}
        <section className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-[17px] font-bold mb-3">{editing ? 'Edit camera' : 'Add a camera'}</h3>
          <form onSubmit={submit} className="grid md:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-[14px] font-semibold">Camera name</span>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Front Door"
                className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-[15px]"
              />
            </label>
            <label className="block">
              <span className="text-[14px] font-semibold">Location</span>
              <input
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="Living room"
                className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-[15px]"
              />
            </label>
            <label className="block">
              <span className="text-[14px] font-semibold">RTSP URL</span>
              <input
                value={form.rtspUrl}
                onChange={e => setForm(f => ({ ...f, rtspUrl: e.target.value }))}
                placeholder="rtsp://user:pass@192.168.1.50:554/stream1"
                className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-[15px]"
              />
            </label>
            <div className="md:col-span-3 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-[15px] font-semibold">
                <input type="checkbox" checked={form.aiEnabled}
                  onChange={e => setForm(f => ({ ...f, aiEnabled: e.target.checked }))}
                  className="w-4 h-4 accent-primary" />
                Enable AI detection
              </label>
              <label className="flex items-center gap-2 text-[15px] font-semibold">
                <input type="checkbox" checked={form.recording}
                  onChange={e => setForm(f => ({ ...f, recording: e.target.checked }))}
                  className="w-4 h-4 accent-primary" />
                Record stream
              </label>
              <button type="submit"
                className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[15px] font-bold">
                {editing ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {editing ? 'Save changes' : 'Add camera'}
              </button>
              {editing && (
                <button type="button" onClick={() => { setEditing(null); setForm(emptyForm); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-[15px] font-semibold">
                  <X className="w-4 h-4" /> Cancel
                </button>
              )}
              <button type="button" disabled={!form.rtspUrl || busy}
                onClick={() => withBusy(async () => {
                  const r = await testCamera(settings.pythonServer, form.rtspUrl);
                  if (!r.success) throw new Error(r.error || 'Could not reach camera');
                }, 'Camera reachable')}
                className="px-3 py-2 rounded-lg bg-muted text-[15px] font-semibold disabled:opacity-50">
                Test connection
              </button>
            </div>
          </form>
          <p className="text-[14px] text-muted-foreground mt-2">
            {cameras.length} / {settings.maxCameras} cameras configured.
          </p>
        </section>

        {/* Camera list */}
        <section className="space-y-3">
          {cameras.length === 0 && (
            <p className="text-[15px] text-muted-foreground">No cameras yet — add your first CCTV above.</p>
          )}
          {cameras.map((cam: CameraConfig) => {
            const b = backendFor(cam.id);
            return (
              <div key={cam.id} className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-[180px] flex-1">
                  <div className="text-[16px] font-bold">{cam.name}</div>
                  <div className="text-[14px] text-muted-foreground">{cam.location || 'No location'}</div>
                  <div className="text-[13px] font-mono text-muted-foreground break-all">{cam.rtspUrl}</div>
                  <div className="text-[13px] font-mono text-muted-foreground break-all">{hlsUrlFor(cam, settings)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-[13px] font-semibold ${
                    b?.hls_ready ? 'bg-success/15 text-success' : b?.ffmpeg ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground'
                  }`}>
                    {b?.hls_ready ? 'Streaming' : b?.ffmpeg ? 'Starting' : 'Stopped'}
                  </span>
                  <button onClick={() => updateCamera(cam.id, { enabled: !cam.enabled })}
                    className={`px-2.5 py-1 rounded-full text-[13px] font-semibold ${
                      cam.enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                    {cam.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button onClick={() => updateCamera(cam.id, { aiEnabled: !cam.aiEnabled })}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-semibold ${
                      cam.aiEnabled ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground'
                    }`}>
                    <Brain className="w-3.5 h-3.5" /> AI
                  </button>
                  <button onClick={() => updateCamera(cam.id, { recording: !cam.recording })}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-semibold ${
                      cam.recording ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'
                    }`}>
                    <Circle className="w-3 h-3" /> REC
                  </button>
                  <button onClick={() => withBusy(() => startCamera(settings.pythonServer, cam.id), `${cam.name} started`)}
                    disabled={busy} className="p-2 rounded-lg bg-muted hover:bg-muted/70" title="Start stream">
                    <Play className="w-4 h-4" />
                  </button>
                  <button onClick={() => withBusy(() => stopCamera(settings.pythonServer, cam.id), `${cam.name} stopped`)}
                    disabled={busy} className="p-2 rounded-lg bg-muted hover:bg-muted/70" title="Stop stream">
                    <Square className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setEditing(cam.id); setForm({ name: cam.name, location: cam.location, rtspUrl: cam.rtspUrl, aiEnabled: cam.aiEnabled, recording: cam.recording }); }}
                    className="px-3 py-2 rounded-lg bg-muted text-[14px] font-semibold">Edit</button>
                  <button onClick={() => { deleteCamera(cam.id); toast.success('Camera removed'); }}
                    className="p-2 rounded-lg bg-destructive/10 text-destructive" title="Delete camera">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {b?.error && <p className="w-full text-[14px] text-destructive">{b.error}</p>}
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
