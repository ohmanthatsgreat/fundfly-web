"use client";

import { useState, useEffect } from "react";
import { Sparkles, X, Loader2, Brain, ClipboardCheck, Bot, Check, Gift } from "lucide-react";
import { trackAction } from "@/lib/track";

type Feature = "matching" | "checklist" | "auto_submission";

const PLANS: {
  key: Feature;
  name: string;
  price: number;
  icon: React.ComponentType<{ className?: string }>;
  includes: string;
  bullets: string[];
}[] = [
  {
    key: "matching",
    name: "AI Matching",
    price: 29,
    includes: "",
    icon: Brain,
    bullets: [
      "AI scores every grant against your profile",
      "Personalized match reasoning",
      "Business & personal matching",
    ],
  },
  {
    key: "checklist",
    name: "Pre-Submission Checklist",
    price: 129,
    includes: "Includes AI Matching",
    icon: ClipboardCheck,
    bullets: [
      "Step-by-step submission plans",
      "Eligibility verification",
      "AI-drafted application sections",
    ],
  },
  {
    key: "auto_submission",
    name: "Auto-Submission",
    price: 399,
    includes: "Includes Matching + Checklist",
    icon: Bot,
    bullets: [
      "AI agent fills & submits forms",
      "Portal navigation on autopilot",
      "Status tracking & notifications",
    ],
  },
];

/** Index of each plan in the tier hierarchy */
const TIER_ORDER: Record<Feature, number> = {
  matching: 0,
  checklist: 1,
  auto_submission: 2,
};

export default function UpgradeModal({
  feature,
  onClose,
}: {
  feature: Feature;
  onClose: () => void;
}) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Trial eligibility — one no-card trial per user, ever.
  const [trialUsed, setTrialUsed] = useState<boolean | null>(null);
  const [startingTrial, setStartingTrial] = useState(false);

  const triggeredPlan = PLANS.find((p) => p.key === feature)!;
  const TriggeredIcon = triggeredPlan.icon;

  useEffect(() => {
    // Paywall impression — high-signal intent (saw the upgrade prompt).
    trackAction("upgrade_modal_shown", { feature });
    fetch("/api/app/subscription")
      .then((r) => r.json())
      .then((d) => setTrialUsed(!!d.trialUsed))
      .catch(() => setTrialUsed(true)); // hide trial CTA if we can't confirm
  }, [feature]);

  async function handleStartTrial() {
    setStartingTrial(true);
    setError(null);
    trackAction("start_trial", { plan: feature });
    try {
      const res = await fetch("/api/app/trial/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: feature }),
      });
      const data: { success?: boolean; message?: string; error?: string } =
        await res.json().catch(() => ({}));
      if (data.success) {
        // Reload so the app picks up the new trial-granted access.
        window.location.reload();
        return;
      }
      setError(data.message || data.error || "Could not start trial");
    } catch {
      setError("Network error. Please try again.");
    }
    setStartingTrial(false);
  }

  // Only show plans at or above the triggered feature's tier
  const relevantPlans = PLANS.filter(
    (p) => TIER_ORDER[p.key] >= TIER_ORDER[feature]
  );

  async function handleUpgrade(plan: string) {
    setLoadingPlan(plan);
    setError(null);
    trackAction("upgrade_checkout_click", { plan });
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          referral: (window as any).Rewardful?.referral || undefined,
        }),
      });
      // Parse defensively: a 500 with a non-JSON body would otherwise throw here
      // and get reported as a "Network error," masking a real server failure.
      const data: { url?: string; error?: string } = await res
        .json()
        .catch(() => ({}));
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setError(data.error || "Failed to start checkout. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    }
    setLoadingPlan(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-accent via-blue-600 to-indigo-600 px-6 py-8 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <TriggeredIcon className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold">
              Unlock {triggeredPlan.name}
            </h2>
          </div>
          <p className="text-sm text-white/80">
            {triggeredPlan.includes
              ? `${triggeredPlan.includes} — choose the tier that fits.`
              : "Choose the plan that fits your needs."}
          </p>
        </div>

        {/* Free trial CTA — only if the user hasn't used their one trial */}
        {trialUsed === false && (
          <div className="px-5 pt-5">
            <button
              onClick={handleStartTrial}
              disabled={startingTrial || loadingPlan !== null}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {startingTrial ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Gift className="w-4 h-4" />
              )}
              Start your free 3-day trial
            </button>
            <p className="mt-1.5 text-center text-[11px] text-muted">
              No credit card required &middot; unlocks every AI feature
              (matching, checklist, generation &amp; auto-submission) for 3 days
            </p>
          </div>
        )}

        {/* Plans */}
        <div className="p-5 space-y-3">
          {trialUsed === false && (
            <p className="text-center text-[11px] font-medium uppercase tracking-wider text-muted">
              or subscribe now
            </p>
          )}
          {relevantPlans.map((plan) => {
            const Icon = plan.icon;
            const isTriggered = plan.key === feature;

            return (
              <button
                key={plan.key}
                onClick={() => handleUpgrade(plan.key)}
                disabled={loadingPlan !== null}
                className={`w-full text-left rounded-xl px-5 py-4 transition-colors disabled:opacity-50 ${
                  isTriggered
                    ? "bg-accent text-white ring-2 ring-accent ring-offset-2 ring-offset-card"
                    : "border border-border hover:border-accent/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isTriggered ? "text-white/80" : "text-accent"
                        }`}
                      />
                      <span className="font-semibold text-sm">
                        {plan.name}
                      </span>
                      {isTriggered && (
                        <span className="text-[9px] font-semibold uppercase bg-white/20 px-1.5 py-0.5 rounded-full">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span
                        className={`text-xs ${
                          isTriggered ? "text-white/70" : "text-muted"
                        }`}
                      >
                        ${plan.price}/mo
                      </span>
                      {plan.includes && (
                        <span
                          className={`text-[10px] ${
                            isTriggered ? "text-white/50" : "text-muted/70"
                          }`}
                        >
                          · {plan.includes}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1">
                      {plan.bullets.map((b) => (
                        <li
                          key={b}
                          className={`flex items-start gap-1.5 text-[11px] ${
                            isTriggered ? "text-white/80" : "text-muted"
                          }`}
                        >
                          <Check
                            className={`w-3 h-3 shrink-0 mt-0.5 ${
                              isTriggered ? "text-white/60" : "text-accent/60"
                            }`}
                          />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="shrink-0 mt-1">
                    {loadingPlan === plan.key ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles
                        className={`w-4 h-4 ${
                          isTriggered ? "text-white/60" : "text-muted"
                        }`}
                      />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 text-center">
          {error && <p className="text-xs text-danger mb-2">{error}</p>}
          <p className="text-[11px] text-muted">
            Cancel anytime &middot;{" "}
            <a href="/pricing" className="text-accent hover:underline">
              Compare all plans
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
