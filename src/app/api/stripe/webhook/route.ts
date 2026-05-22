import { NextRequest } from "next/server";
import { stripe, generateLicenseKey } from "@/lib/stripe";
import { db, subscriptions, licenseKeys } from "@/lib/db";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

/** In Stripe v22 / basil API, current_period_end moved to SubscriptionItem */
function getPeriodEnd(sub: Stripe.Subscription): Date {
  const ts = sub.items?.data?.[0]?.current_period_end;
  if (ts) return new Date(ts * 1000);
  // Fallback: 30 days from now
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const plan = session.metadata?.plan;
      const customerId = session.metadata?.customerId;

      if (!plan || !customerId) break;

      const stripeSubscription = await stripe.subscriptions.retrieve(
        session.subscription as string,
        { expand: ["items.data"] }
      );

      await db.insert(subscriptions).values({
        customerId: parseInt(customerId),
        stripeSubscriptionId: stripeSubscription.id,
        plan,
        status: "active",
        currentPeriodEnd: getPeriodEnd(stripeSubscription),
      });

      // Generate license key for desktop app
      await db.insert(licenseKeys).values({
        key: generateLicenseKey(),
        customerId: parseInt(customerId),
        plan,
      });

      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as unknown as Record<string, unknown>;
      const subId = (invoice.subscription || (invoice.parent as Record<string, unknown>)?.subscription) as string;
      if (!subId) break;

      const stripeSub = await stripe.subscriptions.retrieve(subId, {
        expand: ["items.data"],
      });
      await db
        .update(subscriptions)
        .set({
          status: "active",
          currentPeriodEnd: getPeriodEnd(stripeSub),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, subId));
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as unknown as Record<string, unknown>;
      const subId = (invoice.subscription || (invoice.parent as Record<string, unknown>)?.subscription) as string;
      if (!subId) break;

      await db
        .update(subscriptions)
        .set({ status: "past_due", updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, subId));
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await db
        .update(subscriptions)
        .set({
          status: sub.status,
          currentPeriodEnd: getPeriodEnd(sub),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id));
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await db
        .update(subscriptions)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id));

      // Deactivate license keys
      const [dbSub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, sub.id))
        .limit(1);

      if (dbSub) {
        await db
          .update(licenseKeys)
          .set({ active: false })
          .where(eq(licenseKeys.customerId, dbSub.customerId));
      }
      break;
    }
  }

  return Response.json({ received: true });
}
