/**
 * Standalone sync script — runs locally with no auth or timeout.
 * Connects directly to Neon and populates opportunities from Grants.gov.
 *
 * Usage: npx tsx --env-file=.env.local scripts/sync-data.ts
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const client = neon(process.env.DATABASE_URL!);
const db = drizzle(client, { schema });
const { opportunities } = schema;

// ─── Grants.gov sync ────────────────────────────────────────────────

async function syncGrantsGov(): Promise<number> {
  console.log("  Fetching Grants.gov (all records in one request)...");

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

  if (!res.ok) {
    console.log(`    Grants.gov returned ${res.status}`);
    return 0;
  }

  const data = await res.json();
  const items = data.oppHits || [];
  console.log(`    Got ${items.length} records (hitCount: ${data.hitCount})`);

  let inserted = 0;
  for (const item of items) {
    const val = {
      id: `grants_gov_${item.id}`,
      source: "grants.gov" as const,
      sourceUrl: `https://www.grants.gov/search-results-detail/${item.number || item.id}`,
      title: String(item.title || ""),
      description: String(item.synopsis || item.description || ""),
      agency: String(item.agency || item.agencyCode || ""),
      subAgency: "",
      type: "grant" as const,
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
      inserted++;
    } catch (err) {
      // Skip individual failures
    }

    if (inserted % 100 === 0) {
      process.stdout.write(`    ${inserted}/${items.length} inserted...\r`);
    }
  }

  console.log(`    Grants.gov: ${inserted} opportunities synced`);
  return inserted;
}

// ─── SBIR.gov sync via SAM.gov ──────────────────────────────────────
// SBIR.gov API is down; use SAM.gov opportunities API for SBIR/STTR

async function syncSbirViaSam(): Promise<number> {
  console.log("  Fetching SBIR/STTR from SAM.gov...");
  let total = 0;
  let offset = 0;
  const limit = 100;

  while (true) {
    // SAM.gov Opportunities API - filter for SBIR/STTR funding instruments
    const url = `https://api.sam.gov/opportunities/v2/search?api_key=DEMO_KEY&postedFrom=01/01/2025&postedTo=12/31/2025&limit=${limit}&offset=${offset}&ncode=o&ptype=k,r`;

    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      console.log("    SAM.gov API unreachable");
      break;
    }

    if (!res.ok) {
      console.log(`    SAM.gov returned ${res.status}`);
      break;
    }

    const data = await res.json();
    const items = data.opportunitiesData || [];
    if (items.length === 0) break;

    for (const item of items) {
      const isSbir =
        String(item.title || "").toLowerCase().includes("sbir") ||
        String(item.description || "").toLowerCase().includes("sbir");
      const isSttr =
        String(item.title || "").toLowerCase().includes("sttr") ||
        String(item.description || "").toLowerCase().includes("sttr");

      // Only include if it's clearly SBIR or STTR
      if (!isSbir && !isSttr) continue;

      const val = {
        id: `sam_gov_${item.noticeId || item.solicitationNumber || total}`,
        source: "sbir.gov",
        sourceUrl: item.uiLink || "",
        title: String(item.title || ""),
        description: String(item.description || "").substring(0, 5000),
        agency: String(item.fullParentPathName || item.department || ""),
        type: isSttr ? "sttr" : "sbir",
        deadline: item.responseDeadLine || item.archiveDate || null,
        postedDate: item.postedDate || null,
        status: "open",
        audience: "business",
        grantUrl: item.uiLink || "",
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
        // skip
      }
    }

    offset += limit;
    process.stdout.write(`    ${total} SBIR/STTR found so far (scanned ${offset} SAM records)...\r`);

    // Cap at 1000 SAM.gov records scanned
    if (offset >= 1000) break;
  }

  console.log(`    SBIR/STTR via SAM.gov: ${total} opportunities synced`);
  return total;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("Starting data sync...\n");

  let grantsGovCount = 0;
  let sbirCount = 0;

  try {
    grantsGovCount = await syncGrantsGov();
  } catch (err) {
    console.error("  Grants.gov error:", err);
  }

  try {
    sbirCount = await syncSbirViaSam();
  } catch (err) {
    console.error("  SBIR/SAM.gov error:", err);
  }

  // Get total
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(opportunities);

  console.log(`\n=== Sync Complete ===`);
  console.log(`  Grants.gov: ${grantsGovCount}`);
  console.log(`  SBIR/STTR:  ${sbirCount}`);
  console.log(`  Total in DB: ${count}`);
}

main().catch(console.error);
