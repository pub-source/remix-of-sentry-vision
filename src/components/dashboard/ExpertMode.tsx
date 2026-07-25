import { useState } from 'react';
import { X, Sparkles, Dog } from 'lucide-react';

export interface AlgorithmDoc {
  id: string;
  name: string;
  file: string;
  summary: string;
  bullets: string[];
  formula?: string;
  diagram: string[]; // ASCII-ish steps, rendered as hologram
}

const ALGORITHMS: AlgorithmDoc[] = [
  {
    id: 'fire',
    name: 'Fire & Smoke Detection',
    file: 'src/lib/fireDetection.ts',
    summary:
      'Multimodal color + flicker + smoke + visibility pipeline. Rejects TVs, posters, and static red objects before firing an alert.',
    bullets: [
      'Fire pixel test: R>200, G in [100,200], B<100, R>G+40, G>B+20.',
      'Flicker = variance of fire-pixel ratio over last 10 frames — real fire flickers, a red poster does not.',
      'Smoke test: low saturation, mid luminance, near-grey — accumulated over a rolling window.',
      'Visibility score fuses contrast, edge density, and saturation into 0..100.',
      'Rejection ladder: too small → lighter/candle. Inside TV/phone bbox → screen. Low edges + low flicker → poster.',
    ],
    formula: 'conf = min(1, ratio·30 + min(0.5, variance·50000)) [+0.15 smoke] [+0.10 low-vis]',
    diagram: [
      'FRAME  ─►  color mask  ─►  fire ratio',
      '   │                          │',
      '   ├─►  smoke mask ─► smoke ratio',
      '   │                          │',
      '   ├─►  contrast/edges ─► visibility',
      '   │                          │',
      '   └─►  history buffer ─► flicker',
      '                              ▼',
      '        REJECT (screen/poster/candle)',
      '                              ▼',
      '              conf = fuse(ratio, flicker, smoke, vis)',
    ],
  },
  {
    id: 'face',
    name: 'Facial Distress',
    file: 'src/hooks/useFaceDistress.ts',
    summary:
      'TinyFaceDetector + FaceExpressionNet (FER+/AffectNet-trained). Maps 7 expressions into a single distress score with temporal smoothing.',
    bullets: [
      'Picks the largest face per frame (nearest subject).',
      'distress = 1.0·sad + 1.4·fearful + 0.8·angry + 0.7·disgusted.',
      'Rolling average over last 5 samples to suppress flicker.',
      'Levels: >55 severe, >25 mild, else none.',
    ],
    formula: 'score = mean_last5( 100·(1·sad + 1.4·fearful + 0.8·angry + 0.7·disgusted) )',
    diagram: [
      'VIDEO ─► TinyFaceDetector ─► bbox',
      '            │',
      '            ▼',
      '      FaceExpressionNet',
      '            │',
      '   {sad, fearful, angry, disgusted, ...}',
      '            │',
      '   weighted sum ─► rolling avg ─► distressLevel',
    ],
  },
  {
    id: 'yamnet',
    name: 'YAMNet Audio Distress',
    file: 'src/hooks/useYamnet.ts',
    summary:
      'Google YAMNet AudioSet classifier (521 classes) — screams, cries, glass, alarms are re-scored into a single distress metric.',
    bullets: [
      'Runs every ~500ms on a 0.975s audio window.',
      'Keeps top-K classes and matches against a distress whitelist.',
      'distressScore ≥ 60 → critical alert; ≥ 35 → elevated.',
    ],
    diagram: [
      'MIC ─► 16kHz mono ─► YAMNet',
      '                        │',
      '                 top-K labels + scores',
      '                        │',
      '           filter(scream|cry|glass|alarm|...)',
      '                        │',
      '                 distressScore 0..100',
    ],
  },
  {
    id: 'saliency',
    name: 'Multimodal Saliency Fusion',
    file: 'src/pages/Index.tsx',
    summary:
      'The final attention score α is a weighted fusion of visual saliency, audio energy, and object confidence.',
    bullets: [
      'S = visual saliency (Sobel / motion / Laplacian) — 0..100.',
      'A = audio energy or speech-adjusted dB — 0..100.',
      'O = mean object-detection confidence for objects in frame.',
      'α > 70 → ALERT, > 40 → ELEVATED, else NORMAL.',
    ],
    formula: 'α = 0.40·S + 0.30·A + 0.30·O',
    diagram: [
      'CAM ─► Saliency (S) ─┐',
      'MIC ─► Audio    (A) ─┼─►  α = 0.4S + 0.3A + 0.3O',
      'CAM ─► COCO-SSD (O) ─┘             │',
      '                                    ▼',
      '                          NORMAL / ELEVATED / ALERT',
    ],
  },
];

export default function ExpertMode({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState<AlgorithmDoc | null>(null);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-background/85 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border-2 border-primary/40 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-5 border-b border-border bg-gradient-to-r from-primary/10 to-accent/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-3xl">
              🐕
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                Expert Mode <Sparkles className="w-5 h-5 text-primary" />
              </h2>
              <p className="text-base text-muted-foreground">
                Woof! I'll show you how each algorithm works. Click one to see its hologram.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted"
            aria-label="Close expert mode"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {ALGORITHMS.map(algo => (
            <button
              key={algo.id}
              onClick={() => setSelected(algo)}
              className="w-full text-left bg-secondary/40 hover:bg-secondary/70 border border-border hover:border-primary/50 rounded-xl p-4 transition-all group"
            >
              <div className="flex items-start gap-3">
                <Dog className="w-6 h-6 text-primary shrink-0 mt-1 group-hover:scale-110 transition-transform" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-semibold text-foreground">{algo.name}</h3>
                    <code className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-mono">
                      {algo.file}
                    </code>
                  </div>
                  <p className="text-base text-muted-foreground">{algo.summary}</p>
                  <ul className="text-sm text-foreground/80 space-y-1 pl-4 list-disc marker:text-primary">
                    {algo.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                  {algo.formula && (
                    <div className="mt-2 inline-block bg-background/60 border border-primary/30 rounded px-3 py-1.5 font-mono text-sm text-primary">
                      {algo.formula}
                    </div>
                  )}
                  <div className="text-sm text-accent font-medium pt-1">
                    ▸ Click to open hologram diagram
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected && <HologramDiagram algo={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function HologramDiagram({ algo, onClose }: { algo: AlgorithmDoc; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl"
        onClick={e => e.stopPropagation()}
        style={{ perspective: '1000px' }}
      >
        <div
          className="rounded-2xl border-2 p-8 space-y-4"
          style={{
            background:
              'linear-gradient(135deg, rgba(56,189,248,0.12), rgba(168,85,247,0.12))',
            borderColor: 'rgba(56,189,248,0.5)',
            boxShadow:
              '0 0 60px rgba(56,189,248,0.35), inset 0 0 40px rgba(168,85,247,0.15)',
            transform: 'rotateX(2deg)',
            animation: 'hologram-flicker 4s ease-in-out infinite',
          }}
        >
          <div className="flex items-center justify-between">
            <h3
              className="text-2xl font-bold tracking-wider"
              style={{
                color: '#7dd3fc',
                textShadow: '0 0 12px rgba(125,211,252,0.9)',
              }}
            >
              ◈ {algo.name.toUpperCase()} ◈
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-white/10 text-cyan-200"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <pre
            className="font-mono text-base leading-relaxed whitespace-pre overflow-x-auto p-4 rounded-lg"
            style={{
              color: '#a5f3fc',
              background: 'rgba(2,6,23,0.55)',
              textShadow: '0 0 6px rgba(125,211,252,0.6)',
              border: '1px solid rgba(125,211,252,0.3)',
            }}
          >
            {algo.diagram.join('\n')}
          </pre>
          {algo.formula && (
            <div
              className="text-center font-mono text-lg py-2 rounded"
              style={{
                color: '#f0abfc',
                textShadow: '0 0 10px rgba(240,171,252,0.8)',
              }}
            >
              {algo.formula}
            </div>
          )}
          <p className="text-sm text-cyan-100/80 text-center italic">
            Implemented in <code className="text-cyan-300">{algo.file}</code>
          </p>
        </div>
        <style>{`
          @keyframes hologram-flicker {
            0%, 100% { opacity: 1; }
            48% { opacity: 0.96; }
            50% { opacity: 0.82; }
            52% { opacity: 0.96; }
          }
        `}</style>
      </div>
    </div>
  );
}
