import { auth } from "@clerk/nextjs/server";
import { db, customers, subscriptions, userSettings, aiUsage, aiCredits, trials } from "./db";
import { eq, and, inArray } from "drizzle-orm";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .filter(Boolean);

/** Features that can be individually subscribed to or bundled */
export type Feature = "matching" | "checklist" | "auto_submission";

/** Plans available in Stripe (tiered — each higher plan includes everything below) */
export type Plan = "matching" | "checklist" | "auto_submission" | "bundle";

/** Which features each plan unlocks (tiered stacking) */
const PLAN_FEATURES: Record<Plan, Feature[]> = {
  matching: ["matching"],
  checklist: ["matching", "checklist"],
  auto_submission: ["matching", "checklist", "auto_submission"],
  bundle: ["matching", "checklist", "auto_submission"], // legacy alias
};

/**
 * Auto-submission monthly AI cost cap in cents.
 * $100 = 10000 cents. Lowered from $150 on 2026-05-24 to leave headroom
 * for affiliate commissions on the lower $399 tier.
 */
const AUTO_SUB_CAP_CENTS = 10000;

/**
 * Matching-tier monthly AI cost cap in cents. $15 = 1500 cents.
 * Applies only to entry "matching" plan (and active no-card trials of it) so a
 * single power-user can't run the $29 tier into a loss by scanning the full
 * ~67k-opportunity pool. Higher tiers (checklist / auto_submission / bundle)
 * pay more and are not capped on matching.
 */
const MATCHING_CAP_CENTS = 1500;

export async function requireAuth() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

/**
 * Period start used for AI-cost accounting. Mirrors getPeriodStart() in
 * ai-cost.ts so the cap reads usage under the same key it was recorded:
 *   - with a Stripe period end → that end minus one month
 *   - otherwise (e.g. a no-card trial with no Stripe sub) → first of the
 *     current UTC month
 */
function computePeriodStart(currentPeriodEnd: Date | null): Date {
  if (currentPeriodEnd) {
    const ps = new Date(currentPeriodEnd);
    ps.setMonth(ps.getMonth() - 1);
    return ps;
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Collect the plans a user currently has access to, from BOTH Stripe
 * subscriptions (active/trialing) and an active no-card trial (endsAt > now).
 * `periodEnd` is the Stripe period end for subs, or null for trials.
 */
async function getActivePlanEntries(
  userId: string
): Promise<{ plan: string; periodEnd: Date | null; isTrial: boolean }[]> {
  const entries: { plan: string; periodEnd: Date | null; isTrial: boolean }[] = [];

  const customer = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.clerkUserId, userId))
    .limit(1);

  if (customer.length > 0) {
    const subs = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.customerId, customer[0].id),
          inArray(subscriptions.status, ["active", "trialing"])
        )
      );
    for (const s of subs)
      entries.push({ plan: s.plan, periodEnd: s.currentPeriodEnd, isTrial: false });
  }

  const [trial] = await db
    .select()
    .from(trials)
    .where(eq(trials.userId, userId))
    .limit(1);
  if (trial && trial.endsAt > new Date()) {
    entries.push({ plan: trial.plan, periodEnd: null, isTrial: true });
  }

  return entries;
}

/**
 * The effective monthly AI-cost cap (in cents) for a user, mirroring the
 * precedence in checkSubscription so the usage meter shows the right number:
 *   - admin bypass                          → null (uncapped)
 *   - auto_submission / bundle              → AUTO_SUB_CAP_CENTS ($100)
 *   - checklist (matching uncapped, no auto)→ null (uncapped)
 *   - matching only (incl. no-card trial)   → MATCHING_CAP_CENTS ($15)
 *   - no active plan                        → null
 * Returns null when there is no enforced cap.
 */
export async function getEffectiveAiCapCents(
  userId: string
): Promise<number | null> {
  const bypass = await db
    .select()
    .from(userSettings)
    .where(
      and(eq(userSettings.userId, userId), eq(userSettings.key, "stripe_bypass"))
    )
    .limit(1);
  if (bypass.length > 0 && bypass[0].value === "true") return null;

  const entries = await getActivePlanEntries(userId);
  if (entries.length === 0) return null;

  const plans = entries.map((e) => e.plan);
  if (plans.includes("auto_submission") || plans.includes("bundle")) {
    return AUTO_SUB_CAP_CENTS;
  }
  // checklist grants uncapped matching and no auto-submission cap.
  if (plans.includes("checklist")) return null;
  // matching-only entry tier (or an active no-card trial of it).
  return MATCHING_CAP_CENTS;
}

export async function getOrCreateCustomer(userId: string, email: string, name?: string) {
  const existing = await db
    .select()
    .from(customers)
    .where(eq(customers.clerkUserId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [customer] = await db
    .insert(customers)
    .values({ clerkUserId: userId, email, name })
    .returning();

  return customer;
}

/**
 * Check if user has access to a specific feature.
 * Returns allowed status, active plan, and usage info for auto_submission.
 */
export async function checkSubscription(
  userId: string,
  feature: Feature
): Promise<{
  allowed: boolean;
  plan?: string;
  usage?: { costCents: number; capCents: number; creditsCents: number; atLimit: boolean };
}> {
  // Stripe bypass — admin-granted access flag stored in user_settings.
  // The setting can only be written by /api/admin/stripe-bypass (admin-gated),
  // so it's safe to honor here for any user.
  const bypass = await db
    .select()
    .from(userSettings)
    .where(
      and(
        eq(userSettings.userId, userId),
        eq(userSettings.key, "stripe_bypass")
      )
    )
    .limit(1);

  if (bypass.length > 0 && bypass[0].value === "true") {
    return { allowed: true, plan: "admin_bypass" };
  }

  // Active plans from Stripe subs AND any active no-card trial.
  const planEntries = await getActivePlanEntries(userId);
  if (planEntries.length === 0) return { allowed: false };

  // Check if any active plan grants this feature
  const hasFeature = planEntries.some((p) =>
    PLAN_FEATURES[p.plan as Plan]?.includes(feature)
  );

  if (!hasFeature) {
    return { allowed: false, plan: planEntries[0].plan };
  }

  // Pick the highest-tier active plan for display/period purposes.
  const planRank: Record<string, number> = {
    matching: 1,
    checklist: 2,
    auto_submission: 3,
    bundle: 3,
  };
  const topEntry = planEntries.reduce((a, b) =>
    (planRank[b.plan] ?? 0) > (planRank[a.plan] ?? 0) ? b : a
  );
  const periodStart = computePeriodStart(topEntry.periodEnd);

  // For auto_submission, enforce its monthly AI-cost cap.
  if (feature === "auto_submission") {
    const usageInfo = await getUsageInfo(userId, periodStart, AUTO_SUB_CAP_CENTS);
    return {
      allowed: !usageInfo.atLimit,
      plan: topEntry.plan,
      usage: usageInfo,
    };
  }

  // For matching, enforce a cost cap ONLY on the entry tier (no higher plan
  // present). Higher tiers pay more and scan uncapped.
  if (feature === "matching") {
    const hasHigherThanMatching = planEntries.some((p) =>
      ["checklist", "auto_submission", "bundle"].includes(p.plan)
    );
    if (!hasHigherThanMatching) {
      const usageInfo = await getUsageInfo(userId, periodStart, MATCHING_CAP_CENTS);
      return {
        allowed: !usageInfo.atLimit,
        plan: topEntry.plan,
        usage: usageInfo,
      };
    }
  }

  return { allowed: true, plan: topEntry.plan };
}

/**
 * Get all features the user currently has access to.
 */
export async function getUserFeatures(userId: string): Promise<{
  features: Feature[];
  plan: string | null;
  isAdmin: boolean;
}> {
  // Stripe bypass — granted via admin panel. Setting is write-protected
  // by /api/admin/stripe-bypass so it's safe to honor here for any user.
  const bypass = await db
    .select()
    .from(userSettings)
    .where(
      and(
        eq(userSettings.userId, userId),
        eq(userSettings.key, "stripe_bypass")
      )
    )
    .limit(1);

  if (bypass.length > 0 && bypass[0].value === "true") {
    return {
      features: ["matching", "checklist", "auto_submission"],
      plan: "admin_bypass",
      isAdmin: ADMIN_USER_IDS.includes(userId),
    };
  }

  const planEntries = await getActivePlanEntries(userId);
  if (planEntries.length === 0)
    return { features: [], plan: null, isAdmin: ADMIN_USER_IDS.includes(userId) };

  const allFeatures = new Set<Feature>();
  const planRank: Record<string, number> = {
    matching: 1,
    checklist: 2,
    auto_submission: 3,
    bundle: 3,
  };
  let activePlan = planEntries[0].plan;
  for (const entry of planEntries) {
    const features = PLAN_FEATURES[entry.plan as Plan];
    if (features) for (const f of features) allFeatures.add(f);
    if ((planRank[entry.plan] ?? 0) > (planRank[activePlan] ?? 0)) {
      activePlan = entry.plan;
    }
  }

  return {
    features: Array.from(allFeatures),
    plan: activePlan,
    isAdmin: ADMIN_USER_IDS.includes(userId),
  };
}

/** Get AI usage info for a billing period against a given cap (in cents). */
async function getUsageInfo(
  userId: string,
  periodStart: Date,
  capCents: number
) {
  const usage = await db
    .select()
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        eq(aiUsage.periodStart, periodStart)
      )
    )
    .limit(1);

  const credits = await db
    .select()
    .from(aiCredits)
    .where(eq(aiCredits.userId, userId))
    .limit(1);

  const costCents = usage[0]?.totalCostCents ?? 0;
  const creditsCents = credits[0]?.balanceCents ?? 0;

  // At limit if cost exceeds cap AND no purchased credits remain
  const overCap = costCents >= capCents;
  const atLimit = overCap && creditsCents <= 0;

  return {
    costCents,
    capCents,
    creditsCents,
    atLimit,
  };
}

/**
 * Record AI usage cost for auto-submission feature.
 * Called after each AI request in the submission agent.
 */
export async function recordAiUsage(
  userId: string,
  costCents: number,
  periodStart: Date
) {
  const existing = await db
    .select()
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        eq(aiUsage.periodStart, periodStart)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(aiUsage)
      .set({
        totalCostCents: existing[0].totalCostCents + costCents,
        requestCount: existing[0].requestCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(aiUsage.id, existing[0].id));
  } else {
    await db.insert(aiUsage).values({
      userId,
      periodStart,
      totalCostCents: costCents,
      requestCount: 1,
    });
  }
}
