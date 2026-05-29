"use client";

import { useEffect, useRef } from "react";

/**
 * Interactive hero headline. A soft accent spotlight tracks the cursor behind
 * the text (mirroring the stats banner), and the colored "We find yours."
 * gradient shifts its position with the cursor's horizontal travel. Both
 * effects are written straight to the DOM via rAF (no React re-renders) and are
 * skipped under prefers-reduced-motion — the gradient text stays colorful when
 * static.
 */
export default function HeroHeadline() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const accentRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const wrap = wrapRef.current;
    const spotlight = spotlightRef.current;
    const accent = accentRef.current;
    if (!wrap || !spotlight || !accent) return;

    let frame = 0;
    function onMove(e: MouseEvent) {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = wrap!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        spotlight!.style.background = `radial-gradient(520px circle at ${x}px ${y}px, rgba(37, 99, 235, 0.14), transparent 60%)`;
        const px = Math.max(0, Math.min(100, (x / rect.width) * 100));
        accent!.style.backgroundPosition = `${px}% 50%`;
      });
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <div
        ref={spotlightRef}
        aria-hidden
        className="pointer-events-none absolute -inset-x-24 -inset-y-12"
      />
      <h1 className="relative text-5xl md:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
        There are billions in
        <br />
        grants waiting.
        <br />
        <span ref={accentRef} className="hero-accent-text">
          We find yours.
        </span>
      </h1>
    </div>
  );
}
