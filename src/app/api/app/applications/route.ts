import { NextRequest } from "next/server";
import { db, applications, opportunities } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

export async function GET() {
  const userId = await requireAuth();

  const results = await db
    .select({
      id: applications.id,
      opportunityId: applications.opportunityId,
      status: applications.status,
      notes: applications.notes,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
      submittedAt: applications.submittedAt,
      opportunityTitle: opportunities.title,
      opportunityAgency: opportunities.agency,
      opportunityDeadline: opportunities.deadline,
    })
    .from(applications)
    .leftJoin(opportunities, eq(applications.opportunityId, opportunities.id))
    .where(eq(applications.userId, userId));

  return Response.json({ applications: results });
}

export async function POST(request: NextRequest) {
  const userId = await requireAuth();
  const { opportunityId } = await request.json();

  const [app] = await db
    .insert(applications)
    .values({ userId, opportunityId, status: "draft" })
    .onConflictDoNothing()
    .returning();

  return Response.json({ application: app });
}

export async function PATCH(request: NextRequest) {
  const userId = await requireAuth();
  const { id, status, notes } = await request.json();

  if (!id) {
    return Response.json({ error: "Missing application id" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  const [updated] = await db
    .update(applications)
    .set(updates)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .returning();

  if (!updated) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ application: updated });
}

export async function DELETE(request: NextRequest) {
  const userId = await requireAuth();
  const { id } = await request.json();

  if (!id) {
    return Response.json({ error: "Missing application id" }, { status: 400 });
  }

  await db
    .delete(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)));

  return Response.json({ success: true });
}
