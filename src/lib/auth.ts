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
 * PREPAID-CREDITS MODEL (2026-05-31).
 *
 * Each plan grants a monthly pool of AI "credit" equal to its display price.
 * Internally we only spend up to HALF of that (a 2× markup), so we can never
 * lose money: the user-facing credit value is `display price`, our real
 * AI-cost cap is `display price / AI_MARKUP`. One unified cap covers ALL AI
 * features included in the plan. Top-ups (aiCredits.balanceCents, stored as
 * REAL headroom) extend the cap. When real spend hits the cap, every AI
 * feature is gated until renewal or a top-up.
 */
const AI_MARKUP = 2; // user-facing credit = AI_MARKUP × our real cost cap

/** Monthly display price (what the user "gets" in credit) per plan, in cents. */
const PLAN_DISPLAY_PRICE_CENTS: Record<string, number> = {
  matching: 2900, // $29
  checklist: 12900, // $129
  auto_submission: 39900, // $399
  bundle: 39900,
};

/** Our real monthly AI-cost cap for a plan = display / markup (50% of price). */
function planCapCents(plan: string): number {
  const display = PLAN_DISPLAY_PRICE_CENTS[plan] ?? 0;
  return Math.round(display / AI_MARKUP);
}

/** The base cap for a user = the cap of their highest active plan. */
function topPlanCapCents(plans: { plan: string }[]): number {
  return plans.reduce((max, p) => Math.max(max, planCapCents(p.plan)), 0);
}

/**
 * Real AI-cost cap for a no-card trial. The trial unlocks ALL features, but a
 * free (no-card) user shouldn't be able to burn a paid tier's full cap, so we
 * cap trials low. $7.50 real ≈ $15 of display credit — enough to genuinely try
 * matching + checklist + a generation/submission.
 */
const TRIAL_CAP_CENTS = 750;

/** True when the user's only active access is a no-card trial (no paid sub). */
function isTrialOnly(entries: { isTrial: boolean }[]): boolean {
  return entries.length > 0 && entries.every((e) => e.isTrial);
}

/** Base real cap for a user: trial cap if trial-only, else top plan's cap. */
function baseCapForEntries(entries: { plan: string; isTrial: boolean }[]): number {
  return isTrialOnly(entries) ? TRIAL_CAP_CENTS : topPlanCapCents(entries);
}

/** Display-credit helpers for the usage meter (user sees 2× our real numbers). */
export function toDisplayCents(realCents: number): number {
  return realCents * AI_MARKUP;
}
export { PLAN_DISPLAY_PRICE_CENTS };

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
 * The effective monthly AI-cost cap (REAL cents) for a user — the highest
 * active plan's cap (50% of its display price) plus any purchased credits.
 *   - admin bypass → null (uncapped)
 *   - no active plan → null
 * The usage meter multiplies this by AI_MARKUP for the user-facing credit value.
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

  // Unified cap = highest active plan's cap (or trial cap) + credit headroom.
  const base = baseCapForEntries(entries);
  const credits = await db
    .select({ balanceCents: aiCredits.balanceCents })
    .from(aiCredits)
    .where(eq(aiCredits.userId, userId))
    .limit(1);
  return base + (credits[0]?.balanceCents ?? 0);
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

  // Unified prepaid-credits cap: ALL AI features share one monthly pool equal
  // to the highest active plan's cap (50% of its display price), or the trial
  // cap for no-card trials, extended by any purchased credits. When real spend
  // meets the cap, every feature gates.
  const baseCap = baseCapForEntries(planEntries);
  const usageInfo = await getUsageInfo(userId, periodStart, baseCap);
  return {
    allowed: !usageInfo.atLimit,
    plan: topEntry.plan,
    usage: usageInfo,
  };
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

  // Credits extend the cap by their (real) amount. Gate only when real spend
  // meets or exceeds the plan cap PLUS purchased credit headroom.
  const effectiveCapCents = capCents + creditsCents;
  const atLimit = costCents >= effectiveCapCents;

  return {
    costCents,
    capCents,
    creditsCents,
    effectiveCapCents,
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
