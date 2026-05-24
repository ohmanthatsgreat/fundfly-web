import { NextRequest } from "next/server";
import {
  db,
  applications,
  applicationDocuments,
  submissionPlans,
} from "@/lib/db";
import { requireAuth, checkSubscription } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const userId = await requireAuth();
  const applicationId = request.nextUrl.searchParams.get("application_id");

  if (!applicationId) {
    return Response.json({ error: "application_id required" }, { status: 400 });
  }

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
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const docs = await db
    .select()
    .from(applicationDocuments)
    .where(eq(applicationDocuments.applicationId, parseInt(applicationId)));

  return Response.json({ documents: docs });
}

export async function POST(request: NextRequest) {
  const userId = await requireAuth();
  const body = await request.json();
  const { application_id, step_number, artifact_name, name, filename, file_url, mime_type, file_size, source } = body;

  const sub = await checkSubscription(userId, "auto_submission");
  if (!sub.allowed) {
    return Response.json(
      { error: "subscription_required", feature: "auto_submission" },
      { status: 403 }
    );
  }

  if (!application_id || !step_number || !artifact_name) {
    return Response.json(
      { error: "application_id, step_number, and artifact_name required" },
      { status: 400 }
    );
  }

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
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const [doc] = await db
    .insert(applicationDocuments)
    .values({
      applicationId: application_id,
      name: name || artifact_name,
      filename: filename || `${artifact_name}.pdf`,
      fileUrl: file_url || null,
      fileSize: file_size || 0,
      mimeType: mime_type || "application/pdf",
      source: source || "upload",
      status: "ready",
      stepNumber: step_number,
      artifactName: artifact_name,
    })
    .returning();

  return Response.json({ document: doc });
}

export async function DELETE(request: NextRequest) {
  const userId = await requireAuth();
  const body = await request.json();
  const { document_id, application_id } = body;

  if (!document_id || !application_id) {
    return Response.json(
      { error: "document_id and application_id required" },
      { status: 400 }
    );
  }

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
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .delete(applicationDocuments)
    .where(
      and(
        eq(applicationDocuments.id, document_id),
        eq(applicationDocuments.applicationId, application_id)
      )
    );

  return Response.json({ success: true });
}
