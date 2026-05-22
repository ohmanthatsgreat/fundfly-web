import { NextRequest } from "next/server";
import { db, dismissedOpportunities } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const userId = await requireAuth();
  const { opportunityId, reason = "not_interested" } = await request.json();

  await db
    .insert(dismissedOpportunities)
    .values({ userId, opportunityId, reason })
    .onConflictDoNothing();

  return Response.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await requireAuth();
  const { opportunityId } = await request.json();

  await db
    .delete(dismissedOpportunities)
    .where(
      and(
        eq(dismissedOpportunities.userId, userId),
        eq(dismissedOpportunities.opportunityId, opportunityId)
      )
    );

  return Response.json({ success: true });
}
