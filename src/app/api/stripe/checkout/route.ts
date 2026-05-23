import { NextRequest } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { getOrCreateCustomer } from "@/lib/auth";

function getBaseUrl(request: NextRequest): string {
  // Prefer explicit env var, fall back to request headers
  if (process.env.NEXT_PUBLIC_URL && process.env.NEXT_PUBLIC_URL !== "http://localhost:3000") {
    return process.env.NEXT_PUBLIC_URL;
  }
  const host = request.headers.get("host") || "fundfly.app";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

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
      ? process.env.STRIPE_MATCHING_PRICE_ID
      : process.env.STRIPE_SUBMISSIONS_PRICE_ID;

  if (!priceId) {
    console.error(`[checkout] Missing STRIPE_${plan.toUpperCase()}_PRICE_ID env var`);
    return Response.json(
      { error: "Checkout not configured. Please set Stripe price IDs." },
      { status: 500 }
    );
  }

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

    // Update our DB
    const { db, customers: customersTable } = await import("@/lib/db");
    const { eq } = await import("drizzle-orm");
    await db
      .update(customersTable)
      .set({ stripeCustomerId, updatedAt: new Date() })
      .where(eq(customersTable.id, customer.id));
  }

  const baseUrl = getBaseUrl(request);

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/app/settings?success=true`,
    cancel_url: `${baseUrl}/pricing`,
    metadata: { plan, customerId: String(customer.id) },
  });

  return Response.json({ url: session.url });
}
