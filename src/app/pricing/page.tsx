"use client";

import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Brain,
  ClipboardCheck,
  Bot,
  ArrowRight,
  Zap,
} from "lucide-react";
import { useState } from "react";

type PlanId = "matching" | "checklist" | "auto_submission";

interface PlanOption {
  id: PlanId;
  name: string;
  price: number;
  icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  description: string;
  includes: string;
  features: string[];
  popular?: boolean;
}

const PLANS: PlanOption[] = [
  {
    id: "matching",
    name: "AI Matching",
    price: 29,
    icon: Brain,
    tagline: "Find your best opportunities",
    description:
      "AI scores every grant and funding opportunity against your org and personal profiles so you focus on what fits.",
    includes: "",
    features: [
      "AI-powered opportunity scoring",
      "Org + personal profile matching",
      "Match reasoning & explanations",
      "Unlimited rescans",
    ],
  },
  {
    id: "checklist",
    name: "Pre-Submission Checklist",
    price: 129,
    icon: ClipboardCheck,
    tagline: "Prepare winning applications",
    description:
      "AI researches each opportunity and builds a step-by-step submission plan with all required documents, eligibility checks, and application drafts.",
    includes: "Everything in AI Matching, plus:",
    popular: true,
    features: [
      "Step-by-step submission plans",
      "Eligibility verification",
      "AI application drafting (8 sections)",
      "Document generation",
      "Deadline tracking",
    ],
  },
  {
    id: "auto_submission",
    name: "Auto-Submission",
    price: 399,
    icon: Bot,
    tagline: "Submit on autopilot",
    description:
      "Our AI agent navigates grant portals, fills out forms, and submits applications on your behalf — with human-in-the-loop oversight at every step.",
    includes: "Everything in Checklist, plus:",
    features: [
      "Automated portal navigation",
      "Intelligent form filling",
      "Human-in-the-loop review",
      "Multi-portal support",
      "$100/mo in AI credits included",
      "Purchase additional credits as needed",
    ],
  },
];

const FREE_FEATURES = [
  "Browse 1M+ opportunities",
  "Search, filter & sort",
  "Save opportunities",
  "Application tracker",
  "Org & personal profiles",
];

export default function PricingPage() {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(plan: string) {
    if (!isSignedIn) {
      router.push(`/sign-up?redirect_url=/pricing`);
      return;
    }

    setLoading(plan);
    setError(null);
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
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || "Failed to start checkout");
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(null);
  }

  return (
    <>
      <MarketingHeader />

      <section className="py-24">
        <div className="max-w-6xl mx-auto px-6">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Simple, tiered pricing
            </h1>
            <p className="text-muted text-lg max-w-2xl mx-auto">
              Start free. Each tier includes everything below it — upgrade as
              you grow.
            </p>
          </div>

          {/* Free tier */}
          <div className="bg-card border border-border rounded-2xl p-8 mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-semibold">Free</h3>
                  <span className="text-muted text-sm">$0 forever</span>
                </div>
                <p className="text-sm text-muted mb-4 md:mb-0">
                  Browse and discover grants — no credit card required.
                </p>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {FREE_FEATURES.map((f) => (
                  <span
                    key={f}
                    className="flex items-center gap-1.5 text-sm text-muted"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Paid tiers */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {PLANS.map((plan) => {
              const Icon = plan.icon;

              return (
                <div
                  key={plan.id}
                  className={`relative text-left bg-card rounded-2xl p-6 flex flex-col ${
                    plan.popular
                      ? "border-2 border-accent shadow-lg shadow-accent/10"
                      : "border-2 border-border"
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="bg-accent text-white text-[10px] font-semibold uppercase px-3 py-1 rounded-full">
                        Most Popular
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2.5 mb-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        plan.popular ? "bg-accent/10" : "bg-surface"
                      }`}
                    >
                      <Icon
                        className={`w-4.5 h-4.5 ${
                          plan.popular ? "text-accent" : "text-muted"
                        }`}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{plan.name}</h3>
                      <p className="text-xs text-muted">{plan.tagline}</p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <span className="text-3xl font-bold">${plan.price}</span>
                    <span className="text-muted text-sm">/mo</span>
                  </div>

                  <p className="text-xs text-muted mb-4 leading-relaxed">
                    {plan.description}
                  </p>

                  {plan.includes && (
                    <p className="text-[11px] font-medium text-accent mb-2">
                      {plan.includes}
                    </p>
                  )}

                  <ul className="space-y-2 mb-6 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs">
                        <Zap
                          className={`w-3 h-3 shrink-0 mt-0.5 ${
                            plan.popular ? "text-accent" : "text-muted"
                          }`}
                        />
                        <span className="text-muted">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={loading !== null}
                    className={`w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                      plan.popular
                        ? "bg-accent text-white hover:bg-accent/90"
                        : "border border-border hover:border-accent/40 text-foreground"
                    }`}
                  >
                    {loading === plan.id ? (
                      "Loading..."
                    ) : (
                      <>
                        Get {plan.name}
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Get started free CTA */}
          <div className="text-center mt-8">
            <button
              onClick={() => router.push(isSignedIn ? "/app" : "/sign-up")}
              className="text-sm text-accent hover:underline"
            >
              Or get started free →
            </button>
          </div>

          {error && (
            <div className="mt-6 text-center">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          {/* Cancel anytime */}
          <p className="text-center text-xs text-muted mt-8">
            Cancel anytime. All plans include a 14-day money-back guarantee.
          </p>
        </div>
      </section>

      <Footer />
    </>
  );
}
