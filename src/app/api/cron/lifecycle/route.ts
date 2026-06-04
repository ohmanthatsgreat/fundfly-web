import { NextRequest } from "next/server";
import {
  db,
  customers,
  applications,
  aiMatches,
  opportunities,
} from "@/lib/db";
import { and, eq, gt, lt, gte, desc, sql } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import {
  sendInactiveNudgeEmail,
  sendMatchDigestEmail,
  sendAbandonedCheckoutEmail,
} from "@/lib/emails";

/**
 * Daily lifecycle / re-engagement cron. Idempotency is handled by the
 * email_events ledger (sendOnce), so re-running the same day is safe.
 *
 *   1. Inactive nudge      — signed up 3–30 days ago, no application yet (once)
 *   2. Match digest        — users with new matches this week (once/week)
 *   3. Abandoned checkout  — Stripe sessions started but not completed (once)
 *
 * Auth: Bearer CRON_SECRET (Vercel Cron sends this automatically).
 * Scheduled in vercel.json.
 */

const DAY = 24 * 60 * 60 * 1000;

/** Monday (UTC) of the current week as YYYY-MM-DD — the weekly dedup scope. */
function weekKey(d = new Date()): string {
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)
  );
  return monday.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  if (
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const result = { inactive: 0, digest: 0, abandoned: 0, errors: [] as string[] };

  // ── 1. Inactive nudge ──────────────────────────────────────────────────────
  try {
    const candidates = await db
      .select({
        clerkUserId: customers.clerkUserId,
        email: customers.email,
        name: customers.name,
      })
      .from(customers)
      .where(
        and(
          lt(customers.createdAt, new Date(now - 3 * DAY)),
          gt(customers.createdAt, new Date(now - 30 * DAY))
        )
      );

    const appUsers = await db
      .selectDistinct({ userId: applications.userId })
      .from(applications);
    const hasApp = new Set(appUsers.map((a) => a.userId));

    for (const c of candidates) {
      if (hasApp.has(c.clerkUserId)) continue;
      const r = await sendInactiveNudgeEmail({
        clerkUserId: c.clerkUserId,
        to: c.email,
        name: c.name,
      });
      if (r.sent) result.inactive++;
    }
  } catch (err) {
    result.errors.push(`inactive: ${String(err)}`);
  }

  // ── 2. Weekly match digest ──────────────────────────────────────────────────
  try {
    const since = new Date(now - 7 * DAY);
    const wk = weekKey();

    const perUser = await db
      .select({
        userId: aiMatches.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(aiMatches)
      .where(gte(aiMatches.createdAt, since))
      .groupBy(aiMatches.userId);

    for (const u of perUser) {
      const [cust] = await db
        .select({ email: customers.email, name: customers.name })
        .from(customers)
        .where(eq(customers.clerkUserId, u.userId))
        .limit(1);
      if (!cust?.email) continue;

      const samples = await db
        .select({ title: opportunities.title, agency: opportunities.agency })
        .from(aiMatches)
        .innerJoin(opportunities, eq(aiMatches.opportunityId, opportunities.id))
        .where(and(eq(aiMatches.userId, u.userId), gte(aiMatches.createdAt, since)))
        .orderBy(desc(aiMatches.score))
        .limit(5);

      const r = await sendMatchDigestEmail({
        clerkUserId: u.userId,
        to: cust.email,
        name: cust.name,
        count: u.count,
        samples,
        weekKey: wk,
      });
      if (r.sent) result.digest++;
    }
  } catch (err) {
    result.errors.push(`digest: ${String(err)}`);
  }

  // ── 3. Abandoned checkout (Stripe is the source of truth) ───────────────────
  try {
    const sessions = await stripe.checkout.sessions.list({
      created: { gte: Math.floor((now - 7 * DAY) / 1000) },
      limit: 100,
    });

    for (const s of sessions.data) {
      // Only sessions that expired without completing a payment = abandoned.
      if (s.status !== "expired" || s.payment_status === "paid") continue;
      const meta = s.metadata || {};

      let to: string | null = null;
      let name: string | null = null;
      let clerkUserId: string | null = null;
      let kind: "subscription" | "credits" = "subscription";

      if (meta.kind === "ai_credit_topup" && meta.clerkUserId) {
        kind = "credits";
        clerkUserId = meta.clerkUserId;
        const [c] = await db
          .select({ email: customers.email, name: customers.name })
          .from(customers)
          .where(eq(customers.clerkUserId, meta.clerkUserId))
          .limit(1);
        to = c?.email ?? null;
        name = c?.name ?? null;
      } else if (meta.customerId) {
        kind = "subscription";
        const [c] = await db
          .select({
            email: customers.email,
            name: customers.name,
            clerkUserId: customers.clerkUserId,
          })
          .from(customers)
          .where(eq(customers.id, parseInt(meta.customerId)))
          .limit(1);
        to = c?.email ?? null;
        name = c?.name ?? null;
        clerkUserId = c?.clerkUserId ?? null;
      }

      if (!to || !clerkUserId) continue;
      const r = await sendAbandonedCheckoutEmail({
        clerkUserId,
        to,
        name,
        sessionId: s.id,
        kind,
      });
      if (r.sent) result.abandoned++;
    }
  } catch (err) {
    result.errors.push(`abandoned: ${String(err)}`);
  }

  console.log(
    `[cron/lifecycle] inactive=${result.inactive} digest=${result.digest} abandoned=${result.abandoned} errors=${result.errors.length}`
  );
  return Response.json({ ok: true, ...result });
}
