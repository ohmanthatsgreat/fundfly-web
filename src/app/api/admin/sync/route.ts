import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, opportunities } from "@/lib/db";
import { sql } from "drizzle-orm";
import { syncZeffy } from "@/lib/ingest-zeffy";
import { syncGrantsGov, syncSbirGov } from "@/lib/ingest-gov";

// Zeffy deepening fans out into many Algolia queries + batched upserts; give
// the function room. Vercel Pro caps at 300s.
export const maxDuration = 300;

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "").split(",").filter(Boolean);

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId || !ADMIN_USER_IDS.includes(userId)) {
    throw new Error("Forbidden");
  }
  return userId;
}

// ─── Handler ────────────────────────────────────────────────────────

// GET — return opportunity counts by source (no sync triggered)
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(opportunities);

  const bySource = await db
    .select({
      source: opportunities.source,
      count: sql<number>`count(*)`,
    })
    .from(opportunities)
    .groupBy(opportunities.source);

  return Response.json({
    totalOpportunities: Number(count),
    bySource: bySource.map((r) => ({
      source: r.source,
      count: Number(r.count),
    })),
  });
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const startTime = Date.now();

  const results = {
    grantsGov: 0,
    sbirGov: 0,
    zeffy: { total: 0, inserted: 0, updated: 0, categories: [] as string[] },
    zeffyEnrichment: { enriched: 0, failed: 0 },
    errors: [] as string[],
  };

  try {
    results.grantsGov = await syncGrantsGov();
  } catch (err) {
    results.errors.push(`Grants.gov: ${String(err)}`);
  }

  try {
    results.sbirGov = await syncSbirGov();
  } catch (err) {
    results.errors.push(`SBIR.gov: ${String(err)}`);
  }

  // SAM.gov (federal contracts) sync is disabled for now — the Federal
  // Contracts feature was removed pending a revisit. Re-enable syncSamGov here
  // and restore the matcher/tab when bringing contracts back.

  // Manual button = fast data-pull only. The heavy AI audience-classify and
  // the detail-page enrichment are skipped here (they made this request time
  // out → the "Network error" you saw). The 4-hourly cron runs the full job
  // including classify + enrich, so nothing is lost — just deferred.
  try {
    results.zeffy = await syncZeffy({ classify: false });
  } catch (err) {
    results.errors.push(`Zeffy: ${String(err)}`);
  }

  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(opportunities);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  return Response.json({
    success: true,
    synced: results,
    totalOpportunities: count,
    durationSeconds: duration,
  });
}
