import { NextRequest } from "next/server";
import {
  db,
  applications,
  applicationSections,
  applicationDocuments,
  submissionPlans,
  opportunities,
} from "@/lib/db";
import { requireAuth, checkSubscription } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { generateApplicationDocx } from "@/lib/generate-docx";

type PlanStep = {
  step_number: number;
  artifacts_needed?: string[];
  action?: string;
};

/**
 * Pick the submission step the generated application doc should attach to:
 * the step whose needed-artifacts mention an application/narrative/proposal,
 * else the first step that needs any document, else step 1.
 */
function pickTargetStep(steps: PlanStep[]): number {
  const re = /(application|narrative|proposal|project description|abstract|form)/i;
  const byName = steps.find((s) =>
    (s.artifacts_needed || []).some((a) => re.test(a))
  );
  if (byName) return byName.step_number;
  const withDocs = steps.find((s) => (s.artifacts_needed || []).length > 0);
  if (withDocs) return withDocs.step_number;
  return steps[0]?.step_number ?? 1;
}

export async function POST(request: NextRequest) {
  const userId = await requireAuth();
  const { application_id } = await request.json();

  // Attaching for the agent to upload is an auto_submission capability.
  const sub = await checkSubscription(userId, "auto_submission");
  if (!sub.allowed) {
    return Response.json(
      { error: "subscription_required", feature: "auto_submission" },
      { status: 403 }
    );
  }

  if (!application_id) {
    return Response.json({ error: "application_id required" }, { status: 400 });
  }

  // Ownership
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
    return Response.json({ error: "Application not found" }, { status: 404 });
  }

  // Sections to render
  const sections = await db
    .select()
    .from(applicationSections)
    .where(eq(applicationSections.applicationId, application_id));

  const withContent = sections.filter((s) => (s.content || "").trim());
  if (withContent.length === 0) {
    return Response.json(
      { error: "Generate your application content first." },
      { status: 400 }
    );
  }

  // Opportunity metadata for the title page
  const [opp] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, app.opportunityId))
    .limit(1);

  // Determine the target step from the submission plan (if one exists)
  let targetStep = 1;
  const [planRow] = await db
    .select()
    .from(submissionPlans)
    .where(eq(submissionPlans.applicationId, application_id))
    .limit(1);
  if (planRow) {
    try {
      const plan = JSON.parse(planRow.planJson);
      if (Array.isArray(plan.steps) && plan.steps.length > 0) {
        targetStep = pickTargetStep(plan.steps);
      }
    } catch {
      // fall back to step 1
    }
  }

  // Render the DOCX (server-side) and store it as a base64 data URL — same
  // storage approach as user uploads; the worker decodes data: URLs.
  const blob = await generateApplicationDocx(
    withContent
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((s) => ({ sectionTitle: s.sectionTitle, content: s.content || "" })),
    {
      title: opp?.title || "Grant Application",
      agency: opp?.agency || null,
      deadline: opp?.deadline || null,
    }
  );
  const buffer = Buffer.from(await blob.arrayBuffer());
  const dataUrl = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${buffer.toString(
    "base64"
  )}`;

  const artifactName = "Full Application";
  const filename = `${(opp?.title || "application")
    .slice(0, 50)
    .replace(/[^a-zA-Z0-9]/g, "_")}_Application.docx`;

  // Replace any prior agent-generated copy for this step/artifact so we don't
  // pile up stale versions when the user regenerates.
  await db
    .delete(applicationDocuments)
    .where(
      and(
        eq(applicationDocuments.applicationId, application_id),
        eq(applicationDocuments.stepNumber, targetStep),
        eq(applicationDocuments.artifactName, artifactName),
        eq(applicationDocuments.source, "ai_generated")
      )
    );

  const [doc] = await db
    .insert(applicationDocuments)
    .values({
      applicationId: application_id,
      name: artifactName,
      filename,
      fileUrl: dataUrl,
      fileSize: buffer.length,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      source: "ai_generated",
      status: "ready",
      stepNumber: targetStep,
      artifactName,
    })
    .returning();

  return Response.json({ document: doc, stepNumber: targetStep });
}
