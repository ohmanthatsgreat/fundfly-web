"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  CreditCard,
  ExternalLink,
  RotateCcw,
  Zap,
  AlertTriangle,
} from "lucide-react";

type AiUsage = {
  costCents: number;
  capCents: number;
  creditsCents: number;
  requestCount: number;
  percentUsed: number;
  atWarning: boolean;
  atLimit: boolean;
  // User-facing credit values (display dollars = what they paid)
  displayTotalCents: number | null;
  displayUsedCents: number | null;
  displayRemainingCents: number | null;
  periodStart: string;
  periodEnd: string | null;
};

function fmtUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

// Subscription status -> badge styling. "trialing" is a healthy state (the
// 3-day no-card trial), so it must read positive rather than render red like
// a billing failure.
const STATUS_BADGE_CLASS: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",
  trialing: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  past_due:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  unpaid: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  canceled: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trial",
  past_due: "Past Due",
};

export default function SettingsPage() {
  const [subscription, setSubscription] = useState<{
    plan: string;
    status: string;
    currentPeriodEnd: string;
  } | null>(null);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [subRes, usageRes] = await Promise.all([
          fetch("/api/app/subscription"),
          fetch("/api/app/ai-usage"),
        ]);
        const subData = await subRes.json();
        if (subData.subscription) setSubscription(subData.subscription);
        const usageData = await usageRes.json();
        if (usageData.capCents) setUsage(usageData);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  async function openBillingPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {}
    setPortalLoading(false);
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Settings</h1>
      <p className="text-sm text-muted mb-8">
        Manage your subscription and account settings.
      </p>

      {/* Subscription */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <CreditCard className="w-5 h-5 text-accent" />
          <h2 className="font-semibold">Subscription</h2>
        </div>

        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted" />
        ) : subscription ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted">Plan:</span>
              <span className="text-sm font-medium">
                {subscription.plan === "auto_submission"
                  ? "Auto-Submission"
                  : subscription.plan === "bundle"
                    ? "Auto-Submission"
                    : subscription.plan === "checklist"
                      ? "Pre-Submission Checklist"
                      : subscription.plan === "matching"
                        ? "AI Matching"
                        : subscription.plan}
              </span>
              <span
                className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded-md ${
                  STATUS_BADGE_CLASS[subscription.status] ||
                  "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-400"
                }`}
              >
                {STATUS_LABEL[subscription.status] || subscription.status}
              </span>
            </div>
            {(() => {
              const renewsAt = new Date(subscription.currentPeriodEnd);
              if (isNaN(renewsAt.getTime())) return null;
              return (
                <div className="text-sm text-muted">
                  Renews: {renewsAt.toLocaleDateString()}
                </div>
              );
            })()}
            <button
              onClick={openBillingPortal}
              disabled={portalLoading}
              className="inline-flex items-center gap-2 text-sm text-accent hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {portalLoading ? "Opening..." : "Manage Billing"}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-muted mb-3">
              No active subscription. Upgrade to unlock AI features.
            </p>
            <a
              href="/pricing"
              className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              View Plans
            </a>
          </div>
        )}
      </div>

      {/* AI Usage */}
      {usage && (
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-5 h-5 text-accent" />
            <h2 className="font-semibold">AI Credit This Period</h2>
          </div>

          {/* Progress bar — shown in display-dollar credit (what you paid) */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted">
                {fmtUsd(usage.displayUsedCents ?? usage.costCents)} of{" "}
                {fmtUsd(usage.displayTotalCents ?? usage.capCents)} credit used
              </span>
              <span
                className={`font-medium ${
                  usage.atLimit
                    ? "text-red-600 dark:text-red-400"
                    : usage.atWarning
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-foreground/70"
                }`}
              >
                {usage.percentUsed}%
              </span>
            </div>
            <div className="h-2 bg-surface rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  usage.atLimit
                    ? "bg-red-500"
                    : usage.atWarning
                      ? "bg-amber-500"
                      : "bg-accent"
                }`}
                style={{ width: `${usage.percentUsed}%` }}
              />
            </div>
          </div>

          {/* Stats grid — display-dollar credit values */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-4">
            <div>
              <div className="text-xs text-muted uppercase tracking-wider mb-1">
                Credit Remaining
              </div>
              <div className="font-medium">
                {fmtUsd(usage.displayRemainingCents ?? 0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted uppercase tracking-wider mb-1">
                Monthly Credit
              </div>
              <div className="font-medium">
                {fmtUsd(usage.displayTotalCents ?? usage.capCents)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted uppercase tracking-wider mb-1">
                Used
              </div>
              <div className="font-medium">
                {fmtUsd(usage.displayUsedCents ?? usage.costCents)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted uppercase tracking-wider mb-1">
                AI Actions
              </div>
              <div className="font-medium">{usage.requestCount}</div>
            </div>
            {usage.periodEnd && (
              <div className="col-span-2">
                <div className="text-xs text-muted uppercase tracking-wider mb-1">
                  Resets
                </div>
                <div className="font-medium">
                  {new Date(usage.periodEnd).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Warning / at-limit banner */}
          {usage.atLimit && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3 text-sm">
              <AlertTriangle
                size={16}
                className="text-red-600 dark:text-red-400 shrink-0 mt-0.5"
              />
              <div>
                <p className="font-medium text-red-900 dark:text-red-200">
                  Monthly AI credit used up
                </p>
                <p className="text-red-900/80 dark:text-red-200/80 text-xs mt-0.5">
                  You&apos;ve used all your AI credit for this period. AI
                  features are paused — buy more credit to keep going
                  {usage.periodEnd
                    ? `, or wait until it renews on ${new Date(
                        usage.periodEnd
                      ).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                      })}`
                    : " until it renews"}
                  .
                </p>
              </div>
            </div>
          )}
          {usage.atWarning && !usage.atLimit && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-3 text-sm">
              <AlertTriangle
                size={16}
                className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
              />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  Approaching monthly cap
                </p>
                <p className="text-amber-900/80 dark:text-amber-200/80 text-xs mt-0.5">
                  You&apos;ve used over 80% of your monthly AI budget. Consider
                  purchasing additional credits before you hit the cap.
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-muted mt-4">
            Your cap covers all AI features — matching, application drafting,
            and auto-submission. Cost is computed from actual Anthropic API
            usage at our published model rates. Credit
            purchase coming soon — email{" "}
            <a
              href="mailto:support@fundfly.app"
              className="text-accent hover:underline"
            >
              support@fundfly.app
            </a>{" "}
            if you need additional credits now.
          </p>
        </div>
      )}

      {/* Guided Tour */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <RotateCcw className="w-5 h-5 text-accent" />
          <h2 className="font-semibold">Guided Tour</h2>
        </div>
        <p className="text-sm text-muted mb-3">
          Restart the onboarding tour to learn about all FundFly features.
        </p>
        <button
          onClick={() => {
            localStorage.removeItem("fundfly_tour_completed");
            window.dispatchEvent(new Event("fundfly:start-tour"));
          }}
          className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restart Tour
        </button>
      </div>

      {/* Support */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <ExternalLink className="w-5 h-5 text-accent" />
          <h2 className="font-semibold">Support</h2>
        </div>
        <p className="text-sm text-muted">
          Need help? Reach out to us at{" "}
          <a href="mailto:support@fundfly.app" className="text-accent hover:underline">
            support@fundfly.app
          </a>
        </p>
      </div>
    </div>
  );
}
