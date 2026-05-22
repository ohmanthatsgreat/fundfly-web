import { NextRequest } from "next/server";
import { db, savedOpportunities } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

export async function GET() {
  const userId = await requireAuth();
  const saved = await db
    .select()
    .from(savedOpportunities)
    .where(eq(savedOpportunities.userId, userId));
  return Response.json({ saved });
}

export async function POST(request: NextRequest) {
  const userId = await requireAuth();
  const { opportunityId } = await request.json();

  await db
    .insert(savedOpportunities)
    .values({ userId, opportunityId })
    .onConflictDoNothing();

  return Response.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await requireAuth();
  const { opportunityId } = await request.json();

  await db
    .delete(savedOpportunities)
    .where(
      and(
        eq(savedOpportunities.userId, userId),
        eq(savedOpportunities.opportunityId, opportunityId)
      )
    );

  return Response.json({ success: true });
}
