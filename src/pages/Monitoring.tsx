import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Grid2x2, Grid3x3, Square, X, Settings2, Camera, Filter, Trash2 } from 'lucide-react';
import { useCameraRegistry } from '@/hooks/useCameraRegistry';
import CameraTile from '@/components/multicam/CameraTile';
import type { DetectionEvent, GridLayout } from '@/types/multicam';

const layoutClass: Record<GridLayout, string> = {
  '1x1': 'grid-cols-1',
  '2x2': 'grid-cols-1 md:grid-cols-2',
  '3x3': 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
  '4x4': 'grid-cols-2 xl:grid-cols-4',
};

const typeIcon: Record<string, string> = {
  fire: '🔥', smoke: '💨', human: '🧍', object: '📦',
  'face-distress': '😨', 'audio-distress': '🗣️', saliency: '✨',
};

export default function Monitoring() {
  const navigate = useNavigate();
  const { cameras, settings, events, updateSettings, addEvent, clearEvents } = useCameraRegistry();
  const [focused, setFocused] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const active = useMemo(() => cameras.filter(c => c.enabled), [cameras]);
  const visible = focused ? active.filter(c => c.id === focused) : active;
  const filtered = filter === 'all' ? events : events.filter(e => e.cameraId === filter);
  const alerts = filtered.filter(e => ['fire', 'smoke', 'face-distress', 'audio-distress'].includes(e.type));

  const handleEvent = (evt: Omit<DetectionEvent, 'id'>) =>
    addEvent({ ...evt, id: crypto.randomUUID() });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur-sm px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 group">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-lg font-bold tracking-tight group-hover:text-primary transition-colors">MSDSystem</h1>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-muted-foreground">
            {active.length} camera{active.length === 1 ? '' : 's'} monitoring
          </span>
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
            {(['1x1', '2x2', '3x3', '4x4'] as GridLayout[]).map(l => (
              <button
                key={l}
                onClick={() => { updateSettings({ gridLayout: l }); setFocused(null); }}
                className={`px-2.5 py-1 rounded text-[14px] font-semibold transition-colors ${
                  settings.gridLayout === l && !focused ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                }`}
                title={`${l} grid`}
              >
                {l === '1x1' ? <Square className="w-4 h-4" /> : l === '2x2' ? <Grid2x2 className="w-4 h-4" /> : l === '3x3' ? <Grid3x3 className="w-4 h-4" /> : l}
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate('/cameras')}
            className="flex items-center gap-1.5 text-[15px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-full"
          >
            <Settings2 className="w-4 h-4" /> Cameras
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-[15px] font-semibold text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-full"
          >
            <Camera className="w-4 h-4" /> Dashboard
          </button>
        </div>
      </header>

      <main className="p-4 grid lg:grid-cols-[1fr_360px] gap-4">
        <section>
          {focused && (
            <button
              onClick={() => setFocused(null)}
              className="mb-3 flex items-center gap-1.5 text-[15px] font-semibold text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" /> Exit single-camera view
            </button>
          )}
          {active.length === 0 ? (
            <div className="border border-dashed border-border rounded-lg p-10 text-center">
              <p className="text-[17px] font-semibold mb-2">No cameras enabled yet</p>
              <p className="text-[15px] text-muted-foreground mb-4">
                Add your CCTV cameras to start independent multimodal detection on each feed.
              </p>
              <button
                onClick={() => navigate('/cameras')}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-[15px] font-bold"
              >
                Add a camera
              </button>
            </div>
          ) : (
            <div className={`grid gap-4 ${focused ? 'grid-cols-1' : layoutClass[settings.gridLayout]}`}>
              {visible.map(cam => (
                <CameraTile
                  key={cam.id}
                  camera={cam}
                  settings={settings}
                  onEvent={handleEvent}
                  onExpand={id => setFocused(prev => (prev === id ? null : id))}
                />
              ))}
            </div>
          )}
        </section>

        {/* Alerts + Event history */}
        <aside className="space-y-4">
          <div className="bg-card border border-border rounded-lg">
            <div className="px-3 py-2 border-b border-border flex items-center gap-2">
              <span className="text-[15px] font-bold">Alerts</span>
              <span className="text-[13px] text-muted-foreground">{alerts.length}</span>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-border">
              {alerts.length === 0 && (
                <p className="p-3 text-[14px] text-muted-foreground">No alerts yet.</p>
              )}
              {alerts.slice(0, 40).map(a => (
                <div key={a.id} className="p-3">
                  <div className="text-[15px] font-bold">
                    {typeIcon[a.type]} {a.label}
                  </div>
                  <div className="text-[14px] text-muted-foreground">
                    Camera: <span className="font-semibold text-foreground">{a.cameraName}</span>
                    {a.location ? ` · ${a.location}` : ''}
                  </div>
                  <div className="text-[14px] text-muted-foreground">
                    Confidence: {(a.confidence * 100).toFixed(0)}% · {new Date(a.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg">
            <div className="px-3 py-2 border-b border-border flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="flex-1 bg-background border border-border rounded px-2 py-1 text-[14px]"
              >
                <option value="all">All cameras</option>
                {cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={clearEvents} className="p-1.5 rounded hover:bg-muted" title="Clear history">
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
              {filtered.length === 0 && (
                <p className="p-3 text-[14px] text-muted-foreground">No events recorded.</p>
              )}
              {filtered.slice(0, 100).map(e => (
                <div key={e.id} className="p-2.5 flex gap-2 items-start">
                  {e.snapshot ? (
                    <img src={e.snapshot} alt={`${e.type} snapshot from ${e.cameraName}`} className="w-16 h-12 object-cover rounded border border-border" />
                  ) : (
                    <div className="w-16 h-12 rounded bg-muted flex items-center justify-center text-lg">{typeIcon[e.type]}</div>
                  )}
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate">{e.label}</div>
                    <div className="text-[13px] text-muted-foreground truncate">
                      {e.cameraName}{e.location ? ` · ${e.location}` : ''} · {(e.confidence * 100).toFixed(0)}%
                    </div>
                    <div className="text-[13px] text-muted-foreground">{new Date(e.timestamp).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
