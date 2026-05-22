import { NextRequest } from "next/server";
import { db, opportunities, dismissedOpportunities } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sql, eq, and, or, ilike, inArray, gte, lte, asc, desc, notInArray, count } from "drizzle-orm";

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

  const [results, totalResult] = await Promise.all([
    db
      .select()
      .from(opportunities)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(opportunities).where(where),
  ]);

  return Response.json({
    opportunities: results,
    total: totalResult[0]?.count || 0,
    page,
    limit,
  });
}
