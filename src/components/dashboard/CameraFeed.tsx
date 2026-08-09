import { useRef, useEffect, useState, useCallback } from 'react';
import type { CameraState, SaliencyMode, DetectedObject } from '@/types/dashboard';
import { computeSaliency, applyHeatmapColor, computeSaliencyScore } from '@/lib/saliency';
import { RateLimiter, LatestOnlyRunner, ThrottledPublisher, perfMonitor, now as perfNow } from '@/lib/performance';


interface DetectionStats {
  totalDetected: number;
  filteredPriority: number;
  modelLoaded: boolean;
  modelLoading: boolean;
  modelError: string | null;
}

interface CameraFeedProps {
  camera: CameraState;
  mirror: boolean;
  showBoundingBoxes: boolean;
  showHeatmap: boolean;
  heatmapOpacity: number;
  saliencyMode: SaliencyMode;
  threshold: number;
  simulationMode: boolean;
  priorityObjects: string[];
  detectionStats: DetectionStats;
  onFpsUpdate: (cameraId: number, fps: number) => void;
  onObjectsUpdate: (cameraId: number, objects: DetectedObject[]) => void;
  onSaliencyScoreUpdate: (cameraId: number, score: number) => void;
  onFrameCapture?: (canvas: HTMLCanvasElement) => void;
  onDetectFrame?: (video: HTMLVideoElement) => Promise<DetectedObject[]>;
  noSignalMessage?: string;
}

export default function CameraFeed({
  camera,
  mirror,
  showBoundingBoxes,
  showHeatmap,
  heatmapOpacity,
  saliencyMode,
  threshold,
  simulationMode,
  priorityObjects,
  detectionStats,
  onFpsUpdate,
  onObjectsUpdate,
  onSaliencyScoreUpdate,
  onFrameCapture,
  onDetectFrame,
  noSignalMessage,
}: CameraFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const fpsCountRef = useRef(0);
  const fpsTimeRef = useRef(Date.now());
  const animRef = useRef<number>(0);
  const detectedObjectsRef = useRef<DetectedObject[]>([]);
  const detectionIntervalRef = useRef<number>(0);
  const [simObjects] = useState<DetectedObject[]>(() => {
    if (!simulationMode) return [];
    return [
      { label: 'person', confidence: 0.92, bbox: [50, 30, 120, 200] },
      { label: 'laptop', confidence: 0.85, bbox: [200, 150, 100, 80] },
      { label: 'cup', confidence: 0.73, bbox: [320, 180, 40, 50] },
    ];
  });

  // Set stream on video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !camera.stream) return;
    video.srcObject = camera.stream;
    video.play().catch(() => {});
    return () => { video.srcObject = null; };
  }, [camera.stream, camera.label]);

  // Object detection loop (separate from render loop, runs every 200ms)
  useEffect(() => {
    if (!camera.active || simulationMode || !onDetectFrame) return;
    const video = videoRef.current;
    if (!video) return;

    const runDetection = async () => {
      if (video.readyState >= 2) {
        const objects = await onDetectFrame(video);
        detectedObjectsRef.current = objects;
        onObjectsUpdate(camera.id, objects);
      }
    };

    detectionIntervalRef.current = window.setInterval(runDetection, 200);
    return () => { window.clearInterval(detectionIntervalRef.current); };
  }, [camera.active, camera.label, simulationMode, onDetectFrame, onObjectsUpdate]);

  // Main render loop — CAM 1 shows RAW feed only (no bounding boxes)
  useEffect(() => {
    if (!camera.active && !simulationMode) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;

      const w = canvas.width;
      const h = canvas.height;

      // Draw video frame or simulation
      if (video && video.readyState >= 2) {
        ctx.save();
        if (mirror) {
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();
      } else if (simulationMode) {
        const t = Date.now() / 1000;
        const imgData = ctx.createImageData(w, h);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const nx = x / w;
            const ny = y / h;
            const v1 = Math.sin(nx * 20 + t * 1.5) * Math.cos(ny * 15 + t * 0.9);
            const v2 = Math.sin((nx + ny) * 12 + t * 2) * 0.5;
            const v3 = Math.cos(nx * 8 - ny * 6 + t * 1.2) * 0.3;
            const v = (v1 + v2 + v3) * 0.5 + 0.5;
            const brightness = Math.floor(v * 220 + 20);
            imgData.data[i] = Math.floor(brightness * 0.4);
            imgData.data[i + 1] = Math.floor(brightness * 0.7);
            imgData.data[i + 2] = brightness;
            imgData.data[i + 3] = 255;
          }
        }
        ctx.putImageData(imgData, 0, 0);
      }

      // Compute saliency score silently (no overlay on CAM 1)
      try {
        const frameData = ctx.getImageData(0, 0, w, h);
        const saliencyData = computeSaliency(frameData, prevFrameRef.current, saliencyMode, threshold);
        prevFrameRef.current = frameData;
        const score = computeSaliencyScore(saliencyData);
        onSaliencyScoreUpdate(camera.id, score);
      } catch {}

      // Capture frame for other panels
      onFrameCapture?.(canvas);

      // Simulation mode: still report objects for other panels
      if (simulationMode && simObjects.length > 0) {
        onObjectsUpdate(camera.id, simObjects);
      }

      // FPS counter
      fpsCountRef.current++;
      const now = Date.now();
      if (now - fpsTimeRef.current >= 1000) {
        onFpsUpdate(camera.id, fpsCountRef.current);
        fpsCountRef.current = 0;
        fpsTimeRef.current = now;
      }

      animRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [camera.active, simulationMode, mirror, saliencyMode, threshold, simObjects, onFpsUpdate, onObjectsUpdate, onSaliencyScoreUpdate, onFrameCapture]);

  return (
    <div className="relative bg-card rounded-md overflow-hidden border border-border panel-glow group">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-2 py-1 bg-gradient-to-b from-background/80 to-transparent">
        <span className="text-[10px] font-mono text-primary uppercase tracking-wider">
          CAM 1 — Raw Feed
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground">
            {camera.fps} FPS
          </span>
          <span className={`w-1.5 h-1.5 rounded-full ${camera.active || simulationMode ? 'bg-success' : 'bg-destructive'}`} />
        </div>
      </div>

      {/* Video (hidden, used as source) */}
      <video ref={videoRef} className="hidden" autoPlay playsInline muted />

      {/* Canvas (displayed) — clean raw feed */}
      <canvas
        ref={canvasRef}
        width={camera.active ? 640 : 320}
        height={camera.active ? 480 : 240}
        className="w-full h-full object-contain aspect-video bg-background"
      />

      {/* Status badges */}
      <div className="absolute bottom-1 left-1 z-10 flex gap-1">
        <span className={`text-[9px] font-mono px-1 py-0.5 rounded ${
          detectionStats.modelLoaded ? 'bg-success/20 text-success' :
          detectionStats.modelLoading ? 'bg-warning/20 text-warning' :
          'bg-muted/50 text-muted-foreground'
        }`}>
          {detectionStats.modelLoading ? 'LOADING…' : detectionStats.modelLoaded ? 'MODEL OK' : 'NO MODEL'}
        </span>
        {detectionStats.modelLoaded && (
          <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-secondary/60 text-secondary-foreground">
            {detectionStats.filteredPriority}/{detectionStats.totalDetected} obj
          </span>
        )}
      </div>

      {/* Saliency score badge */}
      <div className="absolute bottom-1 right-1 z-10">
        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
          camera.saliencyScore > 60 ? 'bg-destructive/80 text-destructive-foreground' :
          camera.saliencyScore > 30 ? 'bg-warning/80 text-warning-foreground' :
          'bg-secondary/80 text-secondary-foreground'
        }`}>
          S:{camera.saliencyScore}
        </span>
      </div>

      {detectionStats.modelError && (
        <div className="absolute top-8 left-1 right-1 z-10">
          <span className="text-[9px] font-mono text-destructive bg-destructive/10 px-1.5 py-0.5 rounded block truncate">
            ⚠ {detectionStats.modelError}
          </span>
        </div>
      )}

      {!camera.active && !simulationMode && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 p-4 text-center">
          <span className="text-xs font-mono text-muted-foreground">
            {noSignalMessage ?? 'NO SIGNAL'}
          </span>
        </div>
      )}
    </div>
  );
}
