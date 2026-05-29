import { requireAuth, getEffectiveAiCapCents } from "@/lib/auth";
import { db, aiUsage, aiCredits, customers, subscriptions } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Returns the user's current AI usage for this billing period.
 *
 * The cap is tier-aware (see getEffectiveAiCapCents): $15 for the Matching
 * tier, $100 for Auto-Submission/Bundle, and uncapped (null) for Checklist or
 * admin-bypass users.
 *
 * Shape: {
 *   costCents:    spent so far this period
 *   capCents:     tier cap in cents, or null when uncapped
 *   uncapped:     true when there is no enforced cap
 *   creditsCents: purchased credits available beyond the cap
 *   requestCount: total AI calls this period
 *   percentUsed:  0-100 (capped at 100, doesn't account for credits)
 *   periodStart, periodEnd: billing period boundaries
 *   atWarning:    true at >= 80% of cap
 *   atLimit:      true at cap AND no credits
 * }
 */
export async function GET() {
  const userId = await requireAuth();

  const capCents = await getEffectiveAiCapCents(userId);
  const uncapped = capCents === null;

  // Determine billing period start. Tied to auto_submission sub if any,
  // else first of current month.
  let periodStart: Date;
  let periodEnd: Date | null = null;

  const customer = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.clerkUserId, userId))
    .limit(1);

  if (customer.length > 0) {
    const subs = await db
      .select({ currentPeriodEnd: subscriptions.currentPeriodEnd })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.customerId, customer[0].id),
          inArray(subscriptions.status, ["active", "trialing"])
        )
      )
      .limit(1);

    if (subs.length > 0 && subs[0].currentPeriodEnd) {
      periodEnd = subs[0].currentPeriodEnd;
      periodStart = new Date(periodEnd);
      periodStart.setMonth(periodStart.getMonth() - 1);
    } else {
      const now = new Date();
      periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    }
  } else {
    const now = new Date();
    periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  const [usage] = await db
    .select()
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.periodStart, periodStart)))
    .limit(1);

  const [credits] = await db
    .select()
    .from(aiCredits)
    .where(eq(aiCredits.userId, userId))
    .limit(1);

  const costCents = usage?.totalCostCents ?? 0;
  const creditsCents = credits?.balanceCents ?? 0;
  const requestCount = usage?.requestCount ?? 0;

  // Uncapped tiers (checklist / admin bypass) have no meter math.
  const percentUsed = uncapped
    ? 0
    : Math.min(100, Math.round((costCents / capCents!) * 100));
  const atWarning = uncapped ? false : costCents >= capCents! * 0.8;
  const atLimit = uncapped
    ? false
    : costCents >= capCents! && creditsCents <= 0;

  return Response.json({
    costCents,
    capCents,
    uncapped,
    creditsCents,
    requestCount,
    percentUsed,
    atWarning,
    atLimit,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd ? periodEnd.toISOString() : null,
  });
}
