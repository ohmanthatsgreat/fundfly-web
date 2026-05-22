import { db, opportunities } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";

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
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ opportunity: opp });
}
