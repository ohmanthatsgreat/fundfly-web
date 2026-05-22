import { db, opportunities } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { eq, ne, and, sql, desc } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAuth();
  const { id } = await params;

  const [opp] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, id))
    .limit(1);

  if (!opp) {
    return Response.json({ similar: [] });
  }

  // Build a relevance score using SQL CASE expressions
  const scoreParts: string[] = [];
  const values: unknown[] = [];

  if (opp.agency) {
    scoreParts.push(`CASE WHEN ${opportunities.agency.name} = $${values.length + 1} THEN 3 ELSE 0 END`);
    values.push(opp.agency);
  }

  if (opp.type) {
    scoreParts.push(`CASE WHEN ${opportunities.type.name} = $${values.length + 1} THEN 2 ELSE 0 END`);
    values.push(opp.type);
  }

  if (opp.audience) {
    scoreParts.push(`CASE WHEN ${opportunities.audience.name} = $${values.length + 1} THEN 1 ELSE 0 END`);
    values.push(opp.audience);
  }

  if (scoreParts.length === 0) {
    return Response.json({ similar: [] });
  }

  // Simple approach: find opportunities with same agency or type, ranked by match
  const similar = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      agency: opportunities.agency,
      type: opportunities.type,
      fundingMax: opportunities.fundingMax,
      deadline: opportunities.deadline,
      sourceUrl: opportunities.sourceUrl,
    })
    .from(opportunities)
    .where(
      and(
        ne(opportunities.id, id),
        sql`(${opportunities.agency} = ${opp.agency} OR ${opportunities.type} = ${opp.type})`
      )
    )
    .orderBy(
      // Prefer same agency + same type
      desc(
        sql`(CASE WHEN ${opportunities.agency} = ${opp.agency} THEN 3 ELSE 0 END) + (CASE WHEN ${opportunities.type} = ${opp.type} THEN 2 ELSE 0 END)`
      )
    )
    .limit(5);

  return Response.json({ similar });
}
