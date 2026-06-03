import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

/**
 * One-time AI-credit packs. `displayCents` is what the user pays AND the credit
 * value they see; internally we add half that (display / AI_MARKUP) to their
 * cost-cap headroom. Built with ad-hoc `price_data` at checkout, so no Stripe
 * product/price setup is required.
 */
export const CREDIT_PACKS = [
  { id: "credit_25", displayCents: 2500, label: "$25" },
  { id: "credit_50", displayCents: 5000, label: "$50" },
  { id: "credit_100", displayCents: 10000, label: "$100" },
] as const;

export type CreditPackId = (typeof CREDIT_PACKS)[number]["id"];

export function getCreditPack(id: string) {
  return CREDIT_PACKS.find((p) => p.id === id);
}

export function generateLicenseKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segment = (len: number) =>
    Array.from({ length: len }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  return `FF${segment(3)}-${segment(5)}-${segment(5)}-${segment(5)}`;
}
