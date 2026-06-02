import { NextRequest } from "next/server";
import { db, opportunities, dismissedOpportunities } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sql, eq, and, or, ilike, inArray, gte, lte, asc, desc, notInArray, count, type SQL } from "drizzle-orm";

/**
 * Pagination total is a COUNT over the 200K+ opportunities table — the slow
 * part of this endpoint. The count depends only on the filter set (NOT the
 * page/offset), so we cache it keyed by the full count-affecting signature
 * with a short TTL. Effect: only page 1 of a given filter computes the count;
 * subsequent pages, category revisits, and repeated searches are instant.
 * Counts only move every 4h (sync cron), so a few minutes of staleness is fine.
 */
const COUNT_TTL_MS = 5 * 60 * 1000;
const countCache = new Map<string, { count: number; expires: number }>();

async function getCachedCount(key: string, where: SQL | undefined): Promise<number> {
  const hit = countCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.count;

  const res = await db.select({ count: count() }).from(opportunities).where(where);
  const total = res[0]?.count || 0;

  // Bound memory: clear if the cache grows large (many distinct searches).
  if (countCache.size > 500) countCache.clear();
  countCache.set(key, { count: total, expires: Date.now() + COUNT_TTL_MS });
  return total;
}

export async function GET(request: NextRequest) {
  const userId = await requireAuth();
  const params = request.nextUrl.searchParams;

  const page = parseInt(params.get("page") || "1");
  const limit = Math.min(parseInt(params.get("limit") || "25"), 100);
  const offset = (page - 1) * limit;
  const search = params.get("search") || "";
  const sort = params.get("sort") || "deadline_asc";
  const typeFilter = params.get("type")?.split(",").filter(Boolean);
  const audienceFilter = params.get("audience")?.split(",").filter(Boolean);
  const fundingMin = params.get("fundingMin");
  const fundingMax = params.get("fundingMax");

  // Get dismissed IDs for this user
  const dismissed = await db
    .select({ id: dismissedOpportunities.opportunityId })
    .from(dismissedOpportunities)
    .where(eq(dismissedOpportunities.userId, userId));
  const dismissedIds = dismissed.map((d) => d.id);

  const conditions = [];

  if (dismissedIds.length > 0) {
    conditions.push(notInArray(opportunities.id, dismissedIds));
  }

  if (search) {
    conditions.push(
      or(
        ilike(opportunities.title, `%${search}%`),
        ilike(opportunities.agency, `%${search}%`),
        ilike(opportunities.description, `%${search}%`)
      )
    );
  }

  if (typeFilter && typeFilter.length > 0) {
    conditions.push(inArray(opportunities.type, typeFilter));
  }

  if (audienceFilter && audienceFilter.length > 0) {
    conditions.push(inArray(opportunities.audience, audienceFilter));
  }

  if (fundingMin) {
    conditions.push(gte(opportunities.fundingMax, parseInt(fundingMin)));
  }

  if (fundingMax) {
    conditions.push(lte(opportunities.fundingMin, parseInt(fundingMax)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Cache key = everything that affects the COUNT (filters + this user's
  // dismissed set), but NOT page/offset/sort (which don't change the total).
  const countKey = JSON.stringify({
    search,
    type: typeFilter ?? null,
    audience: audienceFilter ?? null,
    fundingMin: fundingMin ?? null,
    fundingMax: fundingMax ?? null,
    dismissed: dismissedIds.slice().sort(),
  });

  // Sort
  let orderBy;
  switch (sort) {
    case "deadline_desc":
      orderBy = desc(opportunities.deadline);
      break;
    case "posted_desc":
      orderBy = desc(opportunities.postedDate);
      break;
    case "funding_desc":
      orderBy = desc(opportunities.fundingMax);
      break;
    case "funding_asc":
      orderBy = asc(opportunities.fundingMin);
      break;
    default:
      orderBy = asc(opportunities.deadline);
  }

  const [results, total] = await Promise.all([
    db
      .select()
      .from(opportunities)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    getCachedCount(countKey, where),
  ]);

  return Response.json({
    opportunities: results,
    total,
    page,
    limit,
  });
}
