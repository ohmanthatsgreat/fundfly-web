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
  Sparkles,
  ArrowRight,
  Zap,
} from "lucide-react";
import { useState, useMemo } from "react";

type FeatureId = "matching" | "checklist" | "auto_submission";

interface FeatureOption {
  id: FeatureId;
  name: string;
  price: number;
  icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  description: string;
  features: string[];
}

const FEATURES: FeatureOption[] = [
  {
    id: "matching",
    name: "AI Matching",
    price: 29,
    icon: Brain,
    tagline: "Find your best opportunities",
    description:
      "AI scores every grant and funding opportunity against your org and personal profiles so you focus on what fits.",
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
    price: 99,
    icon: ClipboardCheck,
    tagline: "Prepare winning applications",
    description:
      "AI researches each opportunity and builds a step-by-step submission plan with all required documents, eligibility checks, and application drafts.",
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
    features: [
      "Automated portal navigation",
      "Intelligent form filling",
      "Human-in-the-loop review",
      "Multi-portal support",
      "$150/mo in AI credits included",
      "Purchase additional credits as needed",
    ],
  },
];

const FREE_FEATURES = [
  "Browse 30,000+ opportunities",
  "Search, filter & sort",
  "Save opportunities",
  "Application tracker",
  "Org & personal profiles",
  "Works in browser & desktop",
];

const BUNDLE_PRICE = 469;

export default function PricingPage() {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<FeatureId>>(new Set());
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alaCarteTotal = useMemo(() => {
    return FEATURES.filter((f) => selected.has(f.id)).reduce(
      (sum, f) => sum + f.price,
      0
    );
  }, [selected]);

  const allSelected = selected.size === 3;
  const useBundle = allSelected;
  const effectivePrice = useBundle ? BUNDLE_PRICE : alaCarteTotal;
  const savings = allSelected ? alaCarteTotal - BUNDLE_PRICE : 0;

  function toggleFeature(id: FeatureId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(FEATURES.map((f) => f.id)));
  }

  async function handleSubscribe() {
    if (selected.size === 0) return;

    if (!isSignedIn) {
      router.push(`/sign-up?redirect_url=/pricing`);
      return;
    }

    // Determine which plan to checkout
    let checkoutPlan: string;
    if (useBundle) {
      checkoutPlan = "bundle";
    } else if (selected.size === 1) {
      checkoutPlan = Array.from(selected)[0];
    } else {
      // Multiple but not all — use the highest tier as the plan
      if (selected.has("auto_submission")) checkoutPlan = "auto_submission";
      else if (selected.has("checklist")) checkoutPlan = "checklist";
      else checkoutPlan = "matching";
    }

    setLoading(checkoutPlan);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: checkoutPlan }),
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
              Pick the AI features you need
            </h1>
            <p className="text-muted text-lg max-w-2xl mx-auto">
              Start free. Add AI features à la carte, or bundle everything and
              save.
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

          {/* AI Features — à la carte */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">AI Features</h2>
              <button
                onClick={selectAll}
                className="text-sm text-accent hover:underline flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Select all & save ${savings > 0 ? savings : 58}/mo
              </button>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {FEATURES.map((feature) => {
                const isSelected = selected.has(feature.id);
                const Icon = feature.icon;

                return (
                  <button
                    key={feature.id}
                    onClick={() => toggleFeature(feature.id)}
                    className={`relative text-left bg-card rounded-2xl p-6 transition-all ${
                      isSelected
                        ? "border-2 border-accent shadow-lg shadow-accent/10"
                        : "border-2 border-border hover:border-accent/40"
                    }`}
                  >
                    {/* Selection indicator */}
                    <div
                      className={`absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? "border-accent bg-accent"
                          : "border-border"
                      }`}
                    >
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-white" />
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 mb-3">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          isSelected ? "bg-accent/10" : "bg-surface"
                        }`}
                      >
                        <Icon
                          className={`w-4.5 h-4.5 ${
                            isSelected ? "text-accent" : "text-muted"
                          }`}
                        />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">
                          {feature.name}
                        </h3>
                        <p className="text-xs text-muted">{feature.tagline}</p>
                      </div>
                    </div>

                    <div className="mb-4">
                      <span className="text-3xl font-bold">
                        ${feature.price}
                      </span>
                      <span className="text-muted text-sm">/mo</span>
                    </div>

                    <p className="text-xs text-muted mb-4 leading-relaxed">
                      {feature.description}
                    </p>

                    <ul className="space-y-2">
                      {feature.features.map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-2 text-xs"
                        >
                          <Zap
                            className={`w-3 h-3 shrink-0 mt-0.5 ${
                              isSelected ? "text-accent" : "text-muted"
                            }`}
                          />
                          <span className="text-muted">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Checkout bar */}
          {selected.size > 0 && (
            <div className="sticky bottom-6 z-10">
              <div className="bg-card border-2 border-accent rounded-2xl p-6 shadow-2xl shadow-accent/10">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold">
                          ${effectivePrice}
                        </span>
                        <span className="text-muted text-sm">/mo</span>
                        {savings > 0 && (
                          <span className="text-xs font-medium text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                            Save ${savings}/mo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-0.5">
                        {useBundle
                          ? "All Features Bundle"
                          : `${selected.size} feature${selected.size > 1 ? "s" : ""} selected`}
                        {allSelected && (
                          <span className="ml-1">
                            — was{" "}
                            <span className="line-through">
                              ${alaCarteTotal}
                            </span>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleSubscribe}
                    disabled={loading !== null}
                    className="inline-flex items-center gap-2 bg-accent text-white px-8 py-3 rounded-xl text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
                  >
                    {loading ? (
                      "Loading..."
                    ) : (
                      <>
                        Subscribe
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Get started free CTA when nothing selected */}
          {selected.size === 0 && (
            <div className="text-center mt-8">
              <button
                onClick={() =>
                  router.push(isSignedIn ? "/app" : "/sign-up")
                }
                className="inline-flex items-center gap-2 bg-accent text-white px-8 py-3 rounded-xl text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

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
