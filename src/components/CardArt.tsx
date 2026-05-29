import type { ReactNode } from "react";

export type CardArtVariant =
  | "search"
  | "match"
  | "draft"
  | "tracker"
  | "secure"
  | "instant";

/**
 * Crisp geometric card decorations that replace flat icons. Each motif is
 * line-art drawn with currentColor (so it inherits the accent + adapts to
 * theme) inside a softly tinted rounded tile. Cool/minimal to match the
 * audience-card illustrations.
 */
const MOTIFS: Record<CardArtVariant, ReactNode> = {
  search: (
    <>
      <g fill="currentColor" stroke="none" opacity="0.3">
        <circle cx="10" cy="9" r="1.3" />
        <circle cx="16" cy="9" r="1.3" />
        <circle cx="22" cy="9" r="1.3" />
        <circle cx="10" cy="15" r="1.3" />
      </g>
      <circle cx="18" cy="20" r="8" />
      <line x1="24" y1="26" x2="32" y2="34" />
    </>
  ),
  match: (
    <>
      <circle cx="20" cy="20" r="12" opacity="0.35" />
      <circle cx="20" cy="20" r="7" />
      <circle cx="20" cy="20" r="2.3" fill="currentColor" stroke="none" />
    </>
  ),
  draft: (
    <>
      <rect x="10" y="6" width="17" height="24" rx="2" />
      <line x1="14" y1="13" x2="23" y2="13" opacity="0.4" />
      <line x1="14" y1="18" x2="23" y2="18" opacity="0.4" />
      <line x1="14" y1="23" x2="20" y2="23" opacity="0.4" />
      <path d="M24 28 l3 3 l5 -6" />
    </>
  ),
  tracker: (
    <>
      <line x1="8" y1="32" x2="34" y2="32" opacity="0.4" />
      <line x1="11" y1="32" x2="11" y2="24" />
      <line x1="18" y1="32" x2="18" y2="19" />
      <line x1="25" y1="32" x2="25" y2="14" />
      <line x1="32" y1="32" x2="32" y2="9" />
      <circle cx="32" cy="9" r="2.3" fill="currentColor" stroke="none" />
    </>
  ),
  secure: (
    <>
      <path d="M20 5 L31 9 V19 C31 26 26 31 20 34 C14 31 9 26 9 19 V9 Z" />
      <path d="M15 19 l4 4 l7 -8" />
    </>
  ),
  instant: (
    <>
      <g opacity="0.35">
        <line x1="5" y1="14" x2="11" y2="14" />
        <line x1="4" y1="20" x2="10" y2="20" />
      </g>
      <path d="M24 5 L13 22 H20 L18 35 L30 17 H22 Z" />
    </>
  ),
};

export default function CardArt({
  variant,
  className = "",
}: {
  variant: CardArtVariant;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent ${className}`}
    >
      <svg
        viewBox="0 0 40 40"
        className="h-7 w-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {MOTIFS[variant]}
      </svg>
    </div>
  );
}

/**
 * Oversized, very faint version of a motif, anchored in a card's bottom-right
 * corner. Sits behind the card content (place inside a `relative
 * overflow-hidden` parent) to make the card feel illustrated rather than
 * icon-plus-text. Inherits the accent via currentColor at low opacity.
 */
export function CardArtWatermark({ variant }: { variant: CardArtVariant }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className="pointer-events-none absolute -bottom-5 -right-4 h-28 w-28 text-accent/[0.06] transition-colors duration-300 group-hover:text-accent/[0.1]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {MOTIFS[variant]}
    </svg>
  );
}

/**
 * Ascending tier indicator for the pricing teaser — `level` of 4 bars filled
 * with the accent, the rest muted. Reinforces that each plan stacks on the
 * one below it.
 */
export function TierBars({
  level,
  className = "",
}: {
  level: number;
  className?: string;
}) {
  return (
    <div className={`flex items-end justify-center gap-1 h-6 ${className}`} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-1.5 rounded-sm ${i < level ? "bg-accent" : "bg-border"}`}
          style={{ height: `${35 + i * 21}%` }}
        />
      ))}
    </div>
  );
}
