import { NextRequest } from "next/server";
import { stripe, generateLicenseKey } from "@/lib/stripe";
import {
  db,
  subscriptions,
  licenseKeys,
  aiCredits,
  creditTopups,
  customers,
} from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { realCentsFromDisplay } from "@/lib/auth";
import {
  sendCreditReceiptEmail,
  sendSubscriptionReceiptEmail,
  sendPaymentFailedEmail,
  sendTrialEndingEmail,
} from "@/lib/emails";
import Stripe from "stripe";

type Recipient = { email: string; name: string | null; clerkUserId: string };

async function recipientByClerkId(
  clerkUserId: string
): Promise<Recipient | null> {
  const [c] = await db
    .select({ email: customers.email, name: customers.name })
    .from(customers)
    .where(eq(customers.clerkUserId, clerkUserId))
    .limit(1);
  return c?.email ? { email: c.email, name: c.name, clerkUserId } : null;
}

async function recipientByCustomerId(
  customerId: number
): Promise<Recipient | null> {
  const [c] = await db
    .select({
      email: customers.email,
      name: customers.name,
      clerkUserId: customers.clerkUserId,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  return c?.email
    ? { email: c.email, name: c.name, clerkUserId: c.clerkUserId }
    : null;
}

/** Resolve our recipient + plan from a Stripe subscription id. */
async function recipientBySubId(
  stripeSubId: string
): Promise<(Recipient & { plan: string }) | null> {
  const [s] = await db
    .select({ customerId: subscriptions.customerId, plan: subscriptions.plan })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubId))
    .limit(1);
  if (!s) return null;
  const r = await recipientByCustomerId(s.customerId);
  return r ? { ...r, plan: s.plan } : null;
}

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

      // ── AI credit top-up (one-time payment) ──────────────────────────────
      // Branch FIRST: these sessions have no subscription, so they must not
      // fall through to the subscription logic below.
      if (session.metadata?.kind === "ai_credit_topup") {
        const clerkUserId = session.metadata?.clerkUserId;
        const displayCents = parseInt(session.metadata?.displayCents || "0", 10);
        if (!clerkUserId || !displayCents) break;

        // Only grant on a paid session.
        if (session.payment_status !== "paid") break;

        const realCents = realCentsFromDisplay(displayCents);

        // Idempotency: the session id is UNIQUE in credit_topups. If this insert
        // actually creates a row, it's the first time we've seen this session →
        // grant the credit. A retried webhook hits the conflict → no-op.
        const inserted = await db
          .insert(creditTopups)
          .values({
            userId: clerkUserId,
            sessionId: session.id,
            displayCents,
            realCents,
          })
          .onConflictDoNothing({ target: creditTopups.sessionId })
          .returning({ id: creditTopups.id });

        if (inserted.length > 0) {
          await db
            .insert(aiCredits)
            .values({ userId: clerkUserId, balanceCents: realCents })
            .onConflictDoUpdate({
              target: aiCredits.userId,
              set: {
                balanceCents: sql`${aiCredits.balanceCents} + ${realCents}`,
                updatedAt: new Date(),
              },
            });
          console.log(
            `[webhook] AI credit +${realCents}¢ real ($${(displayCents / 100).toFixed(0)} display) for ${clerkUserId} (session ${session.id})`
          );

          // Receipt email (idempotent on the session id).
          const r = await recipientByClerkId(clerkUserId);
          if (r) {
            await sendCreditReceiptEmail({
              clerkUserId,
              to: r.email,
              name: r.name,
              displayCents,
              sessionId: session.id,
            }).catch((e) => console.error("[webhook] credit email:", e));
          }
        }
        break;
      }

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

      // Subscription receipt / welcome email (idempotent on subscription id).
      const subRecipient = await recipientByCustomerId(parseInt(customerId));
      if (subRecipient) {
        await sendSubscriptionReceiptEmail({
          clerkUserId: subRecipient.clerkUserId,
          to: subRecipient.email,
          name: subRecipient.name,
          plan,
          subscriptionId: stripeSubscription.id,
        }).catch((e) => console.error("[webhook] sub email:", e));
      }

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

      // Nudge the user to fix their card (idempotent on invoice id).
      const invoiceId = String(invoice.id || subId);
      const r = await recipientBySubId(subId);
      if (r) {
        await sendPaymentFailedEmail({
          clerkUserId: r.clerkUserId,
          to: r.email,
          name: r.name,
          invoiceId,
        }).catch((e) => console.error("[webhook] payment-failed email:", e));
      }
      break;
    }

    case "customer.subscription.trial_will_end": {
      // Stripe fires this ~3 days before a trial ends (if the event is enabled
      // on the webhook). Remind the user before the first charge.
      const sub = event.data.object as Stripe.Subscription;
      const r = await recipientBySubId(sub.id);
      if (r && sub.trial_end) {
        await sendTrialEndingEmail({
          clerkUserId: r.clerkUserId,
          to: r.email,
          name: r.name,
          plan: r.plan,
          endsAt: new Date(sub.trial_end * 1000),
          subscriptionId: sub.id,
        }).catch((e) => console.error("[webhook] trial-ending email:", e));
      }
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
