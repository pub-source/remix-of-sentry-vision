import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { VideoOff, Video } from 'lucide-react';
import type { CameraSlot } from '@/hooks/useCameraSlots';

/**
 * Left-hand CAM 1..4 selector for the main monitoring frame.
 *
 * Selecting a camera only changes which feed is *displayed*. Every other
 * configured camera keeps streaming on the backend and its audio monitoring
 * (Whisper wake-word pipeline) is untouched.
 */
export function CameraSlotSelector({
  slots,
  selected,
  onSelect,
  primaryLive,
}: {
  slots: CameraSlot[];
  selected: number;
  onSelect: (index: number) => void;
  /** CAM 1 is the dashboard's fused pipeline — its live state comes from the dashboard. */
  primaryLive: boolean;
}) {
  return (
    <div
      className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible shrink-0 lg:w-28"
      role="tablist"
      aria-label="Select camera"
    >
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

/** Read-only HLS view for CAM 2..4 in the main frame. */
export function SlotLiveView({ slot }: { slot: CameraSlot | undefined }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const url = slot?.connected ? slot.streamUrl || '' : '';

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    let hls: Hls | null = null;
    if (Hls.isSupported()) {
      hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 3 });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (d.fatal && d.type === Hls.ErrorTypes.MEDIA_ERROR) hls?.recoverMediaError();
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.play().catch(() => {});
    }
    return () => {
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [url]);

  return (
    <div className="relative bg-card rounded-md overflow-hidden border border-border panel-glow">
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-2 py-1 bg-gradient-to-b from-background/80 to-transparent">
        <span className="text-[10px] font-mono text-primary uppercase tracking-wider">
          CAM {slot?.index ?? '-'} — {slot?.name || 'Camera'}
        </span>
        <span className={`w-1.5 h-1.5 rounded-full ${url ? 'bg-success' : 'bg-destructive'}`} />
      </div>
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        className="w-full aspect-video object-contain bg-background"
      />
      {!url && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/85 text-center px-4">
          <VideoOff className="w-7 h-7 text-muted-foreground" />
          <span className="text-[13px] font-semibold text-muted-foreground">Not connected</span>
          <span className="text-[12px] text-muted-foreground">
            Open Connect and add an IP address for CAM {slot?.index ?? ''}.
          </span>
        </div>
      )}
    </div>
  );
}

export default CameraSlotSelector;
