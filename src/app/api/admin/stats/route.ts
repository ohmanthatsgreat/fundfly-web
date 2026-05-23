import { auth } from "@clerk/nextjs/server";
import {
  db,
  customers,
  subscriptions,
  opportunities,
  applications,
  aiMatches,
  savedOpportunities,
  submissionPlans,
} from "@/lib/db";
import { sql, eq, inArray } from "drizzle-orm";

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

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Run all counts in parallel
  const [
    [totalCustomers],
    [totalOpportunities],
    [totalApplications],
    [totalMatches],
    [totalSaved],
    [totalPlans],
    activeSubs,
    oppsBySource,
    oppsByType,
    recentCustomers,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(customers),
    db.select({ count: sql<number>`count(*)` }).from(opportunities),
    db.select({ count: sql<number>`count(*)` }).from(applications),
    db.select({ count: sql<number>`count(*)` }).from(aiMatches),
    db.select({ count: sql<number>`count(*)` }).from(savedOpportunities),
    db.select({ count: sql<number>`count(*)` }).from(submissionPlans),
    db
      .select({
        plan: subscriptions.plan,
        status: subscriptions.status,
        count: sql<number>`count(*)`,
      })
      .from(subscriptions)
      .groupBy(subscriptions.plan, subscriptions.status),
    db
      .select({
        source: opportunities.source,
        count: sql<number>`count(*)`,
      })
      .from(opportunities)
      .groupBy(opportunities.source),
    db
      .select({
        type: opportunities.type,
        count: sql<number>`count(*)`,
      })
      .from(opportunities)
      .groupBy(opportunities.type),
    db
      .select()
      .from(customers)
      .orderBy(sql`${customers.createdAt} desc`)
      .limit(5),
  ]);

  // Compute subscription breakdown
  const subsByPlan: Record<string, Record<string, number>> = {};
  for (const row of activeSubs) {
    if (!subsByPlan[row.plan]) subsByPlan[row.plan] = {};
    subsByPlan[row.plan][row.status] = Number(row.count);
  }

  const totalActiveSubs = activeSubs
    .filter((s) => s.status === "active" || s.status === "trialing")
    .reduce((sum, s) => sum + Number(s.count), 0);

  return Response.json({
    totals: {
      customers: Number(totalCustomers.count),
      activeSubscriptions: totalActiveSubs,
      opportunities: Number(totalOpportunities.count),
      applications: Number(totalApplications.count),
      aiMatches: Number(totalMatches.count),
      savedOpportunities: Number(totalSaved.count),
      submissionPlans: Number(totalPlans.count),
    },
    subscriptionsByPlan: subsByPlan,
    opportunitiesBySource: oppsBySource.map((r) => ({
      source: r.source,
      count: Number(r.count),
    })),
    opportunitiesByType: oppsByType.map((r) => ({
      type: r.type,
      count: Number(r.count),
    })),
    recentCustomers: recentCustomers.map((c) => ({
      id: c.id,
      email: c.email,
      name: c.name,
      createdAt: c.createdAt,
    })),
  });
}
