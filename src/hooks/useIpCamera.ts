import { useCallback, useRef, useState } from 'react';
import Hls from 'hls.js';

export type IpCamKind = 'hls' | 'mjpeg' | 'image';

export interface IpCamConfig {
  url: string;
  kind: IpCamKind;
}

/**
 * Connects an IP camera (HLS .m3u8 or MJPEG/snapshot URL) to a video element
 * and returns a MediaStream that the dashboard can consume just like a webcam.
 * Note: raw RTSP cannot be played in the browser — convert to HLS or MJPEG.
 */
export function useIpCamera() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [audioEnabled, setAudioEnabledState] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  /** Unmute/mute the hidden CCTV video element so the operator can hear the camera. */
  const setAudioEnabled = useCallback((on: boolean) => {
    const v = videoRef.current;
    if (v) {
      v.muted = !on;
      v.volume = on ? 1 : 0;
      if (on) v.play().catch(() => {});
    }
    setAudioEnabledState(on);
  }, []);

  const disconnect = useCallback(() => {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
      videoRef.current.srcObject = null;
      videoRef.current.remove();
      videoRef.current = null;
    }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); clearTimeout(rafRef.current); rafRef.current = 0; }
    setStream(prev => { prev?.getTracks().forEach(t => t.stop()); return null; });
    setConnected(false);
    setAudioEnabledState(false);
    setError(null);
  }, []);

  const connect = useCallback(async (cfg: IpCamConfig) => {
    disconnect();
    setError(null);

    // Hidden (but attached) video — detached elements get throttled/never paint
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.crossOrigin = 'anonymous';
    video.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none';
    document.body.appendChild(video);
    videoRef.current = video;

    const canvas = document.createElement('canvas');
    canvasRef.current = canvas;

    try {
      if (cfg.kind === 'hls') {
        if (Hls.isSupported()) {
          const hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 2 });
          hlsRef.current = hls;
          hls.loadSource(cfg.url);
          hls.attachMedia(video);
          await new Promise<void>((res, rej) => {
            hls.on(Hls.Events.MANIFEST_PARSED, () => res());
            hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) rej(new Error(data.details || 'HLS error')); });
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = cfg.url;
        } else {
          throw new Error('HLS not supported in this browser');
        }
        await video.play();

        // Wait for real video dimensions before capturing, otherwise the
        // resulting track is a black 0x0 / not-yet-decoded surface.
        await new Promise<void>((res) => {
          if (video.videoWidth > 0 && video.readyState >= 2) return res();
          const done = () => { video.removeEventListener('loadeddata', done); video.removeEventListener('resize', done); res(); };
          video.addEventListener('loadeddata', done);
          video.addEventListener('resize', done);
          setTimeout(done, 8000);
        });

        if (!video.videoWidth) throw new Error('Stream produced no video frames (codec may be H.265 — force H.264 on the camera)');

        // Pump frames through a canvas: this works for MSE/hls.js in every
        // browser, whereas video.captureStream() often yields a black track.
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');
        const draw = () => {
          if (!canvasRef.current || !videoRef.current) return;
          const v = videoRef.current;
          if (v.readyState >= 2 && v.videoWidth) {
            if (canvas.width !== v.videoWidth || canvas.height !== v.videoHeight) {
              canvas.width = v.videoWidth;
              canvas.height = v.videoHeight;
            }
            try { ctx.drawImage(v, 0, 0, canvas.width, canvas.height); } catch { /* tainted */ }
          }
          rafRef.current = requestAnimationFrame(draw);
        };
        draw();
        const ms = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
        setStream(ms);
      } else if (cfg.kind === 'mjpeg' || cfg.kind === 'image') {

        // For MJPEG we draw into a canvas at ~10fps and captureStream from it
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');

        let img: HTMLImageElement | null = null;
        const loop = () => {
          if (!canvasRef.current) return;
          if (!img) {
            img = new Image();
            img.crossOrigin = 'anonymous';
          }
          // Cache-bust for MJPEG snapshot URLs
          const sep = cfg.url.includes('?') ? '&' : '?';
          img.src = cfg.kind === 'mjpeg' ? cfg.url : `${cfg.url}${sep}t=${Date.now()}`;
          img.onload = () => {
            try {
              canvas.width = img!.naturalWidth || 640;
              canvas.height = img!.naturalHeight || 480;
              ctx.drawImage(img!, 0, 0, canvas.width, canvas.height);
            } catch {}
            rafRef.current = window.setTimeout(loop, 100) as unknown as number;
          };
          img.onerror = () => {
            rafRef.current = window.setTimeout(loop, 500) as unknown as number;
          };
        };
        loop();
        const ms: MediaStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(15);
        setStream(ms);
      }
      setConnected(true);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[IpCamera] connect failed:', msg);
      setError(msg);
      disconnect();
      return false;
    }
  }, [disconnect]);

  return { connect, disconnect, stream, connected, error, audioEnabled, setAudioEnabled };
}