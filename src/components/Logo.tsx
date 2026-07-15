/**
 * Loom brand mark: a note-card chip with a folded page corner, carrying a
 * plain-weave interlace (two warp threads over/under two weft threads) in
 * place of note rules. Original vector drawn for this app; no third-party
 * logo assets are copied.
 */

export function LoomMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="loom-mark"
    >
      <defs>
        <linearGradient id="loom-chip" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3b8d7" />
          <stop offset="0.55" stopColor="#e893c0" />
          <stop offset="1" stopColor="#b85f96" />
        </linearGradient>
        <linearGradient id="loom-fold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fde9f4" />
          <stop offset="1" stopColor="#f6c6e0" />
        </linearGradient>
      </defs>

      {/* chip with the top-right corner cut away */}
      <path
        d="M7 .5 H16.5 L23.5 7.5 V17 A6.5 6.5 0 0 1 17 23.5 H7 A6.5 6.5 0 0 1 .5 17 V7 A6.5 6.5 0 0 1 7 .5 Z"
        fill="url(#loom-chip)"
      />
      {/* folded page corner */}
      <path
        d="M16.5 .5 L23.5 7.5 H18.5 A2 2 0 0 1 16.5 5.5 Z"
        fill="url(#loom-fold)"
      />
      <path
        d="M16.5 .5 L23.5 7.5"
        stroke="#8f4573"
        strokeWidth="0.6"
        opacity="0.55"
      />

      {/* weave interlace: dark warp (vertical) under/over cream weft
          (horizontal) — two-tone so it reads as fabric, not a symbol */}
      <g strokeWidth="2.4" strokeLinecap="round" fill="none">
        {/* warp threads, dark: left passes under the bottom weft,
            right passes under the top weft */}
        <path d="M8.2 5.6 V13.9 M8.2 17.1 V19.4" stroke="#2a1220" />
        <path d="M14.8 5.6 V8.9 M14.8 12.1 V19.4" stroke="#2a1220" />
        {/* weft threads, cream: top passes over left warp + under right,
            bottom passes under left + over right */}
        <path d="M4.6 10.5 H13.2 M16.4 10.5 H19.4" stroke="#fdf0f7" />
        <path d="M4.6 15.5 H6.6 M9.8 15.5 H19.4" stroke="#fdf0f7" />
      </g>
    </svg>
  );
}

export function LoomLogo({ size = 22 }: { size?: number }) {
  return (
    <span className="loom-logo">
      <LoomMark size={size} />
      <span className="loom-word" style={{ fontSize: size * 0.82 }}>
        Loom
      </span>
    </span>
  );
}
