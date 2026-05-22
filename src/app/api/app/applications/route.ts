import { NextRequest } from "next/server";
import { db, applications, opportunities } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";

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
