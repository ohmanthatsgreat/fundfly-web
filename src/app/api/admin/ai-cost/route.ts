import { auth } from "@clerk/nextjs/server";
import { db, aiUsage, customers } from "@/lib/db";
import { sql, gte, and, ne, inArray, desc } from "drizzle-orm";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .filter(Boolean);

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId || !ADMIN_USER_IDS.includes(userId)) {
    throw new Error("Forbidden");
  }
  return userId;
}

/**
 * Founder-facing AI spend summary. Rolls up the ai_usage table by updatedAt
 * (robust regardless of per-user billing-period keying) so we can monitor
 * COGS without leaving the app. Admin-gated.
 *
 *   last30 / allTime : { costCents, calls } across all users
 *   systemCents      : last-30d spend attributed to __system__ (crons, blog,
 *                      Zeffy audience classification) — not billable to a user
 *   topUsers         : last-30d top spenders with email, to spot runaways
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const since = new Date(Date.now() - 30 * 86_400_000);
  const costExpr = sql<number>`coalesce(sum(${aiUsage.totalCostCents}), 0)::int`;
  const callsExpr = sql<number>`coalesce(sum(${aiUsage.requestCount}), 0)::int`;

  const [allTime] = await db
    .select({ costCents: costExpr, calls: callsExpr })
    .from(aiUsage);

  const [last30] = await db
    .select({ costCents: costExpr, calls: callsExpr })
    .from(aiUsage)
    .where(gte(aiUsage.updatedAt, since));

  const [system30] = await db
    .select({ costCents: costExpr })
    .from(aiUsage)
    .where(
      and(gte(aiUsage.updatedAt, since), sql`${aiUsage.userId} = '__system__'`)
    );

  const topRows = await db
    .select({
      userId: aiUsage.userId,
      costCents: costExpr,
      calls: callsExpr,
    })
    .from(aiUsage)
    .where(and(gte(aiUsage.updatedAt, since), ne(aiUsage.userId, "__system__")))
    .groupBy(aiUsage.userId)
    .orderBy(desc(costExpr))
    .limit(5);

  // Attach emails for the top spenders.
  const ids = topRows.map((r) => r.userId);
  const custs = ids.length
    ? await db
        .select({ clerkUserId: customers.clerkUserId, email: customers.email })
        .from(customers)
        .where(inArray(customers.clerkUserId, ids))
    : [];
  const emailMap = new Map(custs.map((c) => [c.clerkUserId, c.email]));
  const topUsers = topRows.map((r) => ({
    userId: r.userId,
    email: emailMap.get(r.userId) ?? null,
    costCents: r.costCents,
    calls: r.calls,
  }));

  return Response.json({
    last30,
    allTime,
    systemCents: system30?.costCents ?? 0,
    topUsers,
  });
}
