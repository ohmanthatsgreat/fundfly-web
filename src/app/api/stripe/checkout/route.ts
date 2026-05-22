import { NextRequest } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { getOrCreateCustomer } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { plan } = await request.json();
  if (!["matching", "submissions"].includes(plan)) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  const priceId =
    plan === "matching"
      ? process.env.STRIPE_MATCHING_PRICE_ID!
      : process.env.STRIPE_SUBMISSIONS_PRICE_ID!;

  const customer = await getOrCreateCustomer(
    userId,
    user.emailAddresses[0]?.emailAddress || "",
    `${user.firstName || ""} ${user.lastName || ""}`.trim() || undefined
  );

  // Get or create Stripe customer
  let stripeCustomerId = customer.stripeCustomerId;
  if (!stripeCustomerId) {
    const stripeCustomer = await stripe.customers.create({
      email: customer.email,
      name: customer.name || undefined,
      metadata: { clerkUserId: userId },
    });
    stripeCustomerId = stripeCustomer.id;

    // Update our DB (import db and customers table)
    const { db, customers: customersTable } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    await db
      .update(customersTable)
      .set({ stripeCustomerId, updatedAt: new Date() })
      .where(eq(customersTable.id, customer.id));
  }

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_URL}/app/settings?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/pricing`,
    metadata: { plan, customerId: String(customer.id) },
  });

  return Response.json({ url: session.url });
}
