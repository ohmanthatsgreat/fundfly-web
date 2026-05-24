"use client";

import { useState, useEffect } from "react";
import { Loader2, CreditCard, ExternalLink, RotateCcw } from "lucide-react";

export default function SettingsPage() {
  const [subscription, setSubscription] = useState<{
    plan: string;
    status: string;
    currentPeriodEnd: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/app/subscription");
        const data = await res.json();
        if (data.subscription) setSubscription(data.subscription);
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
                  subscription.status === "active"
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {subscription.status}
              </span>
            </div>
            <div className="text-sm text-muted">
              Renews: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
            </div>
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
