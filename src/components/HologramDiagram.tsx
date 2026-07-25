import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface HologramNode {
  id: string;
  label: string;
  detail: string;
}

interface HologramDiagramProps {
  title: string;
  subtitle?: string;
  nodes: HologramNode[];
  onClose: () => void;
}

/**
 * Hologram-style overlay: an animated cyan SVG pipeline diagram with
 * scanlines, glow, chromatic-aberration hint and a rotating grid floor.
 * Not real WebGL holography — pure SVG/CSS effect that reads as HUD.
 */
export default function HologramDiagram({ title, subtitle, nodes, onClose }: HologramDiagramProps) {
  const cx = 500;
  const yStep = 90;
  const startY = 120;

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      {/* Grid floor */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 pointer-events-none opacity-30"
        style={{
          background: 'linear-gradient(to top, rgba(0,229,255,0.25), transparent)',
          maskImage: 'linear-gradient(to top, black, transparent)',
        }}
      />
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(0,229,255,0.06) 3px, rgba(0,229,255,0.06) 4px)',
        }}
      />

      <motion.div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-4xl bg-black/60 border border-cyan-400/40 rounded-2xl p-6"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        style={{ boxShadow: '0 0 60px rgba(0,229,255,0.25), inset 0 0 40px rgba(0,229,255,0.08)' }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-lg text-cyan-300 hover:bg-cyan-400/10"
          aria-label="Close diagram"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-4">
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-400/70">HOLOGRAM // PIPELINE</p>
          <h2 className="text-2xl font-bold text-cyan-100" style={{ textShadow: '0 0 12px rgba(0,229,255,0.6)' }}>
            {title}
          </h2>
          {subtitle && <p className="text-sm text-cyan-200/70 mt-1">{subtitle}</p>}
        </div>

        <svg viewBox={`0 0 1000 ${startY + nodes.length * yStep + 40}`} className="w-full">
          <defs>
            <filter id="holoGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="holoStroke" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#67e8f9" />
              <stop offset="100%" stopColor="#a5f3fc" />
            </linearGradient>
          </defs>

          {/* Connectors */}
          {nodes.slice(0, -1).map((_, i) => (
            <motion.line
              key={`c-${i}`}
              x1={cx} y1={startY + i * yStep + 30}
              x2={cx} y2={startY + (i + 1) * yStep - 30}
              stroke="url(#holoStroke)"
              strokeWidth="2"
              strokeDasharray="6 4"
              filter="url(#holoGlow)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.9 }}
              transition={{ delay: 0.2 + i * 0.15, duration: 0.5 }}
            />
          ))}

          {/* Nodes */}
          {nodes.map((n, i) => {
            const y = startY + i * yStep;
            return (
              <motion.g
                key={n.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.15, duration: 0.4 }}
              >
                <rect
                  x={cx - 260} y={y - 30}
                  width={520} height={60} rx={10}
                  fill="rgba(6, 32, 46, 0.6)"
                  stroke="url(#holoStroke)"
                  strokeWidth="1.5"
                  filter="url(#holoGlow)"
                />
                <text x={cx - 240} y={y - 6} fill="#67e8f9" fontFamily="'JetBrains Mono', monospace" fontSize="14" fontWeight="700">
                  {String(i + 1).padStart(2, '0')} · {n.label}
                </text>
                <text x={cx - 240} y={y + 16} fill="#bae6fd" fontFamily="'JetBrains Mono', monospace" fontSize="11" opacity="0.75">
                  {n.detail}
                </text>
                {/* corner ticks */}
                {[[-260, -30], [260, -30], [-260, 30], [260, 30]].map(([dx, dy], k) => (
                  <line
                    key={k}
                    x1={cx + (dx as number)} y1={y + (dy as number)}
                    x2={cx + (dx as number) + (dx < 0 ? 8 : -8)} y2={y + (dy as number)}
                    stroke="#22d3ee" strokeWidth="2"
                  />
                ))}
              </motion.g>
            );
          })}
        </svg>

        <p className="mt-4 text-xs font-mono text-cyan-400/60 text-center">
          [ HOLO-RENDER v1.0 · signal integrity 99.7% · click outside to close ]
        </p>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
