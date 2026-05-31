import { NextRequest } from "next/server";
import {
  db,
  applications,
  opportunities,
  submissionPlans,
  userProfiles,
} from "@/lib/db";
import { requireAuth, checkSubscription } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { researchSubmissionPlan } from "@/lib/submission-planner";

export async function POST(request: NextRequest) {
  const userId = await requireAuth();
  const { application_id, update_artifacts } = await request.json();

  // Check subscription — submission planning requires "checklist" feature
  const sub = await checkSubscription(userId, "checklist");
  if (!sub.allowed) {
    return Response.json(
      { error: "subscription_required", feature: "checklist" },
      { status: 403 }
    );
  }

  if (!application_id) {
    return Response.json(
      { error: "application_id required" },
      { status: 400 }
    );
  }

  // If updating artifacts (e.g., step readiness checkboxes), handle that separately
  if (update_artifacts) {
    const [planRow] = await db
      .select()
      .from(submissionPlans)
      .where(eq(submissionPlans.applicationId, application_id))
      .limit(1);

    if (!planRow) {
      return Response.json({ error: "No plan found" }, { status: 404 });
    }

    const existing = JSON.parse(planRow.artifactsJson || "{}");
    const merged = { ...existing, ...update_artifacts };

    await db
      .update(submissionPlans)
      .set({ artifactsJson: JSON.stringify(merged), updatedAt: new Date() })
      .where(eq(submissionPlans.id, planRow.id));

    return Response.json({ success: true, artifacts: merged });
  }

  // Verify ownership and get application + opportunity
  const [app] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.id, application_id),
        eq(applications.userId, userId)
      )
    )
    .limit(1);

  if (!app) {
    return Response.json(
      { error: "Application not found" },
      { status: 404 }
    );
  }

  const [opp] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, app.opportunityId))
    .limit(1);

  if (!opp) {
    return Response.json(
      { error: "Opportunity not found" },
      { status: 404 }
    );
  }

  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (!profile) {
    return Response.json(
      { error: "Please set up your organization profile first." },
      { status: 400 }
    );
  }

  try {
    const plan = await researchSubmissionPlan(profile, opp, userId);

    // Upsert the plan
    const [existing] = await db
      .select()
      .from(submissionPlans)
      .where(eq(submissionPlans.applicationId, application_id))
      .limit(1);

    if (existing) {
      await db
        .update(submissionPlans)
        .set({
          planJson: JSON.stringify(plan),
          status: "pending",
          currentStep: 0,
          artifactsJson: "{}",
          updatedAt: new Date(),
        })
        .where(eq(submissionPlans.id, existing.id));

      return Response.json({
        success: true,
        plan,
        plan_id: existing.id,
      });
    }

    const [inserted] = await db
      .insert(submissionPlans)
      .values({
        applicationId: application_id,
        planJson: JSON.stringify(plan),
        status: "pending",
        currentStep: 0,
      })
      .returning();

    return Response.json({
      success: true,
      plan,
      plan_id: inserted.id,
    });
  } catch (err) {
    // Log the real error for debugging, but return a clean, user-friendly
    // message — never surface raw JSON parser/internal errors to the UI.
    console.error("[submission-plan] Generation failed:", err);
    return Response.json(
      {
        error:
          "We couldn't build the submission plan this time. Please try again in a moment.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const userId = await requireAuth();
  const applicationId = request.nextUrl.searchParams.get("application_id");

  if (!applicationId) {
    return Response.json(
      { error: "application_id required" },
      { status: 400 }
    );
  }

  // Verify ownership
  const [app] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.id, parseInt(applicationId)),
        eq(applications.userId, userId)
      )
    )
    .limit(1);

  if (!app) {
    return Response.json({ plan: null });
  }

  const [planRow] = await db
    .select()
    .from(submissionPlans)
    .where(eq(submissionPlans.applicationId, parseInt(applicationId)))
    .limit(1);

  if (!planRow) {
    return Response.json({ plan: null });
  }

  return Response.json({
    plan: {
      id: planRow.id,
      status: planRow.status,
      currentStep: planRow.currentStep,
      plan_data: JSON.parse(planRow.planJson),
      artifacts: JSON.parse(planRow.artifactsJson || "{}"),
    },
  });
}
