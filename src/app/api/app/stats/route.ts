import { db, opportunities, savedOpportunities, applications, aiMatches } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sql, eq, and, gte, inArray, count, or, isNull, ne } from "drizzle-orm";

/**
 * Catalog counts must match what the browse pages actually show, which hide
 * closed/expired grants by default. So every global count excludes
 * status='closed' (null status stays visible — same rule as the list route).
 */
const openOnly = or(
  isNull(opportunities.status),
  ne(opportunities.status, "closed")
);

/**
 * Global opportunity counts are identical for every user and only change when
 * the sync cron runs (every 4h). They're the expensive part of this endpoint
 * (filtered COUNTs over 200K+ rows), so we cache them in-process with a short
 * TTL. This collapses "5 heavy counts on every page load for every user" down
 * to "5 counts at most once per TTL per warm instance." Per-user counts stay
 * live (they're tiny and indexed by userId).
 */
type GlobalCounts = {
  total: number;
  grants: number;
  sbir: number;
  personal: number;
  closingSoon: number;
};

const GLOBAL_TTL_MS = 10 * 60 * 1000; // 10 minutes
let globalCache: { data: GlobalCounts; expires: number } | null = null;

async function getGlobalCounts(): Promise<GlobalCounts> {
  if (globalCache && globalCache.expires > Date.now()) {
    return globalCache.data;
  }

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const todayStr = now.toISOString().split("T")[0];
  const weekStr = weekFromNow.toISOString().split("T")[0];

  const [totalResult, bizGrantsResult, sbirResult, personalResult, closingSoonResult] =
    await Promise.all([
      // Total opportunities (open only)
      db.select({ count: count() }).from(opportunities).where(openOnly),
      // Business grants: type grant + audience business/both
      db
        .select({ count: count() })
        .from(opportunities)
        .where(
          and(
            inArray(opportunities.type, ["grant", "foundation", "scholarship"]),
            inArray(opportunities.audience, ["business", "both"]),
            openOnly
          )
        ),
      // SBIR/STTR count
      db
        .select({ count: count() })
        .from(opportunities)
        .where(and(inArray(opportunities.type, ["sbir", "sttr"]), openOnly)),
      // Personal grants: audience personal/both
      db
        .select({ count: count() })
        .from(opportunities)
        .where(
          and(inArray(opportunities.audience, ["personal", "both"]), openOnly)
        ),
      // Closing within 7 days
      db
        .select({ count: count() })
        .from(opportunities)
        .where(
          and(
            gte(opportunities.deadline, todayStr),
            sql`${opportunities.deadline} <= ${weekStr}`,
            openOnly
          )
        ),
    ]);

  const data: GlobalCounts = {
    total: totalResult[0]?.count || 0,
    grants: bizGrantsResult[0]?.count || 0,
    sbir: sbirResult[0]?.count || 0,
    personal: personalResult[0]?.count || 0,
    closingSoon: closingSoonResult[0]?.count || 0,
  };
  globalCache = { data, expires: Date.now() + GLOBAL_TTL_MS };
  return data;
}

export async function GET() {
  const userId = await requireAuth();

  // Global counts (cached) + per-user counts (live) in parallel.
  const [global, savedResult, appsResult, matchesResult] = await Promise.all([
    getGlobalCounts(),
    db
      .select({ count: count() })
      .from(savedOpportunities)
      .where(eq(savedOpportunities.userId, userId)),
    db
      .select({ count: count() })
      .from(applications)
      .where(eq(applications.userId, userId)),
    db
      .select({ count: count() })
      .from(aiMatches)
      .where(eq(aiMatches.userId, userId)),
  ]);

  return Response.json({
    total: global.total,
    grants: global.grants,
    sbir: global.sbir,
    personal: global.personal,
    closingSoon: global.closingSoon,
    saved: savedResult[0]?.count || 0,
    applications: appsResult[0]?.count || 0,
    matches: matchesResult[0]?.count || 0,
  });
}
