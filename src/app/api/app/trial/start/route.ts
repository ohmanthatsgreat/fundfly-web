import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, trials, customers, subscriptions } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";
import type { Plan } from "@/lib/auth";

/** Paid tiers eligible for a no-card trial. */
const VALID_PLANS: Plan[] = ["matching", "checklist", "auto_submission", "bundle"];

/** Trial length in days. */
const TRIAL_DAYS = 3;

/**
 * Start a 3-day, no-card-up-front trial of a paid tier.
 * One trial per user, ever. Refuses if the user already has an active/trialing
 * Stripe subscription or has already used their trial.
 */
export async function POST(request: NextRequest) {
  const userId = await requireAuth();
  const { plan } = await request.json();

  if (!VALID_PLANS.includes(plan)) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  // One trial per user, ever.
  const [existing] = await db
    .select()
    .from(trials)
    .where(eq(trials.userId, userId))
    .limit(1);
  if (existing) {
    return Response.json(
      { error: "trial_already_used", message: "You've already used your free trial." },
      { status: 409 }
    );
  }

  // No trial if they already have a paying/trialing Stripe subscription.
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.clerkUserId, userId))
    .limit(1);
  if (customer) {
    const activeSubs = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.customerId, customer.id),
          inArray(subscriptions.status, ["active", "trialing"])
        )
      )
      .limit(1);
    if (activeSubs.length > 0) {
      return Response.json(
        { error: "already_subscribed", message: "You already have an active plan." },
        { status: 409 }
      );
    }
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  // The free trial unlocks ALL AI features regardless of which gate triggered
  // it — store the top tier so PLAN_FEATURES grants matching + checklist +
  // auto_submission. Abuse is bounded by the low trial cost cap (see auth.ts).
  const trialPlan: Plan = "auto_submission";

  const [trial] = await db
    .insert(trials)
    .values({ userId, plan: trialPlan, startedAt: now, endsAt })
    .returning();

  return Response.json({ success: true, trial });
}
