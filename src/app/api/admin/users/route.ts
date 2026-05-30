import { auth } from "@clerk/nextjs/server";
import {
  db,
  customers,
  subscriptions,
  applications,
  licenseKeys,
  trials,
} from "@/lib/db";
import { sql, eq, desc } from "drizzle-orm";

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

  // Get all customers with their subscriptions and application counts
  const allCustomers = await db
    .select()
    .from(customers)
    .orderBy(desc(customers.createdAt));

  const customerIds = allCustomers.map((c) => c.id);

  // Get subscriptions for all customers
  const allSubs =
    customerIds.length > 0
      ? await db.select().from(subscriptions)
      : [];

  // Get application counts per user
  const appCounts =
    allCustomers.length > 0
      ? await db
          .select({
            userId: applications.userId,
            count: sql<number>`count(*)`,
          })
          .from(applications)
          .groupBy(applications.userId)
      : [];

  // Get license keys
  const allKeys =
    customerIds.length > 0
      ? await db.select().from(licenseKeys)
      : [];

  // Get no-card trials (keyed by Clerk user id, not customer id)
  const allTrials =
    allCustomers.length > 0 ? await db.select().from(trials) : [];

  // Map by customer ID
  const subsByCustomer = new Map<number, typeof allSubs>();
  for (const sub of allSubs) {
    const existing = subsByCustomer.get(sub.customerId) || [];
    existing.push(sub);
    subsByCustomer.set(sub.customerId, existing);
  }

  const appCountByUser = new Map<string, number>();
  for (const row of appCounts) {
    appCountByUser.set(row.userId, Number(row.count));
  }

  const keysByCustomer = new Map<number, typeof allKeys>();
  for (const key of allKeys) {
    const existing = keysByCustomer.get(key.customerId) || [];
    existing.push(key);
    keysByCustomer.set(key.customerId, existing);
  }

  const trialByUser = new Map<string, (typeof allTrials)[number]>();
  for (const t of allTrials) {
    trialByUser.set(t.userId, t);
  }

  const users = allCustomers.map((c) => {
    const subs = subsByCustomer.get(c.id) || [];
    const activeSub = subs.find(
      (s) => s.status === "active" || s.status === "trialing"
    );
    const keys = keysByCustomer.get(c.id) || [];
    const activeKey = keys.find((k) => k.active);
    const trial = trialByUser.get(c.clerkUserId) || null;

    return {
      id: c.id,
      clerkUserId: c.clerkUserId,
      email: c.email,
      name: c.name,
      stripeCustomerId: c.stripeCustomerId,
      createdAt: c.createdAt,
      subscription: activeSub
        ? {
            plan: activeSub.plan,
            status: activeSub.status,
            stripeSubscriptionId: activeSub.stripeSubscriptionId,
            currentPeriodEnd: activeSub.currentPeriodEnd,
            cancelAtPeriodEnd: activeSub.cancelAtPeriodEnd,
          }
        : null,
      allSubscriptions: subs.map((s) => ({
        plan: s.plan,
        status: s.status,
        stripeSubscriptionId: s.stripeSubscriptionId,
        currentPeriodEnd: s.currentPeriodEnd,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        createdAt: s.createdAt,
      })),
      applicationCount: appCountByUser.get(c.clerkUserId) || 0,
      licenseKey: activeKey
        ? { key: activeKey.key, plan: activeKey.plan }
        : null,
      trial: trial
        ? {
            plan: trial.plan,
            startedAt: trial.startedAt,
            endsAt: trial.endsAt,
            converted: trial.converted,
            active: trial.endsAt > new Date(),
            daysLeft: Math.max(
              0,
              Math.ceil((trial.endsAt.getTime() - Date.now()) / 86_400_000)
            ),
          }
        : null,
      isAdmin: ADMIN_USER_IDS.includes(c.clerkUserId),
    };
  });

  return Response.json({ users, total: users.length });
}
