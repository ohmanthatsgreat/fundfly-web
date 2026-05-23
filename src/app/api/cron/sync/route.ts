import { NextRequest } from "next/server";
import { db, opportunities } from "@/lib/db";
import { sql } from "drizzle-orm";
import { syncZeffy, enrichZeffyGrants } from "@/lib/ingest-zeffy";

// ─── Grants.gov sync ────────────────────────────────────────────────

async function syncGrantsGov(): Promise<number> {
  const res = await fetch(
    "https://apply07.grants.gov/grantsws/rest/opportunities/search/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oppStatuses: "forecasted|posted",
        rows: 10000,
      }),
    }
  );

  if (!res.ok) return 0;
  const data = await res.json();
  const items = data.oppHits || [];
  if (items.length === 0) return 0;

  let total = 0;
  for (const item of items as Record<string, unknown>[]) {
    const val = {
      id: `grants_gov_${item.id}`,
      source: "grants.gov",
      sourceUrl: `https://www.grants.gov/search-results-detail/${item.number || item.id}`,
      title: String(item.title || ""),
      description: String(item.synopsis || item.description || ""),
      agency: String(item.agency || item.agencyCode || ""),
      subAgency: "",
      type: "grant",
      fundingMin: item.awardFloor ? Number(item.awardFloor) : null,
      fundingMax: item.awardCeiling ? Number(item.awardCeiling) : null,
      deadline: item.closeDate ? String(item.closeDate) : null,
      postedDate: item.openDate ? String(item.openDate) : null,
      status: String(item.oppStatus || "open").toLowerCase().includes("forecast")
        ? "forecasted"
        : "open",
      audience: "business",
      grantUrl: `https://www.grants.gov/search-results-detail/${item.number || item.id}`,
      rawJson: JSON.stringify(item),
    };

    try {
      await db
        .insert(opportunities)
        .values(val)
        .onConflictDoUpdate({
          target: opportunities.id,
          set: {
            title: val.title,
            description: val.description,
            agency: val.agency,
            fundingMin: val.fundingMin,
            fundingMax: val.fundingMax,
            deadline: val.deadline,
            status: val.status,
            updatedAt: new Date(),
          },
        });
      total++;
    } catch {
      // Skip individual failures
    }
  }

  return total;
}

// ─── SBIR.gov sync ──────────────────────────────────────────────────

async function syncSbirGov(): Promise<number> {
  const res = await fetch(
    "https://apply07.grants.gov/grantsws/rest/opportunities/search/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oppStatuses: "forecasted|posted",
        rows: 10000,
        keyword: "SBIR STTR",
      }),
    }
  );

  if (!res.ok) return 0;
  const data = await res.json();
  const items = data.oppHits || [];
  if (items.length === 0) return 0;

  let total = 0;
  for (const item of items as Record<string, unknown>[]) {
    const titleLower = String(item.title || "").toLowerCase();
    const isSttr = titleLower.includes("sttr");

    const val = {
      id: `sbir_grants_gov_${item.id}`,
      source: "sbir.gov",
      sourceUrl: `https://www.grants.gov/search-results-detail/${item.number || item.id}`,
      title: String(item.title || ""),
      description: String(item.synopsis || item.description || ""),
      agency: String(item.agency || item.agencyCode || ""),
      type: isSttr ? "sttr" : "sbir",
      deadline: item.closeDate ? String(item.closeDate) : null,
      postedDate: item.openDate ? String(item.openDate) : null,
      status: "open",
      audience: "business",
      grantUrl: `https://www.grants.gov/search-results-detail/${item.number || item.id}`,
      rawJson: JSON.stringify(item),
    };

    try {
      await db
        .insert(opportunities)
        .values(val)
        .onConflictDoUpdate({
          target: opportunities.id,
          set: {
            title: val.title,
            description: val.description,
            agency: val.agency,
            deadline: val.deadline,
            status: val.status,
            updatedAt: new Date(),
          },
        });
      total++;
    } catch {
      // Skip individual failures
    }
  }

  return total;
}

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
    zeffy: { total: 0, inserted: 0, categories: [] as string[] },
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
    results.zeffy = await syncZeffy();
  } catch (err) {
    results.errors.push(`Zeffy: ${String(err)}`);
  }

  try {
    results.zeffyEnrichment = await enrichZeffyGrants(15);
  } catch (err) {
    results.errors.push(`Zeffy enrichment: ${String(err)}`);
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(opportunities);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(
    `[cron/sync] Completed in ${duration}s — Grants.gov: ${results.grantsGov}, SBIR: ${results.sbirGov}, Zeffy: ${results.zeffy.inserted} new (${results.zeffy.categories.join(", ")}), Enriched: ${results.zeffyEnrichment.enriched}, Total: ${count}`
  );

  return Response.json({
    ok: true,
    synced: results,
    totalOpportunities: count,
    durationSeconds: duration,
  });
}
