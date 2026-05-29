import { db, customers, subscriptions, trials } from "@/lib/db";
import { requireAuth, getUserFeatures } from "@/lib/auth";
import { eq, and, inArray } from "drizzle-orm";

export async function GET() {
  const userId = await requireAuth();

  // Honor stripe_bypass — admin-granted free access for this user
  const { plan: bypassPlan } = await getUserFeatures(userId);
  if (bypassPlan === "admin_bypass") {
    return Response.json({
      subscription: { plan: "auto_submission", status: "active", isAdminBypass: true },
      trial: null,
    });
  }

  // Look up any no-card trial. `trialActive` tells the UI whether it still
  // grants access; `trialUsed` whether the one-per-user trial is spent.
  const [trial] = await db
    .select()
    .from(trials)
    .where(eq(trials.userId, userId))
    .limit(1);
  const trialActive = !!trial && trial.endsAt > new Date();
  const trialInfo = trial
    ? {
        plan: trial.plan,
        endsAt: trial.endsAt,
        active: trialActive,
      }
    : null;

  const customer = await db
    .select()
    .from(customers)
    .where(eq(customers.clerkUserId, userId))
    .limit(1);

  if (customer.length === 0) {
    // No Stripe customer, but the user may be on a no-card trial.
    return Response.json({
      subscription: trialActive
        ? { plan: trial!.plan, status: "trialing", isTrial: true, endsAt: trial!.endsAt }
        : null,
      trial: trialInfo,
      trialUsed: !!trial,
    });
  }

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.customerId, customer[0].id),
        inArray(subscriptions.status, ["active", "trialing"])
      )
    )
    .limit(1);

  // Prefer a real Stripe subscription; otherwise fall back to an active trial.
  const subscription =
    sub ||
    (trialActive
      ? { plan: trial!.plan, status: "trialing", isTrial: true, endsAt: trial!.endsAt }
      : null);

  return Response.json({
    subscription,
    trial: trialInfo,
    trialUsed: !!trial,
  });
}
