"use client";

import { useState } from "react";
import { Sparkles, X, Loader2, Brain, ClipboardCheck, Bot } from "lucide-react";

type Feature = "matching" | "checklist" | "auto_submission";

const FEATURE_DETAILS: Record<
  Feature,
  {
    name: string;
    price: number;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  matching: {
    name: "AI Matching",
    price: 29,
    description: "AI-powered opportunity scoring against your profiles",
    icon: Brain,
  },
  checklist: {
    name: "Pre-Submission Checklist",
    price: 99,
    description:
      "Step-by-step submission plans, eligibility checks, and AI application drafting",
    icon: ClipboardCheck,
  },
  auto_submission: {
    name: "Auto-Submission",
    price: 399,
    description:
      "AI agent that navigates portals, fills forms, and submits applications",
    icon: Bot,
  },
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

  const details = FEATURE_DETAILS[feature];
  const Icon = details.icon;

  async function handleUpgrade(plan: string) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
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
              <Icon className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold">Unlock {details.name}</h2>
          </div>
          <p className="text-sm text-white/80">{details.description}</p>
        </div>

        {/* Single feature upgrade */}
        <div className="p-6 space-y-3">
          <button
            onClick={() => handleUpgrade(feature)}
            disabled={loadingPlan !== null}
            className="w-full flex items-center justify-between bg-accent text-white rounded-xl px-5 py-4 hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            <div className="text-left">
              <p className="font-semibold text-sm">{details.name}</p>
              <p className="text-xs text-white/70">
                ${details.price}/mo
              </p>
            </div>
            {loadingPlan === feature ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </button>

          {/* Bundle option */}
          <button
            onClick={() => handleUpgrade("bundle")}
            disabled={loadingPlan !== null}
            className="w-full flex items-center justify-between border-2 border-border rounded-xl px-5 py-4 hover:border-accent/40 transition-colors disabled:opacity-50"
          >
            <div className="text-left">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">All Features Bundle</p>
                <span className="text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded-full">
                  Save $58/mo
                </span>
              </div>
              <p className="text-xs text-muted">
                $469/mo — Matching + Checklist + Auto-Submission
              </p>
            </div>
            {loadingPlan === "bundle" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-muted" />
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 text-center">
          {error && <p className="text-xs text-danger mb-2">{error}</p>}
          <p className="text-[11px] text-muted">
            Cancel anytime &middot;{" "}
            <a href="/pricing" className="text-accent hover:underline">
              Compare all features
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
