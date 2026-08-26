import { useMemo } from 'react';
import { VideoOff, Video, ChevronLeft, ChevronRight, Flame, Users, Mic, Smile } from 'lucide-react';
import { useCameraPipeline } from '@/hooks/useCameraPipeline';
import { slotCamera, slotSettings, type CameraSlot } from '@/hooks/useCameraSlots';
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
        className="self-start flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-2 text-[13px] font-bold text-primary hover:border-primary/60 transition-colors"
      >
        <ChevronRight className="w-4 h-4" /> <span aria-hidden="true">&gt;&gt;</span>
        <span className="lg:[writing-mode:vertical-rl] lg:rotate-180">CAM {selected}</span>
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
        className="flex items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> <span aria-hidden="true">&lt;&lt;</span> Hide
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
      enabled: !!slot.ip.trim() && !!slot.connected,
      aiEnabled: slot.aiEnabled && monitoring,
    }),
    [slot, monitoring],
  );
  const settings = useMemo(() => slotSettings(slot), [slot]);
  const { videoRef, runtime } = useCameraPipeline({ camera, settings, onEvent, onTranscript });

  const connected = camera.enabled;
  const badge = (ok: boolean, Icon: typeof Flame, text: string) => (
    <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${ok ? 'bg-destructive/20 text-destructive' : 'bg-secondary/40 text-muted-foreground'}`}>
      <Icon className="w-3 h-3" /> {text}
    </span>
  );

  return (
    <div
      aria-hidden={!visible}
      className={
        visible
          ? 'relative bg-card rounded-md overflow-hidden border border-border panel-glow'
          : 'absolute -left-[9999px] top-0 w-[320px] pointer-events-none opacity-0'
      }
    >
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-2 py-1 bg-gradient-to-b from-background/80 to-transparent">
        <span className="text-[12px] font-semibold text-primary uppercase tracking-wider">
          CAM {slot.index} — {slot.name || 'Camera'}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{runtime.fps} fps</span>
          <span className={`w-2 h-2 rounded-full ${runtime.status === 'online' ? 'bg-success' : connected ? 'bg-warning' : 'bg-destructive'}`} />
        </span>
      </div>

      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="w-full aspect-video object-contain bg-background"
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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/85 text-center px-4">
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
