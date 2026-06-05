import { requireAuth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .filter(Boolean);

/**
 * Admin-only, read-only diagnostic: recent Stripe events + checkout sessions
 * under the LIVE key (whatever STRIPE_SECRET_KEY is in this environment), so we
 * can confirm the webhook is receiving events and see whether anyone attempted
 * to subscribe / buy credits. No writes.
 */
export async function GET() {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ADMIN_USER_IDS.includes(userId)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const keyMode = (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live")
    ? "live"
    : "test";

  try {
    const events = await stripe.events.list({ limit: 30 });
    const sessions = await stripe.checkout.sessions.list({ limit: 20 });
    const subs = await stripe.subscriptions.list({ limit: 20, status: "all" });

    // Tally event types so we can see what's been happening.
    const eventCounts: Record<string, number> = {};
    for (const e of events.data) {
      eventCounts[e.type] = (eventCounts[e.type] || 0) + 1;
    }

    return Response.json({
      keyMode,
      eventCounts,
      recentEvents: events.data.slice(0, 15).map((e) => ({
        type: e.type,
        created: new Date(e.created * 1000).toISOString(),
      })),
      checkoutSessions: sessions.data.map((s) => ({
        created: new Date(s.created * 1000).toISOString(),
        status: s.status, // open | complete | expired
        paymentStatus: s.payment_status, // paid | unpaid | no_payment_required
        mode: s.mode, // subscription | payment
        amountTotal: s.amount_total,
        email: s.customer_details?.email ?? s.customer_email ?? null,
        kind: s.metadata?.kind ?? s.metadata?.plan ?? null,
      })),
      subscriptions: subs.data.map((s) => ({
        created: new Date(s.created * 1000).toISOString(),
        status: s.status,
        customer: typeof s.customer === "string" ? s.customer : s.customer?.id,
      })),
    });
  } catch (err) {
    return Response.json({ keyMode, error: String(err) }, { status: 502 });
  }
}
