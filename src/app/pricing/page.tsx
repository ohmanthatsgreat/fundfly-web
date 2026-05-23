"use client";

import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Browse and discover grants",
    highlight: false,
    features: [
      "Browse 30,000+ opportunities",
      "Search, filter & sort",
      "Save opportunities",
      "Application tracker",
      "Org & personal profiles",
      "Works in browser & desktop",
    ],
    cta: "Get Started Free",
    plan: null,
  },
  {
    name: "AI Matching",
    price: "$29",
    period: "/month",
    description: "AI scores every opportunity for you",
    highlight: false,
    features: [
      "Everything in Free",
      "AI-powered opportunity matching",
      "Org + personal profile scoring",
      "Match reasoning & explanations",
      "Unlimited rescans",
    ],
    cta: "Subscribe",
    plan: "matching",
  },
  {
    name: "AI Submissions",
    price: "$99",
    period: "/month",
    description: "Full AI-powered grant writing",
    highlight: true,
    badge: "Most Popular",
    features: [
      "Everything in AI Matching",
      "AI application drafting",
      "Automated form filling",
      "Step-by-step submission plans",
      "Document generation",
      "Human-in-the-loop oversight",
    ],
    cta: "Subscribe",
    plan: "submissions",
  },
];

export default function PricingPage() {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe(plan: string | null) {
    if (!plan) {
      router.push(isSignedIn ? "/app" : "/sign-up");
      return;
    }

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
    setLoading(null);
  }

  return (
    <>
      <MarketingHeader />

      <section className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Simple, transparent pricing
            </h1>
            <p className="text-muted text-lg max-w-xl mx-auto">
              Start free. Upgrade when AI matching and submissions save you
              hours of work.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative bg-card rounded-2xl p-8 flex flex-col ${
                  tier.highlight
                    ? "border-2 border-accent shadow-xl shadow-accent/10"
                    : "border border-border"
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-accent text-white text-xs font-medium px-3 py-1 rounded-full">
                    {(tier as { badge?: string }).badge}
                  </div>
                )}

                <h3 className="text-xl font-semibold mb-1">{tier.name}</h3>
                <p className="text-sm text-muted mb-4">{tier.description}</p>

                <div className="mb-6">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  <span className="text-muted text-sm">{tier.period}</span>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(tier.plan)}
                  disabled={loading === tier.plan}
                  className={`w-full py-3 rounded-xl text-sm font-medium transition-colors ${
                    tier.highlight
                      ? "bg-accent text-white hover:bg-accent/90"
                      : "border border-border hover:bg-surface"
                  } disabled:opacity-50`}
                >
                  {loading === tier.plan ? "Loading..." : tier.cta}
                </button>

                {tier.plan && (
                  <p className="text-xs text-muted text-center mt-3">
                    Cancel anytime
                  </p>
                )}
              </div>
            ))}
          </div>

          {error && (
            <div className="mt-6 text-center">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </>
  );
}
