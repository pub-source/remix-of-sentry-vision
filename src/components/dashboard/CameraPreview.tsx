import { useEffect, useRef } from 'react';

/** Draws a small, low-rate overview from the camera's existing canvas; no extra stream. */
export default function CameraPreview({ source }: { source: HTMLCanvasElement | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!source) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const draw = () => {
      if (source.width && source.height) {
        try { ctx.drawImage(source, 0, 0, canvas.width, canvas.height); } catch { /* feed not ready */ }
      }
    };
    draw();
    const timer = window.setInterval(draw, 250);
    return () => window.clearInterval(timer);
  }, [source]);

  return <canvas ref={canvasRef} width={480} height={270} className="block w-full aspect-video object-contain bg-background" aria-label="Camera 1 preview" />;
}