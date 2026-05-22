import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, aiMatches, opportunities } from "@/lib/db";
import { eq, and, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const userId = await requireAuth();
  const mode = request.nextUrl.searchParams.get("mode") || "org";

  const results = await db
    .select({
      id: aiMatches.id,
      score: aiMatches.score,
      summary: aiMatches.summary,
      matchReasoning: aiMatches.matchReasoning,
      matchMode: aiMatches.matchMode,
      opportunity: {
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
      },
    })
    .from(aiMatches)
    .innerJoin(opportunities, eq(aiMatches.opportunityId, opportunities.id))
    .where(
      and(eq(aiMatches.userId, userId), eq(aiMatches.matchMode, mode))
    )
    .orderBy(desc(aiMatches.score))
    .limit(100);

  return Response.json({ matches: results });
}
