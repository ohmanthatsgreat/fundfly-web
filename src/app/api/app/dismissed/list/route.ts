import { db, dismissedOpportunities, opportunities } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET() {
  const userId = await requireAuth();

  const results = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      agency: opportunities.agency,
      type: opportunities.type,
      status: opportunities.status,
      fundingMin: opportunities.fundingMin,
      fundingMax: opportunities.fundingMax,
      deadline: opportunities.deadline,
      source: opportunities.source,
      description: opportunities.description,
      sourceUrl: opportunities.sourceUrl,
      grantUrl: opportunities.grantUrl,
      audience: opportunities.audience,
    })
    .from(dismissedOpportunities)
    .innerJoin(
      opportunities,
      eq(dismissedOpportunities.opportunityId, opportunities.id)
    )
    .where(eq(dismissedOpportunities.userId, userId));

  return Response.json({
    opportunities: results,
    total: results.length,
    page: 1,
    limit: results.length,
  });
}
