import { auth } from "@clerk/nextjs/server";
import { db, customers, subscriptions, userSettings, aiUsage, aiCredits } from "./db";
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

export async function requireAuth() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
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
  // Admin bypass — check if this admin has stripe gates disabled
  if (ADMIN_USER_IDS.includes(userId)) {
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
  }

  const customer = await db
    .select()
    .from(customers)
    .where(eq(customers.clerkUserId, userId))
    .limit(1);

  if (customer.length === 0) return { allowed: false };

  const activeSubs = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.customerId, customer[0].id),
        inArray(subscriptions.status, ["active", "trialing"])
      )
    );

  if (activeSubs.length === 0) return { allowed: false };

  // Check if any active subscription grants this feature
  const hasFeature = activeSubs.some((sub) => {
    const plan = sub.plan as Plan;
    const features = PLAN_FEATURES[plan];
    return features?.includes(feature);
  });

  if (!hasFeature) {
    return { allowed: false, plan: activeSubs[0].plan };
  }

  // For auto_submission, check usage cap
  if (feature === "auto_submission") {
    const usageInfo = await getUsageInfo(userId, activeSubs[0]);
    if (usageInfo.atLimit) {
      return {
        allowed: false,
        plan: activeSubs[0].plan,
        usage: usageInfo,
      };
    }
    return {
      allowed: true,
      plan: activeSubs[0].plan,
      usage: usageInfo,
    };
  }

  return { allowed: true, plan: activeSubs[0].plan };
}

/**
 * Get all features the user currently has access to.
 */
export async function getUserFeatures(userId: string): Promise<{
  features: Feature[];
  plan: string | null;
  isAdmin: boolean;
}> {
  // Admin bypass
  if (ADMIN_USER_IDS.includes(userId)) {
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
        isAdmin: true,
      };
    }
  }

  const customer = await db
    .select()
    .from(customers)
    .where(eq(customers.clerkUserId, userId))
    .limit(1);

  if (customer.length === 0) return { features: [], plan: null, isAdmin: ADMIN_USER_IDS.includes(userId) };

  const activeSubs = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.customerId, customer[0].id),
        inArray(subscriptions.status, ["active", "trialing"])
      )
    );

  if (activeSubs.length === 0) return { features: [], plan: null, isAdmin: ADMIN_USER_IDS.includes(userId) };

  const allFeatures = new Set<Feature>();
  let activePlan = activeSubs[0].plan;

  for (const sub of activeSubs) {
    const plan = sub.plan as Plan;
    const features = PLAN_FEATURES[plan];
    if (features) {
      for (const f of features) allFeatures.add(f);
    }
  }

  return {
    features: Array.from(allFeatures),
    plan: activePlan,
    isAdmin: ADMIN_USER_IDS.includes(userId),
  };
}

/** Get AI usage info for the current billing period */
async function getUsageInfo(
  userId: string,
  sub: { currentPeriodEnd: Date }
) {
  // Calculate period start (roughly 30 days before period end)
  const periodStart = new Date(sub.currentPeriodEnd);
  periodStart.setMonth(periodStart.getMonth() - 1);

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
  const overCap = costCents >= AUTO_SUB_CAP_CENTS;
  const atLimit = overCap && creditsCents <= 0;

  return {
    costCents,
    capCents: AUTO_SUB_CAP_CENTS,
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
