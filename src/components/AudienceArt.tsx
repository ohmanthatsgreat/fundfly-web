/**
 * Original, license-free SVG illustrations for the audience cards.
 * Crisp geometric line-art tuned to the cool navy/steel/blue palette.
 * Each fills its parent header (absolute inset-0) and sits behind the
 * card's text label.
 */

const stroke = "rgba(255,255,255,0.55)";
const faint = "rgba(255,255,255,0.18)";
const node = "#93c5fd";

/** Small Business — a city skyline with a rising trend line. */
export function SmallBusinessArt() {
  return (
    <svg
      viewBox="0 0 400 180"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      {/* baseline */}
      <line x1="20" y1="150" x2="380" y2="150" stroke={faint} strokeWidth="1.5" />

      {/* buildings */}
      <g stroke={stroke} strokeWidth="2" strokeLinejoin="round">
        <rect x="46" y="96" width="42" height="54" rx="2" />
        <rect x="96" y="68" width="46" height="82" rx="2" />
        <rect x="150" y="110" width="38" height="40" rx="2" />
        <rect x="196" y="50" width="48" height="100" rx="2" />
        <rect x="252" y="86" width="42" height="64" rx="2" />
        <rect x="302" y="116" width="36" height="34" rx="2" />
      </g>

      {/* windows */}
      <g fill={faint}>
        <rect x="106" y="80" width="6" height="6" />
        <rect x="120" y="80" width="6" height="6" />
        <rect x="106" y="96" width="6" height="6" />
        <rect x="120" y="96" width="6" height="6" />
        <rect x="206" y="64" width="6" height="6" />
        <rect x="222" y="64" width="6" height="6" />
        <rect x="206" y="82" width="6" height="6" />
        <rect x="222" y="82" width="6" height="6" />
        <rect x="206" y="100" width="6" height="6" />
        <rect x="222" y="100" width="6" height="6" />
      </g>

      {/* rising trend line */}
      <polyline
        points="40,138 110,118 180,96 250,74 330,44"
        stroke={node}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      {/* arrowhead */}
      <polyline
        points="312,42 330,44 328,62"
        stroke={node}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.9"
      />
      <g fill={node}>
        <circle cx="110" cy="118" r="3.5" />
        <circle cx="180" cy="96" r="3.5" />
        <circle cx="250" cy="74" r="3.5" />
      </g>
    </svg>
  );
}

/** Individuals — a portrait node within concentric rings + a guiding star. */
export function IndividualsArt() {
  return (
    <svg
      viewBox="0 0 400 180"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      {/* concentric rings */}
      <g stroke={faint} strokeWidth="1.5">
        <circle cx="150" cy="92" r="78" />
        <circle cx="150" cy="92" r="58" />
      </g>

      {/* person silhouette */}
      <g stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="150" cy="74" r="20" />
        <path d="M114 126 C114 100, 186 100, 186 126" />
      </g>

      {/* connecting network nodes */}
      <g stroke={faint} strokeWidth="1.5">
        <line x1="228" y1="48" x2="300" y2="40" />
        <line x1="228" y1="92" x2="312" y2="92" />
        <line x1="228" y1="136" x2="300" y2="146" />
      </g>
      <g fill={node}>
        <circle cx="300" cy="40" r="5" />
        <circle cx="312" cy="92" r="5" />
        <circle cx="300" cy="146" r="5" />
      </g>

      {/* guiding star */}
      <path
        d="M338 36 L342 48 L354 50 L345 58 L347 70 L338 64 L329 70 L331 58 L322 50 L334 48 Z"
        fill="none"
        stroke={node}
        strokeWidth="2"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}
