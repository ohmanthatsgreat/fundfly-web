import { NextRequest } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { getOrCreateCustomer } from "@/lib/auth";
import type { Plan } from "@/lib/auth";

const VALID_PLANS: Plan[] = ["matching", "checklist", "auto_submission", "bundle"];

const PLAN_PRICE_ENV: Record<Plan, string> = {
  matching: "STRIPE_MATCHING_PRICE_ID",
  checklist: "STRIPE_CHECKLIST_PRICE_ID",
  auto_submission: "STRIPE_AUTO_SUBMISSION_PRICE_ID",
  bundle: "STRIPE_BUNDLE_PRICE_ID",
};

function getBaseUrl(request: NextRequest): string {
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

  const { plan, referral } = await request.json();
  if (!VALID_PLANS.includes(plan)) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  const envKey = PLAN_PRICE_ENV[plan as Plan];
  const priceId = process.env[envKey];

  if (!priceId) {
    console.error(`[checkout] Missing ${envKey} env var`);
    return Response.json(
      { error: "Checkout not configured. Please set Stripe price IDs." },
      { status: 500 }
    );
  }

  try {
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
      allow_promotion_codes: true,
      metadata: { plan, customerId: String(customer.id) },
      ...(referral ? { client_reference_id: referral } : {}),
    });

    return Response.json({ url: session.url });
  } catch (err) {
    // Stripe (or the customer upsert) throws on misconfiguration — most often a
    // live secret key paired with test-mode price IDs ("No such price"), or a
    // missing STRIPE_SECRET_KEY. Without this catch the route returned an
    // unhandled 500 with a non-JSON body, so the client's res.json() blew up and
    // showed a meaningless "Network error." Surface the real reason instead.
    const message =
      err instanceof Error ? err.message : "Unexpected checkout error";
    console.error("[checkout] Stripe session creation failed:", message);
    return Response.json(
      { error: `Could not start checkout: ${message}` },
      { status: 500 }
    );
  }
}
