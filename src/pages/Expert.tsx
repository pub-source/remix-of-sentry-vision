import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Sparkles, Flame, Brain, Volume2, Eye, Layers, Cpu, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import HologramDiagram, { HologramNode } from '@/components/HologramDiagram';
import dogSprite from '@/assets/expert-dog.png';

interface Algorithm {
  id: string;
  icon: typeof Flame;
  title: string;
  file: string;
  fn: string;
  plain: string;
  how: string[];
  code: string;
  nodes: HologramNode[];
}

const ALGORITHMS: Algorithm[] = [
  {
    id: 'fire',
    icon: Flame,
    title: 'Fire & Smoke Detection',
    file: 'src/lib/fireDetection.ts',
    fn: 'detectFire()',
    plain:
      "I sniff every frame for fire-colored pixels — strong red, some green, very little blue. But a red pillow isn't fire! So I also watch how much the bright pixels FLICKER over 10 frames. Real fire dances, printed fires stay still. Then I check for smoke: low-saturation grey areas that lower visibility.",
    how: [
      'Pass 1: sample every 4th pixel and count fire-color hits + smoke-color hits + luminance stats.',
      'Compute flicker as the variance of fire-pixel ratio across the last 10 frames.',
      'Reject flames sitting on TVs / phones / laptops via COCO-SSD bbox overlap.',
      'Reject tiny flames (lighter/candle) and flat planar regions (posters/wallpaper).',
      'Fire fires only when: color signature + area + flicker all pass. Smoke fires when coverage ≥18% AND visibility ≤45.',
    ],
    code: `if (r > 200 && g > 100 && g < 200 && b < 100 && r > g + 40) fireCount++;
// ...
const variance = history.reduce((s,v) => s + (v-mean)**2, 0) / history.length;
if (variance < MIN_FLICKER) return { rejected: 'no flicker — static red object' };`,
    nodes: [
      { id: '1', label: 'Input frame (ImageData)', detail: 'Downsampled webcam or IP-cam pixels' },
      { id: '2', label: 'Fire-color sampling', detail: 'HSV-ish test → firePixelRatio + bbox' },
      { id: '3', label: 'Smoke + visibility scoring', detail: 'Saturation, luminance, contrast, edge density' },
      { id: '4', label: 'Temporal flicker analysis', detail: 'Variance across 10-frame rolling window' },
      { id: '5', label: 'False-alarm rejection ladder', detail: 'TV/screen · lighter · poster · static red' },
      { id: '6', label: 'Fusion + adaptive threshold', detail: 'Multiplied by per-household FP multiplier' },
      { id: '7', label: 'Alert trigger', detail: 'fireDetected || smokeEmergency → dashboard alert' },
    ],
  },
  {
    id: 'face',
    icon: Brain,
    title: 'Facial Distress (FER)',
    file: 'src/hooks/useFaceDistress.ts',
    fn: 'useFaceDistress.analyze()',
    plain:
      "I use a pretrained TinyFaceDetector to find faces, then a FaceExpressionNet trained on FER+/AffectNet to score 7 emotions. Sadness, fear, anger, disgust all count as 'distress' with different weights. I average over 5 frames to stop it flickering.",
    how: [
      'TinyFaceDetector locates faces at 224×224 input.',
      'FaceExpressionNet returns probabilities for 7 base emotions.',
      'distress = sad*1.0 + fearful*1.4 + angry*0.8 + disgusted*0.7 (scaled to 0–100).',
      'Rolling average over last 5 samples suppresses per-frame flicker.',
      'Levels: severe > 55, mild > 25, else none.',
    ],
    code: `const distressRaw = sad*1.0 + fearful*1.4 + angry*0.8 + disgusted*0.7;
const instant = Math.min(100, Math.round(distressRaw * 100));
historyRef.current.push(instant);
if (historyRef.current.length > 5) historyRef.current.shift();`,
    nodes: [
      { id: '1', label: 'Camera frame', detail: 'Video / canvas source at 224px' },
      { id: '2', label: 'TinyFaceDetector', detail: 'Bounding boxes for every face' },
      { id: '3', label: 'FaceExpressionNet', detail: '7-class emotion probabilities' },
      { id: '4', label: 'Weighted distress fusion', detail: 'sad, fearful, angry, disgusted → 0..100' },
      { id: '5', label: '5-frame temporal smoothing', detail: 'Rolling average kills flicker' },
      { id: '6', label: 'Threshold + adaptive gate', detail: 'severe > 55 · scaled per-household' },
    ],
  },
  {
    id: 'audio',
    icon: Volume2,
    title: 'YAMNet Audio Saliency',
    file: 'src/hooks/useYamnet.ts',
    fn: 'useYamnet()',
    plain:
      "YAMNet is a Google audio classifier trained on 521 sound categories from AudioSet. I feed it your mic stream in ~1-second windows and watch for scream, crying, glass break, and other alarm sounds.",
    how: [
      'MediaStream → AudioContext → Mel spectrogram (960ms window).',
      'YAMNet returns 521 class scores per window.',
      'Threshold top-1 score per alarm class; store top-3 scores in feedback rows.',
      'Adaptive gate per household reduces false alarms in noisy environments.',
    ],
    code: `const scores = await yamnetModel.predict(spectrogram);
const top = scores.argMax();
if (SCREAM_CLASSES.has(top) && scores[top] > 0.5 * adaptive.audioMultiplier)
  triggerAlert('audio_scream', scores[top]);`,
    nodes: [
      { id: '1', label: 'Microphone stream', detail: 'getUserMedia({ audio: true })' },
      { id: '2', label: 'Mel spectrogram', detail: '960 ms window → 64 mel bins' },
      { id: '3', label: 'YAMNet inference', detail: '521-class AudioSet classifier' },
      { id: '4', label: 'Class filtering', detail: 'scream · crying · glass break · alarm' },
      { id: '5', label: 'Adaptive threshold', detail: 'per-household FP-tuned multiplier' },
      { id: '6', label: 'Alert + feedback capture', detail: 'raw_scores stored for offline ML' },
    ],
  },
  {
    id: 'object',
    icon: Eye,
    title: 'Object Detection (COCO-SSD)',
    file: 'src/hooks/useObjectDetection.ts',
    fn: 'detect()',
    plain:
      'COCO-SSD is a single-shot MobileNet detector trained on the 80-class COCO dataset. I run it every few frames and draw boxes for priority objects only.',
    how: [
      'MobileNet backbone + SSD head, quantised to run in the browser via TFJS.',
      'Confidence gate (default 20%) + priority-class filter drops noise.',
      'Bboxes feed the fire pipeline so flames inside a TV get rejected.',
    ],
    code: `const predictions = await cocoModel.detect(canvas);
return predictions.filter(p => priority.has(p.class) && p.score > minConf);`,
    nodes: [
      { id: '1', label: 'Frame capture', detail: 'CameraFeed → canvas' },
      { id: '2', label: 'MobileNet + SSD', detail: '80-class COCO detector' },
      { id: '3', label: 'Confidence + priority filter', detail: 'Drops low-score and off-list objects' },
      { id: '4', label: 'Bbox output', detail: 'Feeds overlays + fire rejection' },
    ],
  },
  {
    id: 'saliency',
    icon: Layers,
    title: 'Visual Saliency Map',
    file: 'src/lib/saliency.ts',
    fn: 'computeSaliency()',
    plain:
      'The saliency map highlights where a human eye would look first — high contrast, edges, motion. It picks the "attention" region without any labels.',
    how: [
      'Sobel / Laplacian gradients on luminance channel.',
      'Optional motion diff between consecutive frames.',
      'Blended into a heatmap that drives the AttentionGauge.',
    ],
    code: `const gx = sobelX(gray);
const gy = sobelY(gray);
saliency[i] = Math.sqrt(gx*gx + gy*gy);`,
    nodes: [
      { id: '1', label: 'Grayscale frame', detail: 'Luma channel only' },
      { id: '2', label: 'Sobel / Laplacian', detail: 'Edge gradient magnitude' },
      { id: '3', label: 'Motion diff', detail: 'Optional frame-to-frame delta' },
      { id: '4', label: 'Normalised heatmap', detail: 'Drives AttentionGauge score' },
    ],
  },
  {
    id: 'fusion',
    icon: Cpu,
    title: 'Fusion & Adaptive Learning',
    file: 'src/hooks/useAdaptiveThresholds.ts',
    fn: 'useAdaptiveThresholds()',
    plain:
      "This is the 'learn after deploy' part. Every 👍/👎 you press is saved. I count correct vs false-positive per event type per household, then multiply each detector's confidence gate up (when you get too many false alarms) or slightly down (when it's been accurate).",
    how: [
      'Query last 500 detection_feedback rows for the current household.',
      'Bucket by event_type into correct vs false_positive counts.',
      'Derive multiplier: <10% FP → 0.9x, 30-50% → 1.15x, 75%+ → 1.6x.',
      'Refresh every 60s, cached in sessionStorage.',
    ],
    code: `if (fpRate < 0.1) return 0.9;
if (fpRate < 0.5) return 1.15;
if (fpRate < 0.75) return 1.35;
return 1.6;`,
    nodes: [
      { id: '1', label: 'detection_feedback table', detail: 'All 👍 / 👎 rows per household' },
      { id: '2', label: 'Aggregate per event_type', detail: 'correct vs false_positive counts' },
      { id: '3', label: 'Compute FP-rate multiplier', detail: '0.9x → 1.6x tightness' },
      { id: '4', label: 'Broadcast to detectors', detail: 'fire · face · audio thresholds scale' },
      { id: '5', label: 'Repeat every 60s', detail: 'sessionStorage cache · zero server load' },
    ],
  },
];

export default function Expert() {
  const [selected, setSelected] = useState<Algorithm | null>(null);
  const [holoOpen, setHoloOpen] = useState<Algorithm | null>(null);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-base font-medium">Back</span>
          </Link>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold">Expert Mode</h1>
          </div>
          <Link to="/dashboard" className="text-base text-primary hover:underline">Open dashboard →</Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 grid lg:grid-cols-[280px_1fr] gap-8">
        {/* Sidebar list */}
        <aside className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">Algorithms</p>
          {ALGORITHMS.map(a => {
            const Icon = a.icon;
            const active = selected?.id === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                  active
                    ? 'bg-primary/10 border-primary text-foreground'
                    : 'bg-card border-border hover:border-primary/40 text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-primary' : ''}`} />
                <span className="text-base font-medium flex-1">{a.title}</span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </button>
            );
          })}
        </aside>

        {/* Detail area */}
        <section className="space-y-6">
          {!selected ? (
            <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center space-y-6">
              <img src={dogSprite} alt="Expert mode mascot" width={192} height={192} className="mx-auto" style={{ imageRendering: 'pixelated' }} />
              <div className="space-y-3">
                <h2 className="text-2xl font-bold">Woof! I'm Byte, your ML tour guide.</h2>
                <p className="text-base text-muted-foreground max-w-md mx-auto">
                  Pick an algorithm on the left and I'll explain how it works, show the real function that runs it, and let you view its <span className="text-primary font-semibold">hologram pipeline</span>.
                </p>
              </div>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.article
                key={selected.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="space-y-6"
              >
                <div className="flex items-start gap-4">
                  <img src={dogSprite} alt="" width={96} height={96} style={{ imageRendering: 'pixelated' }} />
                  <div className="relative flex-1 bg-card border-2 border-primary/40 rounded-2xl rounded-tl-none p-5">
                    <div className="absolute -left-2 top-3 w-4 h-4 bg-card border-l-2 border-b-2 border-primary/40 rotate-45" />
                    <p className="text-base leading-relaxed">{selected.plain}</p>
                  </div>
                </div>

                <div className="bg-card rounded-xl border border-border p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold flex items-center gap-2">
                        <selected.icon className="w-5 h-5 text-primary" />
                        {selected.title}
                      </h3>
                      <p className="text-xs font-mono text-muted-foreground mt-1">
                        {selected.file} → <span className="text-primary">{selected.fn}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => setHoloOpen(selected)}
                      className="px-4 py-2 rounded-lg bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/25 font-mono text-sm"
                      style={{ boxShadow: '0 0 20px rgba(0,229,255,0.15)' }}
                    >
                      ▸ Open Hologram
                    </button>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">How it's implemented</h4>
                    <ol className="space-y-1.5 list-decimal pl-5 text-base">
                      {selected.how.map((h, i) => <li key={i}>{h}</li>)}
                    </ol>
                  </div>

                  <details className="rounded-lg bg-secondary/40 border border-border">
                    <summary className="cursor-pointer px-4 py-2 text-sm font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">
                      Show code excerpt
                    </summary>
                    <pre className="px-4 py-3 text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap">
                      {selected.code}
                    </pre>
                  </details>
                </div>
              </motion.article>
            </AnimatePresence>
          )}
        </section>
      </main>

      <AnimatePresence>
        {holoOpen && (
          <HologramDiagram
            title={holoOpen.title}
            subtitle={holoOpen.fn}
            nodes={holoOpen.nodes}
            onClose={() => setHoloOpen(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
