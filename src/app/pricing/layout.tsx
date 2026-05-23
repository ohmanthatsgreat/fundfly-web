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

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
