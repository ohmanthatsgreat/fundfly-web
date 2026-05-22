import { auth } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { db, customers } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.clerkUserId, userId))
    .limit(1);

  if (!customer?.stripeCustomerId) {
    return Response.json({ error: "No billing account" }, { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customer.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_URL}/app/settings`,
  });

  return Response.json({ url: session.url });
}
