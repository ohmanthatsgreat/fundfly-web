"use client";

import { useState } from "react";
import { Sparkles, X, Loader2, Zap, Brain, Globe } from "lucide-react";

type Plan = "matching" | "submissions";

const PLAN_DETAILS: Record<
  Plan,
  { name: string; features: string[]; icon: React.ComponentType<{ className?: string }> }
> = {
  matching: {
    name: "AI Matching",
    icon: Brain,
    features: [
      "AI-powered opportunity scoring",
      "Business & personal profile matching",
      "Match reasoning & summaries",
    ],
  },
  submissions: {
    name: "AI Submissions",
    icon: Globe,
    features: [
      "Everything in AI Matching",
      "AI application generation (8 sections)",
      "Submission plan research",
      "Automated portal submission agent",
    ],
  },
};

export default function UpgradeModal({
  feature,
  onClose,
}: {
  feature: "matching" | "submissions";
  onClose: () => void;
}) {
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);

  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade(plan: Plan) {
    setLoadingPlan(plan);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "Failed to start checkout");
    } catch {
      setError("Network error. Please try again.");
    }
    setLoadingPlan(null);
  }

  const recommended = feature === "submissions" ? "submissions" : "matching";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
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
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold">Unlock AI Features</h2>
          </div>
          <p className="text-sm text-white/80">
            Upgrade your plan to access AI-powered grant matching, application
            generation, and automated submissions.
          </p>
        </div>

        {/* Plans */}
        <div className="p-6 space-y-3">
          {(["matching", "submissions"] as const).map((plan) => {
            const details = PLAN_DETAILS[plan];
            const Icon = details.icon;
            const isRecommended = plan === recommended;
            const isLoading = loadingPlan === plan;

            return (
              <div
                key={plan}
                className={`relative rounded-xl border-2 p-4 transition-all ${
                  isRecommended
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-accent/40"
                }`}
              >
                {isRecommended && (
                  <span className="absolute -top-2.5 left-4 bg-accent text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                )}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4 text-accent" />
                      <h3 className="font-semibold text-sm">{details.name}</h3>
                    </div>
                    <ul className="space-y-1">
                      {details.features.map((f, i) => (
                        <li
                          key={i}
                          className="text-xs text-muted flex items-start gap-1.5"
                        >
                          <Zap className="w-3 h-3 text-accent shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    onClick={() => handleUpgrade(plan)}
                    disabled={loadingPlan !== null}
                    className={`shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                      isRecommended
                        ? "bg-accent text-white hover:bg-accent/90"
                        : "bg-surface border border-border text-foreground hover:bg-card"
                    }`}
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    Upgrade
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Error / Footer */}
        <div className="px-6 pb-5 text-center">
          {error && (
            <p className="text-xs text-danger mb-2">{error}</p>
          )}
          <p className="text-[11px] text-muted">
            Cancel anytime. Manage billing from Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
