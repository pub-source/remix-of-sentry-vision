import { useEffect, useState } from 'react';
import { X, Sparkles, Dog, Play, Pause, SkipForward, SkipBack } from 'lucide-react';

export interface SequenceStep {
  from: string;
  to: string;
  label: string;
  explain: string; // what the doggie says
  code: string;    // code snippet highlighted at this step
  lang?: string;
}

export interface AlgorithmDoc {
  id: string;
  name: string;
  file: string;
  summary: string;
  bullets: string[];
  formula?: string;
  actors: string[];       // sequence-diagram lifelines, in order
  steps: SequenceStep[];  // ordered messages between actors
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
      'Flicker = variance of fire-pixel ratio over last 10 frames.',
      'Smoke test: low saturation, mid luminance, near-grey.',
      'Rejection ladder: too small → candle. Inside TV/phone bbox → screen. Low edges + low flicker → poster.',
    ],
    formula: 'conf = min(1, ratio·30 + min(0.5, variance·50000)) [+0.15 smoke] [+0.10 low-vis]',
    actors: ['Frame', 'ColorMask', 'History', 'Rejecter', 'Alert'],
    steps: [
      {
        from: 'Frame', to: 'ColorMask',
        label: 'sample pixels',
        explain: 'Woof! First I look at every pixel and ask: is this really fire-colored? Reds too pink or too dark get thrown out.',
        code: `const isFire =
  r > 200 && g >= 100 && g <= 200 && b < 100 &&
  r > g + 40 && g > b + 20;
if (isFire) fireCount++;`,
      },
      {
        from: 'ColorMask', to: 'History',
        label: 'push ratio',
        explain: 'I remember the fire-ratio for the last 10 frames. A candle is steady, real fire wobbles!',
        code: `history.push(fireCount / totalPixels);
if (history.length > 10) history.shift();
const variance = varianceOf(history);`,
      },
      {
        from: 'Frame', to: 'ColorMask',
        label: 'smoke mask',
        explain: 'Then I sniff for smoke — low saturation, greyish, mid-brightness pixels stacked over time.',
        code: `const isSmoke =
  saturation < 0.15 && luminance > 60 && luminance < 190 &&
  Math.abs(r - g) < 12 && Math.abs(g - b) < 12;`,
      },
      {
        from: 'ColorMask', to: 'Rejecter',
        label: 'check bbox',
        explain: 'If the "fire" sits inside a TV or phone bounding box from COCO-SSD, it is definitely a screen. Bark!',
        code: `if (insideBBoxOf(['tv','laptop','cell phone'], region)) {
  return { fire: false, reason: 'screen' };
}`,
      },
      {
        from: 'Rejecter', to: 'Alert',
        label: 'fuse & emit',
        explain: 'Finally I fuse ratio + flicker + smoke + visibility into a confidence, and only then wake the alarm.',
        code: `let conf = Math.min(1, ratio * 30 + Math.min(0.5, variance * 50000));
if (smokeRatio > 0.05) conf += 0.15;
if (visibility < 30)   conf += 0.10;
if (conf > 0.6) emitAlert({ type: 'fire', conf });`,
      },
    ],
  },
  {
    id: 'face',
    name: 'Facial Distress',
    file: 'src/hooks/useFaceDistress.ts',
    summary:
      'TinyFaceDetector + FaceExpressionNet. Maps 7 expressions into a single distress score with temporal smoothing.',
    bullets: [
      'Picks the largest face per frame (nearest subject).',
      'distress = 1.0·sad + 1.4·fearful + 0.8·angry + 0.7·disgusted.',
      'Rolling average over last 5 samples to suppress flicker.',
    ],
    formula: 'score = mean_last5( 100·(1·sad + 1.4·fearful + 0.8·angry + 0.7·disgusted) )',
    actors: ['Video', 'FaceDetector', 'ExpressionNet', 'Smoother', 'UI'],
    steps: [
      {
        from: 'Video', to: 'FaceDetector',
        label: 'detect faces',
        explain: 'I scan the frame for faces with TinyFaceDetector — small and fast, perfect for the browser!',
        code: `const detections = await faceapi
  .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
  .withFaceExpressions();
const largest = pickLargest(detections);`,
      },
      {
        from: 'FaceDetector', to: 'ExpressionNet',
        label: 'classify emotion',
        explain: 'Then I ask FaceExpressionNet what emotion this face is showing — 7 possibilities.',
        code: `const { sad, fearful, angry, disgusted,
        happy, surprised, neutral } = largest.expressions;`,
      },
      {
        from: 'ExpressionNet', to: 'Smoother',
        label: 'weighted score',
        explain: 'Fearful counts more than sad — fear is more urgent. I weight each emotion accordingly.',
        code: `const raw = 100 * (
  1.0 * sad + 1.4 * fearful +
  0.8 * angry + 0.7 * disgusted
);`,
      },
      {
        from: 'Smoother', to: 'UI',
        label: 'rolling average',
        explain: 'One weird frame should not trigger an alarm — I average the last 5 samples for stability.',
        code: `buffer.push(raw);
if (buffer.length > 5) buffer.shift();
const score = mean(buffer);
setDistressLevel(score > 55 ? 'severe' : score > 25 ? 'mild' : 'none');`,
      },
    ],
  },
  {
    id: 'yamnet',
    name: 'YAMNet Audio Distress',
    file: 'src/hooks/useYamnet.ts',
    summary:
      'Google YAMNet AudioSet classifier — screams, cries, glass, alarms are re-scored into a single distress metric.',
    bullets: [
      'Runs every ~500ms on a 0.975s audio window.',
      'Keeps top-K classes and matches against a distress whitelist.',
    ],
    actors: ['Mic', 'Resampler', 'YAMNet', 'Filter', 'Alert'],
    steps: [
      {
        from: 'Mic', to: 'Resampler',
        label: 'capture 0.975s',
        explain: 'YAMNet wants 16 kHz mono audio, exactly 0.975 seconds. I resample the mic stream for it.',
        code: `const buf = getAudioWindow(0.975);      // seconds
const mono16k = resampleTo(buf, 16000); // Float32Array`,
      },
      {
        from: 'Resampler', to: 'YAMNet',
        label: 'classify(521 classes)',
        explain: 'I feed the wave into YAMNet — a network trained on millions of YouTube clips!',
        code: `const { scores } = await yamnet.predict(mono16k);
const topK = topKIndices(scores, 5);`,
      },
      {
        from: 'YAMNet', to: 'Filter',
        label: 'whitelist match',
        explain: 'Only distress-y sounds count: scream, cry, glass, alarm, gunshot. Music and chatter are ignored.',
        code: `const DISTRESS = /scream|cry|shout|glass|alarm|gunshot|siren/i;
const hits = topK.filter(i => DISTRESS.test(labels[i]));
const distressScore = 100 * hits.reduce((s,i) => s + scores[i], 0);`,
      },
      {
        from: 'Filter', to: 'Alert',
        label: 'emit event',
        explain: 'If the score crosses 60, that is critical — 35 is elevated. Woof!',
        code: `if (distressScore >= 60) emit({ level: 'critical', distressScore });
else if (distressScore >= 35) emit({ level: 'elevated', distressScore });`,
      },
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
      'O = mean object-detection confidence.',
    ],
    formula: 'α = 0.40·S + 0.30·A + 0.30·O',
    actors: ['Cam', 'Mic', 'COCO-SSD', 'Fusion', 'Dashboard'],
    steps: [
      {
        from: 'Cam', to: 'Fusion',
        label: 'visual S',
        explain: 'I compute a saliency map from motion + edges — where should you be looking right now?',
        code: `const S = 0.5 * motionMap(frame, prevFrame) +
          0.3 * sobelEdges(frame) +
          0.2 * laplacian(frame);`,
      },
      {
        from: 'Mic', to: 'Fusion',
        label: 'audio A',
        explain: 'From the mic I take dB energy, boosted a bit for speech-band frequencies.',
        code: `const A = clamp(rmsDb(audio) + speechBandBoost(audio), 0, 100);`,
      },
      {
        from: 'Cam', to: 'COCO-SSD',
        label: 'detect objects',
        explain: 'COCO-SSD tells me what things are in the frame and how sure it is about each.',
        code: `const dets = await cocoSsd.detect(video);
const O = 100 * mean(dets.map(d => d.score));`,
      },
      {
        from: 'Fusion', to: 'Dashboard',
        label: 'α = 0.4S + 0.3A + 0.3O',
        explain: 'Weighted fusion! Above 70 is an ALERT, above 40 is ELEVATED — the rest is normal life.',
        code: `const alpha = 0.4 * S + 0.3 * A + 0.3 * O;
const state = alpha > 70 ? 'ALERT' : alpha > 40 ? 'ELEVATED' : 'NORMAL';`,
      },
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
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-3xl animate-bounce">
              🐕
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                Expert Mode <Sparkles className="w-5 h-5 text-primary" />
              </h2>
              <p className="text-base text-muted-foreground">
                Woof! Pick an algorithm — I'll walk you through it step by step.
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
                  {algo.formula && (
                    <div className="mt-2 inline-block bg-background/60 border border-primary/30 rounded px-3 py-1.5 font-mono text-sm text-primary">
                      {algo.formula}
                    </div>
                  )}
                  <div className="text-sm text-accent font-medium pt-1">
                    ▸ Play animated sequence diagram
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selected && <SequenceDiagram algo={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/* ------------------------- Sequence Diagram ------------------------- */

function SequenceDiagram({ algo, onClose }: { algo: AlgorithmDoc; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => {
      setStep(s => (s + 1) % algo.steps.length);
    }, 4200);
    return () => clearTimeout(id);
  }, [step, playing, algo.steps.length]);

  const current = algo.steps[step];
  const actorX = (name: string) => {
    const idx = algo.actors.indexOf(name);
    const total = algo.actors.length;
    // spread across viewBox 0..1000, with 80px margin
    return 80 + (idx * (1000 - 160)) / (total - 1);
  };

  const fromX = actorX(current.from);
  const toX = actorX(current.to);
  const arrowY = 120 + step * 70; // moves down each step
  const svgHeight = 140 + algo.steps.length * 70;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl border-2"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, rgba(56,189,248,0.10), rgba(168,85,247,0.10))',
          borderColor: 'rgba(56,189,248,0.5)',
          boxShadow: '0 0 60px rgba(56,189,248,0.35), inset 0 0 40px rgba(168,85,247,0.15)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-cyan-400/30 sticky top-0 backdrop-blur-md bg-slate-950/70 z-10">
          <h3
            className="text-2xl font-bold tracking-wider"
            style={{ color: '#7dd3fc', textShadow: '0 0 12px rgba(125,211,252,0.9)' }}
          >
            ◈ {algo.name.toUpperCase()} — SEQUENCE ◈
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep(s => (s - 1 + algo.steps.length) % algo.steps.length)}
              className="p-2 rounded hover:bg-white/10 text-cyan-200"
              aria-label="Previous step"
            >
              <SkipBack className="w-5 h-5" />
            </button>
            <button
              onClick={() => setPlaying(p => !p)}
              className="p-2 rounded hover:bg-white/10 text-cyan-200"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setStep(s => (s + 1) % algo.steps.length)}
              className="p-2 rounded hover:bg-white/10 text-cyan-200"
              aria-label="Next step"
            >
              <SkipForward className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-white/10 text-cyan-200 ml-2"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 p-5">
          {/* SVG sequence diagram */}
          <div className="rounded-lg border border-cyan-400/30 bg-slate-950/60 p-2 overflow-x-auto">
            <svg viewBox={`0 0 1000 ${svgHeight}`} className="w-full h-auto">
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="8"
                  markerHeight="8"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#f0abfc" />
                </marker>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Actor headers + lifelines */}
              {algo.actors.map(a => {
                const x = actorX(a);
                return (
                  <g key={a}>
                    <rect
                      x={x - 55}
                      y={20}
                      width={110}
                      height={40}
                      rx={8}
                      fill="rgba(56,189,248,0.15)"
                      stroke="#7dd3fc"
                      strokeWidth={1.5}
                      filter="url(#glow)"
                    />
                    <text
                      x={x}
                      y={45}
                      textAnchor="middle"
                      fontSize={16}
                      fontFamily="ui-monospace, monospace"
                      fill="#e0f2fe"
                    >
                      {a}
                    </text>
                    <line
                      x1={x}
                      y1={60}
                      x2={x}
                      y2={svgHeight - 20}
                      stroke="#7dd3fc"
                      strokeWidth={1}
                      strokeDasharray="4 6"
                      opacity={0.6}
                    />
                  </g>
                );
              })}

              {/* All past + current messages */}
              {algo.steps.map((s, i) => {
                if (i > step) return null;
                const y = 120 + i * 70;
                const fx = actorX(s.from);
                const tx = actorX(s.to);
                const isCurrent = i === step;
                const midX = (fx + tx) / 2;
                return (
                  <g
                    key={i}
                    opacity={isCurrent ? 1 : 0.45}
                    style={{
                      transition: 'opacity 400ms ease',
                    }}
                  >
                    <line
                      x1={fx}
                      y1={y}
                      x2={tx}
                      y2={y}
                      stroke={isCurrent ? '#f0abfc' : '#7dd3fc'}
                      strokeWidth={isCurrent ? 3 : 1.5}
                      markerEnd="url(#arrow)"
                      filter={isCurrent ? 'url(#glow)' : undefined}
                    >
                      {isCurrent && (
                        <animate
                          attributeName="stroke-dashoffset"
                          from="40"
                          to="0"
                          dur="0.8s"
                          fill="freeze"
                        />
                      )}
                    </line>
                    <text
                      x={midX}
                      y={y - 8}
                      textAnchor="middle"
                      fontSize={14}
                      fontFamily="ui-monospace, monospace"
                      fill={isCurrent ? '#fdf4ff' : '#a5f3fc'}
                    >
                      {s.label}
                    </text>
                  </g>
                );
              })}

              {/* Doggie mascot at the current arrow */}
              <g
                style={{
                  transition: 'transform 700ms cubic-bezier(0.4,0,0.2,1)',
                  transform: `translate(${(fromX + toX) / 2 - 20}px, ${arrowY - 46}px)`,
                }}
              >
                <circle
                  r={22}
                  cx={20}
                  cy={20}
                  fill="rgba(240,171,252,0.25)"
                  stroke="#f0abfc"
                  strokeWidth={2}
                  filter="url(#glow)"
                >
                  <animate
                    attributeName="r"
                    values="20;24;20"
                    dur="1.4s"
                    repeatCount="indefinite"
                  />
                </circle>
                <text
                  x={20}
                  y={28}
                  textAnchor="middle"
                  fontSize={26}
                >
                  🐕
                </text>
              </g>
            </svg>
          </div>

          {/* Doggie speech + code snippet */}
          <div className="space-y-3">
            <div
              className="relative rounded-xl border border-fuchsia-400/40 bg-slate-950/70 p-4 animate-fade-in"
              key={`explain-${step}`}
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl shrink-0 animate-bounce">🐕</div>
                <div>
                  <div
                    className="text-xs font-mono uppercase tracking-wider mb-1"
                    style={{ color: '#f0abfc' }}
                  >
                    Step {step + 1} / {algo.steps.length} — {current.from} → {current.to}
                  </div>
                  <p className="text-base text-cyan-50 leading-relaxed">{current.explain}</p>
                </div>
              </div>
            </div>

            <div
              className="rounded-xl border border-cyan-400/40 bg-slate-950/80 overflow-hidden animate-fade-in"
              key={`code-${step}`}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-400/20 text-xs font-mono">
                <span style={{ color: '#7dd3fc' }}>{algo.file}</span>
                <span className="text-cyan-100/60">{current.lang ?? 'ts'}</span>
              </div>
              <pre
                className="font-mono text-sm leading-relaxed whitespace-pre overflow-x-auto p-4"
                style={{
                  color: '#a5f3fc',
                  textShadow: '0 0 6px rgba(125,211,252,0.4)',
                }}
              >
                {current.code}
              </pre>
            </div>

            {/* Step dots */}
            <div className="flex items-center justify-center gap-2 pt-1">
              {algo.steps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: i === step ? 28 : 10,
                    background: i === step ? '#f0abfc' : 'rgba(125,211,252,0.4)',
                    boxShadow: i === step ? '0 0 10px #f0abfc' : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
