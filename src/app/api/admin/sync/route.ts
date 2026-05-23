import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, opportunities } from "@/lib/db";
import { sql } from "drizzle-orm";
import { syncZeffy, enrichZeffyGrants } from "@/lib/ingest-zeffy";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "").split(",").filter(Boolean);

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId || !ADMIN_USER_IDS.includes(userId)) {
    throw new Error("Forbidden");
  }
  return userId;
}

// ─── Grants.gov sync ────────────────────────────────────────────────

async function syncGrantsGov(): Promise<number> {
  // Grants.gov API pagination is broken — fetch all records in a single request
  const res = await fetch(
    "https://apply07.grants.gov/grantsws/rest/opportunities/search/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oppStatuses: "forecasted|posted",
        rows: 10000, // API returns max ~2000 results
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
  // SBIR.gov API is currently returning 404; use Grants.gov SBIR/STTR
  // filter as an alternative source
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
