"use client";

import { useEffect, useRef } from "react";

/**
 * Subtle "cloth-like" interactive background for the dark stats banner.
 * Three slowly drifting blurred gradient blobs create flowing folds of light,
 * and a soft highlight tracks the cursor for the interactive feel. The cursor
 * highlight is written straight to the DOM via rAF (no React re-renders), and
 * all motion is disabled under prefers-reduced-motion (see globals.css).
 *
 * Rendered absolutely inside a `relative overflow-hidden` parent and sits
 * behind the content (pointer-events: none so it never blocks clicks).
 */
export default function ClothBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const highlight = highlightRef.current;
    if (!container || !highlight) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    function onMove(e: MouseEvent) {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = container!.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        highlight!.style.background = `radial-gradient(600px circle at ${x}% ${y}%, rgba(96,165,250,0.28), transparent 60%)`;
      });
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="cloth-blob cloth-blob-1" />
      <div className="cloth-blob cloth-blob-2" />
      <div className="cloth-blob cloth-blob-3" />
      <div ref={highlightRef} className="absolute inset-0" />
    </div>
  );
}
