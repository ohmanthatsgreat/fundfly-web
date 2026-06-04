import { NextRequest } from "next/server";
import { db, submissionPlans, applications, opportunities, customers } from "@/lib/db";
import { eq } from "drizzle-orm";
import { sendSubmissionConfirmationEmail } from "@/lib/emails";

const WORKER_SECRET = process.env.WORKER_SECRET || "dev-secret";

/**
 * Internal route — only the worker calls this, when an auto-submission run
 * finishes. It (1) persists the final plan status (previously the DB was left
 * at "running" after a successful run), and (2) on success, sends the user a
 * submission-confirmation email (idempotent on the plan id).
 *
 * Auth: Bearer WORKER_SECRET.
 * Body: { planId: number, status: "completed" | "failed", artifacts?: object }
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${WORKER_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    planId?: number;
    status?: string;
    artifacts?: Record<string, string>;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const planId = Number(body.planId);
  const status = body.status === "failed" ? "failed" : "completed";
  if (!planId) {
    return Response.json({ error: "planId required" }, { status: 400 });
  }

  // Persist the final status (+ merge any artifacts the run produced).
  const update: Record<string, unknown> = { status, updatedAt: new Date() };
  if (body.artifacts && typeof body.artifacts === "object") {
    update.artifactsJson = JSON.stringify(body.artifacts);
  }
  await db
    .update(submissionPlans)
    .set(update)
    .where(eq(submissionPlans.id, planId));

  // Only email on success.
  if (status !== "completed") {
    return Response.json({ ok: true, status });
  }

  // Resolve plan → application → opportunity + user email, then confirm.
  try {
    const [plan] = await db
      .select()
      .from(submissionPlans)
      .where(eq(submissionPlans.id, planId))
      .limit(1);
    if (!plan?.applicationId) {
      return Response.json({ ok: true, status, email: "no_application" });
    }

    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, plan.applicationId))
      .limit(1);
    if (!app) return Response.json({ ok: true, status, email: "no_application" });

    const [opp] = await db
      .select({ title: opportunities.title, agency: opportunities.agency })
      .from(opportunities)
      .where(eq(opportunities.id, app.opportunityId))
      .limit(1);

    const [cust] = await db
      .select({ email: customers.email, name: customers.name })
      .from(customers)
      .where(eq(customers.clerkUserId, app.userId))
      .limit(1);

    if (!cust?.email) {
      return Response.json({ ok: true, status, email: "no_recipient" });
    }

    let artifacts: Record<string, string> = body.artifacts || {};
    if (!body.artifacts && plan.artifactsJson) {
      try {
        artifacts = JSON.parse(plan.artifactsJson);
      } catch {}
    }

    const r = await sendSubmissionConfirmationEmail({
      clerkUserId: app.userId,
      to: cust.email,
      name: cust.name,
      planId,
      opportunityTitle: opp?.title || "your grant application",
      agency: opp?.agency,
      artifacts,
    });

    return Response.json({ ok: true, status, email: r });
  } catch (err) {
    console.error("[submission-complete] email step failed:", err);
    // Status was still persisted — don't fail the worker over the email.
    return Response.json({ ok: true, status, email: "error" });
  }
}
