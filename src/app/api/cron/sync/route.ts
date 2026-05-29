import { NextRequest } from "next/server";
import { db, opportunities } from "@/lib/db";
import { sql } from "drizzle-orm";
import { syncZeffy, enrichZeffyGrants } from "@/lib/ingest-zeffy";
import { syncGrantsGov, syncSbirGov } from "@/lib/ingest-gov";

// Zeffy deepening fans out into many Algolia queries + batched upserts; give
// the function room. Vercel Pro caps at 300s.
export const maxDuration = 300;

// ─── Cron handler ───────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  const results = {
    grantsGov: 0,
    sbirGov: 0,
    zeffy: { total: 0, inserted: 0, updated: 0, categories: [] as string[], classified: 0 },
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

  try {
    results.zeffy = await syncZeffy();
  } catch (err) {
    results.errors.push(`Zeffy: ${String(err)}`);
  }

  try {
    results.zeffyEnrichment = await enrichZeffyGrants(25);
  } catch (err) {
    results.errors.push(`Zeffy enrichment: ${String(err)}`);
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(opportunities);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(
    `[cron/sync] Completed in ${duration}s — Grants.gov: ${results.grantsGov}, SBIR: ${results.sbirGov}, Zeffy: ${results.zeffy.inserted} new / ${results.zeffy.updated} updated (${results.zeffy.categories.join(", ")}), Audience-classified: ${results.zeffy.classified}, Enriched: ${results.zeffyEnrichment.enriched}, Total: ${count}`
  );

  return Response.json({
    ok: true,
    synced: results,
    totalOpportunities: count,
    durationSeconds: duration,
  });
}
