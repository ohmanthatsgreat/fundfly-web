import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Choose the right FundFly plan — browse grants for free, unlock AI matching, or get full AI-powered application generation and automated submissions.",
  alternates: {
    canonical: "/pricing",
  },
  openGraph: {
    title: "Pricing | FundFly",
    description:
      "Choose the right FundFly plan — browse grants for free, unlock AI matching, or get full AI-powered application generation and automated submissions.",
    url: "https://fundfly.app/pricing",
  },
};

// Product + Offer schema so the real price tiers can surface directly in
// Google rich results and in AI answers about FundFly's cost. Mirrors the
// public pricing page; paid tiers carry a monthly UnitPriceSpecification.
const offer = (
  name: string,
  price: string,
  description: string,
  recurring: boolean
) => ({
  "@type": "Offer",
  name,
  price,
  priceCurrency: "USD",
  url: "https://fundfly.app/pricing",
  availability: "https://schema.org/InStock",
  description,
  ...(recurring
    ? {
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price,
          priceCurrency: "USD",
          unitText: "MONTH",
        },
      }
    : {}),
});

const pricingJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "FundFly",
  description:
    "AI-powered grant discovery and application platform. Find and apply to grants, SBIR funding, and foundation programs.",
  brand: { "@type": "Brand", name: "FundFly" },
  offers: [
    offer(
      "Free",
      "0",
      "Browse 1M+ opportunities, search and filter, save, and track applications.",
      false
    ),
    offer(
      "AI Matching",
      "29",
      "AI scores every opportunity against your organization and personal profiles, with reasoning.",
      true
    ),
    offer(
      "Pre-Submission Checklist",
      "129",
      "Step-by-step submission plans, eligibility checks, and AI application drafting. Includes everything in AI Matching.",
      true
    ),
    offer(
      "Auto-Submission",
      "399",
      "An AI agent navigates portals, fills forms, and submits on your behalf with human review. Includes everything in Checklist.",
      true
    ),
  ],
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }}
      />
      {children}
    </>
  );
}
