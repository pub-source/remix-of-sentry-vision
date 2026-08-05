import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { detectObjects, loadDetector } from '@/lib/detectionEngine';
import { computeSaliency, computeSaliencyScore } from '@/lib/saliency';
import { createFireState, detectFire } from '@/lib/fireDetection';
import { getAudioEvents } from '@/lib/multiCamServer';
import { useFaceDistress } from '@/hooks/useFaceDistress';
import type {
  CameraConfig, CameraRuntime, DetectionEvent, MultiCamSettings,
} from '@/types/multicam';
import { hlsUrlFor } from '@/types/multicam';

const HUMAN_LABELS = new Set(['person']);

const emptyRuntime = (cameraId: string): CameraRuntime => ({
  cameraId,
  status: 'offline',
  error: null,
  fps: 0,
  latencyMs: 0,
  saliencyScore: 0,
  objects: [],
  humanCount: 0,
  fire: { detected: false, confidence: 0 },
  smoke: { detected: false, confidence: 0 },
  faceDistress: { detected: false, label: '', confidence: 0 },
  audioDistress: { detected: false, keyword: '', confidence: 0, transcript: '' },
  lastDetectionAt: null,
  detections: 0,
  alerts: 0,
});

interface Options {
  camera: CameraConfig;
  settings: MultiCamSettings;
  onEvent?: (evt: Omit<DetectionEvent, 'id'>) => void;
}

/**
 * One fully independent Multimodal Saliency Detection pipeline per camera:
 * its own HLS player, frame queue, fire/saliency state, face session,
 * Whisper audio polling, statistics and fault-tolerant reconnect.
 */
export function useCameraPipeline({ camera, settings, onEvent }: Options) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const fireStateRef = useRef(createFireState());
  const prevFrameRef = useRef<ImageData | null>(null);
  const busyRef = useRef(false);
  const framesRef = useRef(0);
  const lastFpsRef = useRef(Date.now());
  const lastAudioRef = useRef<string | undefined>(undefined);
  const cooldownRef = useRef<Record<string, number>>({});
  const retryRef = useRef(0);
  const runtimeRef = useRef<CameraRuntime>(emptyRuntime(camera.id));

  const [runtime, setRuntime] = useState<CameraRuntime>(() => emptyRuntime(camera.id));
  const face = useFaceDistress(camera.enabled && camera.aiEnabled);

  const patch = useCallback((p: Partial<CameraRuntime>) => {
    runtimeRef.current = { ...runtimeRef.current, ...p };
    setRuntime(runtimeRef.current);
  }, []);

  const snapshot = useCallback(() => {
    const c = workRef.current;
    try { return c ? c.toDataURL('image/jpeg', 0.5) : undefined; } catch { return undefined; }
  }, []);

  const emit = useCallback(
    (type: DetectionEvent['type'], label: string, confidence: number, withSnapshot = true) => {
      const now = Date.now();
      const key = `${type}:${label}`;
      if (cooldownRef.current[key] && now - cooldownRef.current[key] < 15000) return;
      cooldownRef.current[key] = now;
      runtimeRef.current.alerts += 1;
      onEvent?.({
        cameraId: camera.id,
        cameraName: camera.name,
        location: camera.location,
        type,
        label,
        confidence,
        timestamp: new Date().toISOString(),
        snapshot: withSnapshot ? snapshot() : undefined,
      });
    },
    [camera.id, camera.name, camera.location, onEvent, snapshot],
  );

  // ---- Stream: independent HLS session, auto-reconnect on failure ----------
  const url = hlsUrlFor(camera, settings);

  useEffect(() => {
    if (!camera.enabled) {
      patch({ status: 'offline', error: null });
      return;
    }
    let cancelled = false;
    let retryTimer: number | undefined;
    patch({ status: 'connecting', error: null });

    const attach = () => {
      const video = videoRef.current;
      if (!video || cancelled) return;
      const t0 = performance.now();

      if (Hls.isSupported()) {
        const hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 2, manifestLoadingTimeOut: 8000 });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (cancelled) return;
          retryRef.current = 0;
          patch({ status: 'online', error: null, latencyMs: Math.round(performance.now() - t0) });
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data.fatal || cancelled) return;
          // Fault tolerance: only THIS camera reconnects.
          patch({ status: 'error', error: data.details || 'Stream error' });
          hls.destroy();
          hlsRef.current = null;
          retryRef.current += 1;
          retryTimer = window.setTimeout(attach, Math.min(15000, 2000 * retryRef.current));
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.play().then(() => patch({ status: 'online' })).catch(() => {
          patch({ status: 'error', error: 'Playback blocked' });
        });
      } else {
        patch({ status: 'error', error: 'HLS unsupported in this browser' });
      }
    };

    attach();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      const v = videoRef.current;
      if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    };
  }, [url, camera.enabled, patch]);

  // ---- FPS counter ---------------------------------------------------------
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const elapsed = (now - lastFpsRef.current) / 1000;
      const fps = elapsed > 0 ? Math.round(framesRef.current / elapsed) : 0;
      framesRef.current = 0;
      lastFpsRef.current = now;
      patch({ fps });
    }, 1000);
    return () => window.clearInterval(id);
  }, [patch]);

  // ---- Detection loop (independent per camera) -----------------------------
  useEffect(() => {
    if (!camera.enabled || !camera.aiEnabled) return;
    let stopped = false;
    void loadDetector().catch(() => {});

    if (!workRef.current) workRef.current = document.createElement('canvas');

    const tick = async () => {
      if (stopped || busyRef.current) return;
      const video = videoRef.current;
      const canvas = workRef.current;
      if (!video || !canvas || video.readyState < 2 || !video.videoWidth) return;
      busyRef.current = true;
      const started = performance.now();
      try {
        const w = 320;
        const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * 320));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, w, h);
        framesRef.current += 1;

        const frame = ctx.getImageData(0, 0, w, h);

        // Objects + humans
        const objects = await detectObjects(canvas, settings.objectThreshold);
        const humanCount = objects.filter(o => HUMAN_LABELS.has(o.label)).length;

        // Saliency
        const sal = computeSaliency(frame, prevFrameRef.current, 'sobel', 40);
        prevFrameRef.current = frame;
        const saliencyScore = computeSaliencyScore(sal);

        // Fire + smoke (own detector state -> own temporal smoothing)
        const fire = detectFire(frame, fireStateRef.current, objects);

        // Facial expression
        await face.analyze(canvas);

        patch({
          objects,
          humanCount,
          saliencyScore,
          fire: {
            detected: fire.fireDetected && fire.confidence >= settings.fireThreshold,
            confidence: fire.confidence,
            bbox: fire.smoothedBbox,
          },
          smoke: { detected: fire.smokeEmergency, confidence: fire.smokeRatio },
          lastDetectionAt: new Date().toISOString(),
          detections: runtimeRef.current.detections + objects.length,
          latencyMs: Math.round(performance.now() - started),
        });

        if (objects.length) emit('object', objects[0].label, objects[0].confidence, false);
        if (humanCount > 0) emit('human', `${humanCount} person(s)`, 0.9, false);
        if (fire.fireDetected && fire.confidence >= settings.fireThreshold) emit('fire', 'Fire detected', fire.confidence);
        if (fire.smokeEmergency) emit('smoke', 'Smoke / low visibility', fire.smokeRatio);
        if (saliencyScore > 70) emit('saliency', `High saliency (${saliencyScore})`, saliencyScore / 100, false);
      } catch {
        /* keep this camera alive */
      } finally {
        busyRef.current = false;
      }
    };

    const id = window.setInterval(tick, 350);
    return () => { stopped = true; window.clearInterval(id); };
  }, [camera.enabled, camera.aiEnabled, settings.objectThreshold, settings.fireThreshold, face, patch, emit]);

  // Facial distress -> runtime + event
  useEffect(() => {
    const d = face.distress;
    const detected = d.hasFace && d.distressLevel !== 'none';
    patch({
      faceDistress: {
        detected,
        label: d.expression ?? '',
        confidence: d.distressScore / 100,
      },
    });
    if (d.distressLevel === 'severe') emit('face-distress', d.expression || 'distress', d.distressScore / 100);
  }, [face.distress, patch, emit]);

  // ---- Audio: RTSP audio -> ffmpeg -> Whisper on the backend ---------------
  // The browser never opens a microphone.
  useEffect(() => {
    if (!camera.enabled || !camera.aiEnabled) return;
    let stopped = false;
    const poll = async () => {
      try {
        const { events } = await getAudioEvents(settings.pythonServer, camera.id, lastAudioRef.current);
        if (stopped || !events?.length) return;
        lastAudioRef.current = events[events.length - 1].timestamp;
        for (const e of events) {
          if (e.confidence < settings.audioThreshold) continue;
          patch({
            audioDistress: {
              detected: true, keyword: e.keyword, confidence: e.confidence, transcript: e.transcript,
            },
          });
          emit('audio-distress', e.keyword || e.transcript, e.confidence);
        }
      } catch { /* backend offline — video keeps running */ }
    };
    const id = window.setInterval(poll, 3000);
    void poll();
    return () => { stopped = true; window.clearInterval(id); };
  }, [camera.enabled, camera.aiEnabled, camera.id, settings.pythonServer, settings.audioThreshold, patch, emit]);

  const reconnect = useCallback(() => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
    retryRef.current = 0;
    patch({ status: 'connecting', error: null });
    const v = videoRef.current;
    if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    // effect re-attaches on next render tick
    window.setTimeout(() => { if (videoRef.current) videoRef.current.load(); }, 100);
  }, [patch]);

  return { videoRef, runtime, reconnect, streamUrl: url, faceReady: face.ready };
}
