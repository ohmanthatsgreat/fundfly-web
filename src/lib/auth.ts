import { auth } from "@clerk/nextjs/server";
import { db, customers, subscriptions } from "./db";
import { eq, and, inArray } from "drizzle-orm";

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

export async function checkSubscription(
  userId: string,
  feature: "matching" | "submissions"
): Promise<{ allowed: boolean; plan?: string }> {
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

  const sub = activeSubs[0];

  if (feature === "matching") {
    return {
      allowed: sub.plan === "matching" || sub.plan === "submissions",
      plan: sub.plan,
    };
  }

  if (feature === "submissions") {
    return {
      allowed: sub.plan === "submissions",
      plan: sub.plan,
    };
  }

  return { allowed: false };
}
