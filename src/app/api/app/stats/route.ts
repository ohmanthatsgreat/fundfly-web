import { db, opportunities, savedOpportunities, applications } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sql, eq, and, gte, inArray, count } from "drizzle-orm";

export async function GET() {
  const userId = await requireAuth();

  // Calculate date 7 days from now for "closing soon"
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const todayStr = now.toISOString().split("T")[0];
  const weekStr = weekFromNow.toISOString().split("T")[0];

  const [totalResult, bizGrantsResult, sbirResult, personalResult, savedResult, appsResult, closingSoonResult] =
    await Promise.all([
      // Total opportunities
      db.select({ count: count() }).from(opportunities),
      // Business grants: type grant + audience business/both
      db
        .select({ count: count() })
        .from(opportunities)
        .where(
          and(
            inArray(opportunities.type, ["grant", "foundation", "scholarship"]),
            inArray(opportunities.audience, ["business", "both"])
          )
        ),
      // SBIR/STTR count
      db
        .select({ count: count() })
        .from(opportunities)
        .where(inArray(opportunities.type, ["sbir", "sttr"])),
      // Personal grants: audience personal/both
      db
        .select({ count: count() })
        .from(opportunities)
        .where(inArray(opportunities.audience, ["personal", "both"])),
      // Saved count for this user
      db
        .select({ count: count() })
        .from(savedOpportunities)
        .where(eq(savedOpportunities.userId, userId)),
      // Applications count for this user
      db
        .select({ count: count() })
        .from(applications)
        .where(eq(applications.userId, userId)),
      // Closing within 7 days
      db
        .select({ count: count() })
        .from(opportunities)
        .where(
          and(
            gte(opportunities.deadline, todayStr),
            sql`${opportunities.deadline} <= ${weekStr}`
          )
        ),
    ]);

  return Response.json({
    total: totalResult[0]?.count || 0,
    grants: bizGrantsResult[0]?.count || 0,
    sbir: sbirResult[0]?.count || 0,
    personal: personalResult[0]?.count || 0,
    saved: savedResult[0]?.count || 0,
    applications: appsResult[0]?.count || 0,
    closingSoon: closingSoonResult[0]?.count || 0,
  });
}
