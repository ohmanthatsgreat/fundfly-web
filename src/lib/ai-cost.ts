import type Anthropic from "@anthropic-ai/sdk";
import { recordAiUsage } from "@/lib/auth";
import { db, subscriptions, customers, aiUsageEvents } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Which product feature triggered an AI call. Threaded into recordCallCost so
 * the append-only `ai_usage_events` log captures REAL per-feature unit cost —
 * the data needed to design the prepaid-credits pricing model (backlog #3).
 * "other" is the default for any call site that hasn't been tagged yet.
 */
export type AiFeature =
  | "enhance"
  | "match_org"
  | "match_personal"
  | "generate_application"
  | "generate_section"
  | "submission_plan"
  | "submission_agent"
  | "classify_audience"
  | "blog"
  | "other";

/**
 * Per-model pricing in USD per 1M tokens. Updated 2026-05-24.
 * Numbers track Anthropic's published rates for the Claude 4.x family.
 * Update here if rates change.
 */
const MODEL_PRICING_PER_MTOK: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  // Sonnet 4.6: standard mid-tier model used across most app AI calls
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3, // 10% of input
    cacheWrite: 3.75, // 125% of input
  },
  // Haiku 4.5: cheap classification + low-stakes calls
  "claude-haiku-4-5-20251001": {
    input: 1.0,
    output: 5.0,
    cacheRead: 0.1,
    cacheWrite: 1.25,
  },
  // Opus 4.6: not currently used but defined for safety
  "claude-opus-4-6": {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
  },
};

const DEFAULT_PRICING = MODEL_PRICING_PER_MTOK["claude-sonnet-4-6"];

/** Accepts either Anthropic SDK Usage (with nullable cache fields) or our internal shape. */
type UsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
} | null | undefined;

/** Normalize a usage object to non-negative integer token counts. */
function extractTokens(usage: UsageLike) {
  return {
    input: usage?.input_tokens ?? 0,
    output: usage?.output_tokens ?? 0,
    cacheWrite: usage?.cache_creation_input_tokens ?? 0,
    cacheRead: usage?.cache_read_input_tokens ?? 0,
  };
}

/**
 * Compute the dollar cost (in cents) of a single Claude API call from its
 * usage object. Returns a non-negative integer suitable for storage.
 */
export function computeCostCents(model: string, usage: UsageLike): number {
  if (!usage) return 0;

  const rates = MODEL_PRICING_PER_MTOK[model] ?? DEFAULT_PRICING;
  const { input, output, cacheWrite, cacheRead } = extractTokens(usage);

  const dollars =
    (input / 1_000_000) * rates.input +
    (output / 1_000_000) * rates.output +
    (cacheWrite / 1_000_000) * rates.cacheWrite +
    (cacheRead / 1_000_000) * rates.cacheRead;

  // Round up to the next cent to be conservative — better to over-bill
  // ourselves than under-bill at the cap.
  return Math.ceil(dollars * 100);
}

/**
 * Append one row to the per-call usage log. Best-effort: never throws.
 * Captures the feature + raw token counts so we can compute true per-feature
 * unit economics. Logged even for $0 calls (as long as usage is present) so
 * token-level data isn't lost on tiny calls.
 */
async function logUsageEvent(
  userId: string | null,
  feature: AiFeature,
  model: string,
  usage: UsageLike,
  costCents: number
): Promise<void> {
  if (!usage) return;
  const { input, output, cacheWrite, cacheRead } = extractTokens(usage);
  await db.insert(aiUsageEvents).values({
    userId: userId ?? "__system__",
    feature,
    model,
    costCents,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: cacheWrite,
  });
}

/**
 * Get the start of the current billing period for a user.
 * Uses their auto_submission subscription's currentPeriodEnd minus one month.
 * For users without an active sub (e.g. blog generator with no userId), returns
 * the first day of the current calendar month as a fallback.
 */
async function getPeriodStart(userId: string | null): Promise<Date> {
  if (userId) {
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
        const periodStart = new Date(subs[0].currentPeriodEnd);
        periodStart.setMonth(periodStart.getMonth() - 1);
        return periodStart;
      }
    }
  }

  // Fallback: first of current month at UTC midnight
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Record the cost of an AI call against a user's billing period AND append a
 * per-feature row to the usage-events log. Safe to call without awaiting —
 * failure here must not break the user-facing request. Errors are logged and
 * swallowed.
 *
 * `userId` may be null for system-level calls (e.g. cron blog generation,
 * Zeffy audience classification) — in that case, cost is logged against the
 * `__system__` user so it appears in admin dashboards but doesn't affect
 * any real user's cap.
 *
 * `feature` tags the call so we can measure true per-feature unit costs.
 */
export async function recordCallCost(
  userId: string | null,
  model: string,
  response: { usage?: UsageLike } | Anthropic.Message,
  feature: AiFeature = "other"
): Promise<void> {
  try {
    const cost = computeCostCents(model, response.usage);
    await logUsageEvent(userId, feature, model, response.usage, cost);
    if (cost === 0) return;
    const periodStart = await getPeriodStart(userId);
    await recordAiUsage(userId ?? "__system__", cost, periodStart);
  } catch (err) {
    // Never block the user-facing flow on cost-tracking failures
    console.error("[ai-cost] Failed to record call cost:", err);
  }
}

/**
 * Synchronous version for cases where we want to wait — e.g. before
 * deciding whether to allow the next call. Returns the cents recorded.
 */
export async function recordCallCostSync(
  userId: string | null,
  model: string,
  response: { usage?: UsageLike } | Anthropic.Message,
  feature: AiFeature = "other"
): Promise<number> {
  try {
    const cost = computeCostCents(model, response.usage);
    await logUsageEvent(userId, feature, model, response.usage, cost);
    if (cost === 0) return 0;
    const periodStart = await getPeriodStart(userId);
    await recordAiUsage(userId ?? "__system__", cost, periodStart);
    return cost;
  } catch (err) {
    console.error("[ai-cost] Failed to record call cost:", err);
    return 0;
  }
}
