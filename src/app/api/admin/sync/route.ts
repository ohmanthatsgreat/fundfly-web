import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, opportunities } from "@/lib/db";
import { sql } from "drizzle-orm";

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
  let total = 0;
  let startRecord = 0;
  const rows = 250;

  while (true) {
    const res = await fetch(
      "https://apply07.grants.gov/grantsws/rest/opportunities/search/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oppStatuses: "forecasted|posted",
          rows,
          startRecord,
        }),
      }
    );

    if (!res.ok) break;
    const data = await res.json();
    const items = data.oppHits || [];
    if (items.length === 0) break;

    const values = items.map((item: Record<string, unknown>) => ({
      id: `grants_gov_${item.id || item.oppNumber}`,
      source: "grants.gov",
      sourceUrl: `https://www.grants.gov/search-results-detail/${item.oppNumber || item.id}`,
      title: String(item.title || ""),
      description: String(item.synopsis || item.description || ""),
      agency: String(item.agency || item.agencyName || ""),
      subAgency: String(item.subAgency || ""),
      type: "grant",
      fundingMin: item.awardFloor ? Number(item.awardFloor) : null,
      fundingMax: item.awardCeiling ? Number(item.awardCeiling) : null,
      deadline: item.closeDate ? String(item.closeDate) : null,
      postedDate: item.openDate ? String(item.openDate) : null,
      status: String(item.oppStatus || "open").toLowerCase().includes("forecast")
        ? "forecasted"
        : "open",
      audience: "business",
      grantUrl: `https://www.grants.gov/search-results-detail/${item.oppNumber || item.id}`,
      rawJson: JSON.stringify(item),
    }));

    for (const val of values) {
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
    }

    total += items.length;
    startRecord += rows;

    // Safety limit
    if (startRecord >= 35000) break;
  }

  return total;
}

// ─── SBIR.gov sync ──────────────────────────────────────────────────

async function syncSbirGov(): Promise<number> {
  let total = 0;
  let start = 0;
  const rows = 250;

  while (true) {
    const res = await fetch(
      `https://www.sbir.gov/api/solicitations.json?rows=${rows}&start=${start}`
    );
    if (!res.ok) break;
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) break;

    const values = items.map((item: Record<string, unknown>) => ({
      id: `sbir_gov_${item.id || item.solicitation_id}`,
      source: "sbir.gov",
      sourceUrl: String(item.url || item.solicitation_url || ""),
      title: String(item.title || item.solicitation_title || ""),
      description: String(
        item.description || item.abstract || item.solicitation_topics || ""
      ),
      agency: String(item.agency || ""),
      type: String(item.type || "sbir").toLowerCase().includes("sttr")
        ? "sttr"
        : "sbir",
      deadline: item.close_date ? String(item.close_date) : null,
      postedDate: item.open_date ? String(item.open_date) : null,
      status: "open",
      audience: "business",
      grantUrl: String(item.url || item.solicitation_url || ""),
      rawJson: JSON.stringify(item),
    }));

    for (const val of values) {
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
    }

    total += items.length;
    start += rows;

    if (start >= 5000) break;
  }

  return total;
}

// ─── Handler ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const results = {
    grantsGov: 0,
    sbirGov: 0,
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

  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(opportunities);

  return Response.json({
    success: true,
    synced: results,
    totalOpportunities: count,
  });
}
