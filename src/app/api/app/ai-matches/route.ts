import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  db,
  aiMatches,
  opportunities,
  matchScanState,
  dismissedOpportunities,
} from "@/lib/db";
import { eq, and, desc, inArray, notInArray, sql } from "drizzle-orm";

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

  // Hydrate the persisted scan cursor so the UI can resume "X of Y scanned"
  // and the Keep-Searching / Re-scan controls reflect real server state.
  const [scanState] = await db
    .select()
    .from(matchScanState)
    .where(
      and(eq(matchScanState.userId, userId), eq(matchScanState.mode, mode))
    )
    .limit(1);

  // Total eligible opportunities for this mode (mirrors ai-match's filter),
  // so the client shows an accurate denominator.
  const dismissed = await db
    .select({ id: dismissedOpportunities.opportunityId })
    .from(dismissedOpportunities)
    .where(eq(dismissedOpportunities.userId, userId));
  const dismissedIds = dismissed.map((d) => d.id);

  const audiences =
    mode === "personal" ? ["personal", "both"] : ["business", "both"];
  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.status, "open"),
        inArray(opportunities.audience, audiences),
        dismissedIds.length > 0
          ? notInArray(opportunities.id, dismissedIds)
          : undefined
      )
    );
  const totalAvailable = totalRow?.count ?? 0;

  const totalScanned = scanState?.scannedCount ?? 0;
  const scanOffset = scanState?.scanOffset ?? 0;
  const hasMore = scanOffset < totalAvailable;

  return Response.json({
    matches: results,
    scan: { totalScanned, totalAvailable, hasMore },
  });
}
