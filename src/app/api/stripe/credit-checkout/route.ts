import { NextRequest } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { stripe, getCreditPack } from "@/lib/stripe";
import { getOrCreateCustomer } from "@/lib/auth";

function getBaseUrl(request: NextRequest): string {
  if (
    process.env.NEXT_PUBLIC_URL &&
    process.env.NEXT_PUBLIC_URL !== "http://localhost:3000"
  ) {
    return process.env.NEXT_PUBLIC_URL;
  }
  const host = request.headers.get("host") || "fundfly.app";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

/**
 * One-time purchase of an AI-credit pack. mode: "payment" (NOT subscription).
 * The webhook reads `metadata.kind === "ai_credit_topup"` and adds the REAL
 * headroom (display / AI_MARKUP) to the user's aiCredits balance.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pack } = await request.json();
  const creditPack = getCreditPack(pack);
  if (!creditPack) {
    return Response.json({ error: "Invalid credit pack" }, { status: 400 });
  }

  try {
    const customer = await getOrCreateCustomer(
      userId,
      user.emailAddresses[0]?.emailAddress || "",
      `${user.firstName || ""} ${user.lastName || ""}`.trim() || undefined
    );

    async function createAndPersistStripeCustomer(): Promise<string> {
      const stripeCustomer = await stripe.customers.create({
        email: customer.email,
        name: customer.name || undefined,
        metadata: { clerkUserId: userId },
      });
      const { db, customers: customersTable } = await import("@/lib/db");
      const { eq } = await import("drizzle-orm");
      await db
        .update(customersTable)
        .set({ stripeCustomerId: stripeCustomer.id, updatedAt: new Date() })
        .where(eq(customersTable.id, customer.id));
      return stripeCustomer.id;
    }

    let stripeCustomerId = customer.stripeCustomerId;
    if (!stripeCustomerId) {
      stripeCustomerId = await createAndPersistStripeCustomer();
    }

    const baseUrl = getBaseUrl(request);

    const sessionParams = {
      mode: "payment" as const,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: creditPack.displayCents,
            product_data: {
              name: `FundFly AI Credit — ${creditPack.label}`,
              description: "One-time AI usage credit for your account.",
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/app/settings?credit=success`,
      cancel_url: `${baseUrl}/app/settings`,
      metadata: {
        kind: "ai_credit_topup",
        clerkUserId: userId,
        displayCents: String(creditPack.displayCents),
      },
    };

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        ...sessionParams,
      });
    } catch (err) {
      // Self-heal stale test-mode customer ids (same pattern as the subscription
      // checkout): recreate the customer live and retry once.
      const isMissingCustomer =
        typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === "resource_missing" &&
        (err as { param?: string }).param === "customer";
      if (!isMissingCustomer) throw err;

      console.warn(
        `[credit-checkout] Stale Stripe customer ${stripeCustomerId} for clerk ${userId} — recreating.`
      );
      stripeCustomerId = await createAndPersistStripeCustomer();
      session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        ...sessionParams,
      });
    }

    return Response.json({ url: session.url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected checkout error";
    console.error("[credit-checkout] Stripe session creation failed:", message);
    return Response.json(
      { error: `Could not start checkout: ${message}` },
      { status: 500 }
    );
  }
}
