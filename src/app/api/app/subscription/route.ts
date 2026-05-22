import { db, customers, subscriptions } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { eq, and, inArray } from "drizzle-orm";

export async function GET() {
  const userId = await requireAuth();

  const customer = await db
    .select()
    .from(customers)
    .where(eq(customers.clerkUserId, userId))
    .limit(1);

  if (customer.length === 0) {
    return Response.json({ subscription: null });
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

  return Response.json({ subscription: sub || null });
}
