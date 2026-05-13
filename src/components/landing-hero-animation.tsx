'use client';

/**
 * Full-bleed Apple-style hero background.
 *
 * Replaces the boxed network graphic with a cinematic full-viewport
 * scene tuned to ELEC3120 (Computer Networks):
 *
 *  • Layered animated gradient mesh (Stripe / Apple Vision-Pro vibes)
 *  • Slow-drifting hex grid for depth
 *  • A live packet stream travelling across the viewport (TCP segments
 *    with seq/ack/SYN labels) — directly tied to course content
 *  • The 5-layer TCP/IP stack column floating on the right
 *  • Soft vignette so foreground copy stays readable
 *
 * No external assets. Pure SVG + CSS keyframes. Designed to sit BEHIND
 * the hero text with `position: absolute inset-0`.
 */
export function LandingHeroAnimation() {
  // Five horizontal "wires" the packets travel along. Y-positions are
  // % of viewBox height so the layout scales nicely on any aspect ratio.
  const lanes = [
    { y: 18, dur: 11, delay: 0,    label: 'SYN',     color: '#67e8f9' },
    { y: 34, dur: 14, delay: 2.1,  label: 'GET /',   color: '#34d399' },
    { y: 50, dur: 9,  delay: 4.3,  label: 'ACK 4096', color: '#5eead4' },
    { y: 66, dur: 13, delay: 1.5,  label: 'DATA 1460', color: '#a7f3d0' },
    { y: 82, dur: 10, delay: 3.7,  label: 'FIN',     color: '#22d3ee' },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* ── Layer 1 · Animated gradient mesh ─────────────────────────── */}
      <div className="absolute inset-0">
        <div className="lp-mesh lp-mesh-1" />
        <div className="lp-mesh lp-mesh-2" />
        <div className="lp-mesh lp-mesh-3" />
      </div>

      {/* ── Layer 2 · Hex grid (very subtle, drifts slowly) ──────────── */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.10] lp-drift"
        aria-hidden
      >
        <defs>
          <pattern id="hex" width="56" height="48" patternUnits="userSpaceOnUse" patternTransform="translate(0 0)">
            <path
              d="M28 0 L56 16 L56 48 L28 64 L0 48 L0 16 Z"
              fill="none"
              stroke="#34d399"
              strokeWidth="0.6"
            />
          </pattern>
          <radialGradient id="hex-mask">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="70%" stopColor="white" stopOpacity="0.4" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="hex-fade">
            <rect width="100%" height="100%" fill="url(#hex-mask)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="url(#hex)" mask="url(#hex-fade)" />
      </svg>

      {/* ── Layer 3 · TCP packet stream ──────────────────────────────── */}
      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 w-full h-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="laneFade" x1="0%" x2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
            <stop offset="20%" stopColor="#10b981" stopOpacity="0.45" />
            <stop offset="80%" stopColor="#22d3ee" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
          <filter id="pktGlow">
            <feGaussianBlur stdDeviation="3" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="2.2" />
            </feComponentTransfer>
            <feComposite in2="SourceGraphic" operator="over" />
          </filter>
        </defs>

        {/* Lane wires */}
        {lanes.map((l) => {
          const y = (l.y / 100) * 900;
          return (
            <line
              key={`wire-${l.y}`}
              x1="0"
              x2="1600"
              y1={y}
              y2={y}
              stroke="url(#laneFade)"
              strokeWidth="0.8"
              strokeDasharray="2 6"
            />
          );
        })}

        {/* Travelling TCP segments — small rectangles with text labels */}
        {lanes.map((l) => {
          const y = (l.y / 100) * 900;
          return (
            <g key={`pkt-${l.y}`} className="lp-pkt" style={{
              animationDuration: `${l.dur}s`,
              animationDelay: `${l.delay}s`,
            }}>
              <rect
                x="-180"
                y={y - 14}
                width="170"
                height="28"
                rx="6"
                fill="#0a0a0b"
                stroke={l.color}
                strokeWidth="1.2"
                opacity="0.95"
              />
              <circle cx="-160" cy={y} r="3" fill={l.color} filter="url(#pktGlow)" />
              <text
                x="-145"
                y={y + 4}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontSize="12"
                fill={l.color}
                opacity="0.95"
              >
                TCP · {l.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* ── Layer 4 · Floating OSI / TCP-IP stack column (right side) ─ */}
      <div className="hidden lg:block absolute top-1/2 right-10 -translate-y-1/2 space-y-2.5">
        {[
          { en: 'Application', sub: 'HTTP · DNS · SMTP', delay: 0 },
          { en: 'Transport',   sub: 'TCP · UDP',        delay: 0.15 },
          { en: 'Network',     sub: 'IP · ICMP · BGP',  delay: 0.3 },
          { en: 'Link',        sub: 'Ethernet · ARP',   delay: 0.45 },
          { en: 'Physical',    sub: 'Signals · Cabling', delay: 0.6 },
        ].map((layer, i) => (
          <div
            key={layer.en}
            className="lp-stack-card group flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md w-[220px]"
            style={{ animationDelay: `${layer.delay}s` }}
          >
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-mono font-bold"
              style={{
                background: `linear-gradient(135deg, rgba(16,185,129,${0.18 + i * 0.04}), rgba(34,211,238,${0.10 + i * 0.04}))`,
                color: '#5eead4',
              }}
            >
              L{5 - i}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-white/90 leading-tight">{layer.en}</div>
              <div className="text-[10px] font-mono text-white/45 leading-tight truncate">{layer.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Layer 5 · Vignette / foreground readability mask ──────────── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 30% 50%, transparent 0%, rgba(10,10,11,0.55) 60%, rgba(10,10,11,0.85) 100%)',
        }}
      />

      <style jsx>{`
        /* Mesh blobs */
        :global(.lp-mesh) {
          position: absolute;
          border-radius: 9999px;
          filter: blur(120px);
          opacity: 0.7;
          will-change: transform;
        }
        :global(.lp-mesh-1) {
          top: -10%;
          left: -10%;
          width: 60vw;
          height: 60vw;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.55), transparent 60%);
          animation: lp-drift-1 22s ease-in-out infinite;
        }
        :global(.lp-mesh-2) {
          top: 20%;
          right: -10%;
          width: 50vw;
          height: 50vw;
          background: radial-gradient(circle, rgba(34, 211, 238, 0.45), transparent 60%);
          animation: lp-drift-2 28s ease-in-out infinite;
        }
        :global(.lp-mesh-3) {
          bottom: -20%;
          left: 25%;
          width: 55vw;
          height: 55vw;
          background: radial-gradient(circle, rgba(16, 185, 129, 0.35), transparent 60%);
          animation: lp-drift-3 32s ease-in-out infinite;
        }
        @keyframes lp-drift-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(8vw, 4vh) scale(1.1); }
        }
        @keyframes lp-drift-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-6vw, 6vh) scale(1.15); }
        }
        @keyframes lp-drift-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(4vw, -8vh) scale(1.05); }
        }

        /* Hex grid slow drift */
        :global(.lp-drift) {
          animation: lp-hex-drift 40s linear infinite;
        }
        @keyframes lp-hex-drift {
          0% { transform: translate(0, 0); }
          100% { transform: translate(-56px, -48px); }
        }

        /* TCP packet glide across viewport */
        :global(.lp-pkt) {
          animation-name: lp-glide;
          animation-iteration-count: infinite;
          animation-timing-function: cubic-bezier(0.45, 0.05, 0.55, 0.95);
        }
        @keyframes lp-glide {
          0%   { transform: translateX(0);     opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { transform: translateX(1850px); opacity: 0; }
        }

        /* Stack cards float in then very subtly bob */
        :global(.lp-stack-card) {
          opacity: 0;
          transform: translateX(20px);
          animation: lp-stack-in 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) forwards,
                     lp-stack-bob 6s ease-in-out infinite 1.2s;
        }
        @keyframes lp-stack-in {
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes lp-stack-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-3px); }
        }

        @media (prefers-reduced-motion: reduce) {
          :global(.lp-mesh),
          :global(.lp-drift),
          :global(.lp-pkt),
          :global(.lp-stack-card) {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
