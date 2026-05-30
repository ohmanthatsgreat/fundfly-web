"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Clock, Sparkles } from "lucide-react";

/**
 * Compact trial pill for the always-visible mobile header. The full TrialStatus
 * lives in the sidebar footer, which on mobile is hidden behind the hamburger —
 * so a trialing user never saw their countdown until they went digging for it
 * (the exact confusion that prompted this). Renders nothing when there's no
 * trial to surface.
 */
export default function MobileTrialBadge() {
  const [state, setState] = useState<{
    daysLeft: number;
    active: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/app/subscription")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const trial = d.trial;
        if (!trial) return;
        const daysLeft = Math.max(
          0,
          Math.ceil(
            (new Date(trial.endsAt).getTime() - Date.now()) / 86_400_000
          )
        );
        // Active trial, or a lapsed one with no paid sub to fall back on.
        const ended = !trial.active && !d.subscription;
        if (trial.active || ended) {
          setState({ daysLeft, active: !!trial.active });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state) return null;

  return (
    <Link
      href="/pricing"
      className={`ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        state.active
          ? "bg-accent/10 text-accent hover:bg-accent/20"
          : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
      }`}
    >
      {state.active ? (
        <>
          <Clock className="w-3.5 h-3.5" />
          {state.daysLeft}d left
        </>
      ) : (
        <>
          <Sparkles className="w-3.5 h-3.5" />
          Upgrade
        </>
      )}
    </Link>
  );
}
