import { db, savedOpportunities, opportunities } from "@/lib/db";
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
    .from(savedOpportunities)
    .innerJoin(opportunities, eq(savedOpportunities.opportunityId, opportunities.id))
    .where(eq(savedOpportunities.userId, userId));

  return Response.json({
    opportunities: results,
    total: results.length,
    page: 1,
    limit: results.length,
  });
}
