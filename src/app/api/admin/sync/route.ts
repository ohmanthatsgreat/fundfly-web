import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, opportunities } from "@/lib/db";
import { sql } from "drizzle-orm";
import { syncZeffy, enrichZeffyGrants } from "@/lib/ingest-zeffy";
import { syncGrantsGov, syncSbirGov, syncSamGov } from "@/lib/ingest-gov";

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
    samGov: 0,
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

  try {
    results.samGov = await syncSamGov();
  } catch (err) {
    results.errors.push(`SAM.gov: ${String(err)}`);
  }

  try {
    results.zeffy = await syncZeffy();
  } catch (err) {
    results.errors.push(`Zeffy: ${String(err)}`);
  }

  // Enrich unenriched Zeffy grants (scrape detail pages)
  try {
    results.zeffyEnrichment = await enrichZeffyGrants(15);
  } catch (err) {
    results.errors.push(`Zeffy enrichment: ${String(err)}`);
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
