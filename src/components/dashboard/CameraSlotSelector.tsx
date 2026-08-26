import { useMemo, useRef, useState } from 'react';
import { VideoOff, Video, Flame, Users, Mic, Smile, Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react';
import { useCameraPipeline } from '@/hooks/useCameraPipeline';
import { slotCamera, slotSettings, type CameraSlot } from '@/hooks/useCameraSlots';
import { useCctvTalk } from '@/hooks/useCctvTalk';
import type { CameraConfig, DetectionEvent } from '@/types/multicam';

/**
 * Left-hand CAM 1..4 selector for the main monitoring frame.
 *
 * Selecting a camera only changes which feed is *displayed*. Every other
 * configured camera keeps streaming and keeps running its own independent
 * saliency pipeline (objects, fire, smoke, faces, CCTV audio).
 *
 * The rail is collapsible: `>>` hides it to give the video more room, `<<`
 * brings it back.
 */
export function CameraSlotSelector({
  slots,
  selected,
  onSelect,
  primaryLive,
  open,
  onToggleOpen,
}: {
  slots: CameraSlot[];
  selected: number;
  onSelect: (index: number) => void;
  /** CAM 1 is the dashboard's fused pipeline — its live state comes from the dashboard. */
  primaryLive: boolean;
  open: boolean;
  onToggleOpen: (open: boolean) => void;
}) {
  if (!open) {
    return (
      <button
        onClick={() => onToggleOpen(true)}
        aria-label="Show camera list"
        title="Show camera list"
        className="self-start px-2 py-1 text-xl font-black text-primary hover:text-primary/80 transition-colors"
      >
        <span aria-hidden="true">&gt;&gt;</span>
      </button>
    );
  }

  return (
    <div
      className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible shrink-0 lg:w-28"
      role="tablist"
      aria-label="Select camera"
    >
      <button
        onClick={() => onToggleOpen(false)}
        aria-label="Hide camera list"
        title="Hide camera list"
        className="flex items-center justify-center px-2 py-1 text-xl font-black text-primary hover:text-primary/80 transition-colors"
      >
        <span aria-hidden="true">&lt;&lt;</span>
      </button>
      {[1, 2, 3, 4].map(index => {
        const slot = slots.find(s => s.index === index);
        const live = index === 1 ? primaryLive : !!slot?.connected;
        const active = selected === index;
        return (
          <button
            key={index}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(index)}
            title={slot?.name || `Camera ${index}`}
            className={`min-w-[6.5rem] lg:min-w-0 flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left transition-all ${
              active
                ? 'border-primary bg-primary/15 ring-2 ring-primary/40'
                : 'border-border bg-card hover:border-primary/50'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {live ? <Video className="w-3.5 h-3.5 text-success" /> : <VideoOff className="w-3.5 h-3.5 text-muted-foreground" />}
              <span className={`text-[13px] font-bold ${active ? 'text-primary' : 'text-foreground'}`}>CAM {index}</span>
            </span>
            <span className="text-[11px] text-muted-foreground truncate w-full">
              {live ? 'Live' : 'Not connected'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Full independent detection pipeline for CAM 2..4.
 *
 * The component stays mounted for every configured slot even when another
 * camera is selected — it is only moved off-screen — so detection, alerts and
 * CCTV audio monitoring never stop when the operator switches views.
 */
export function SlotPipelineView({
  slot,
  monitoring,
  visible,
  onEvent,
  onTranscript,
}: {
  slot: CameraSlot;
  /** Dashboard monitoring switch — stops the AI work when the user presses Stop. */
  monitoring: boolean;
  visible: boolean;
  onEvent?: (evt: Omit<DetectionEvent, 'id'>) => void;
  onTranscript?: (text: string, camera: CameraConfig) => void;
}) {
  const camera = useMemo(
    () => ({
      ...slotCamera(slot),
      enabled: monitoring && !!slot.ip.trim() && !!slot.connected,
      aiEnabled: slot.aiEnabled && monitoring,
    }),
    [slot, monitoring],
  );
  const settings = useMemo(() => slotSettings(slot), [slot]);
  const { videoRef, runtime } = useCameraPipeline({ camera, settings, onEvent, onTranscript });
  const frameRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const talk = useCctvTalk(settings.pythonServer, camera.id);

  const connected = camera.enabled;

  // Full-rate display canvas: the fused view draws its overlays on top of this.
  useEffect(() => {
    if (!displayCanvasRef.current) displayCanvasRef.current = document.createElement('canvas');
    const canvas = displayCanvasRef.current;
    setSourceCanvas(canvas);
    let raf = 0;
    const pump = () => {
      const video = videoRef.current;
      if (video && video.videoWidth && video.readyState >= 2) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      raf = requestAnimationFrame(pump);
    };
    raf = requestAnimationFrame(pump);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  // The fused view expects dashboard-style audio features; derive them from the
  // camera's own CCTV audio -> Whisper pipeline.
  const audioFeatures: AudioFeatures = useMemo(
    () => ({
      decibel: runtime.audioDistress.detected ? -5 : -60,
      speechDetected: !!runtime.audioDistress.transcript,
      pitchEstimate: 0,
      waveform: [],
      audioEvent: runtime.audioDistress.detected
        ? (/scream|shout|yell/i.test(runtime.audioDistress.keyword) ? 'scream' : 'speech')
        : 'none',
    }),
    [runtime.audioDistress],
  );

  const badge = (ok: boolean, Icon: typeof Flame, text: string) => (
    <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${ok ? 'bg-destructive/20 text-destructive' : 'bg-secondary/40 text-muted-foreground'}`}>
      <Icon className="w-3 h-3" /> {text}
    </span>
  );

  return (
    <div
      ref={frameRef}
      aria-hidden={!visible}
      className={
        visible
          ? 'relative'
          : 'absolute -left-[9999px] top-0 w-[320px] pointer-events-none opacity-0'
      }
    >
      {/* Raw stream — hidden; it only feeds the fused canvas and the audio element. */}
      <video
        ref={videoRef}
        muted={!audioEnabled}
        playsInline
        autoPlay
        className="hidden"
      />

      <FusedDetectionView
        title={`CAM ${slot.index} — ${slot.name || 'Fused Detection'}`}
        sourceCanvas={sourceCanvas}
        objects={runtime.objects}
        audioFeatures={audioFeatures}
        attentionScore={runtime.saliencyScore}
        saliencyScore={runtime.saliencyScore}
        active={visible && connected}
        transcript={runtime.audioDistress.transcript || ''}
        interimTranscript=""
        fireBbox={runtime.fire.detected ? runtime.fire.bbox : undefined}
        cctvAudioEnabled={audioEnabled}
        cctvAudioAvailable={connected}
        onToggleCctvAudio={() => setAudioEnabled(value => !value)}
        talking={talk.talking}
        talkError={talk.error}
        onTalkStart={talk.startTalk}
        onTalkStop={talk.stopTalk}
      />

      {connected && (
        <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-gradient-to-t from-background/90 to-transparent">
          {badge(runtime.fire.detected, Flame, `Fire ${Math.round(runtime.fire.confidence * 100)}%`)}
          {badge(runtime.humanCount > 0, Users, `${runtime.humanCount} person`)}
          {badge(runtime.faceDistress.detected, Smile, 'Face distress')}
          {badge(runtime.audioDistress.detected, Mic, runtime.audioDistress.keyword || 'Audio')}
          <span className="ml-auto text-[11px] font-semibold text-muted-foreground">
            Saliency {runtime.saliencyScore}/100
          </span>
        </div>
      )}

      {!connected && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/85 text-center px-4">
          <VideoOff className="w-7 h-7 text-muted-foreground" />
          <span className="text-[14px] font-semibold text-muted-foreground">Not connected</span>
          <span className="text-[13px] text-muted-foreground">
            Open Connect and add an IP address for CAM {slot.index}.
          </span>
        </div>
      )}
    </div>
  );
}


export default CameraSlotSelector;
