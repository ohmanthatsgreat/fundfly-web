import { db, opportunities } from "@/lib/db";

/** Decode HTML entities (&amp; &rsquo; &#39; etc.) in ingested text */
export function decodeEntities(str: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
    "&apos;": "'", "&rsquo;": "’", "&lsquo;": "‘",
    "&rdquo;": "”", "&ldquo;": "“", "&ndash;": "–",
    "&mdash;": "—", "&nbsp;": " ", "&hellip;": "…",
    "&trade;": "™", "&reg;": "®", "&copy;": "©",
  };
  return str
    .replace(/&[a-zA-Z]+;/g, (m) => entities[m] || m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// ─── Grants.gov sync (paginated) ────────────────────────────────────

export async function syncGrantsGov(): Promise<number> {
  const PAGE_SIZE = 10000;
  let total = 0;
  let startRecord = 1;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(
      "https://apply07.grants.gov/grantsws/rest/opportunities/search/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oppStatuses: "forecasted|posted",
          rows: PAGE_SIZE,
          startRecordNum: startRecord,
        }),
      }
    );

    if (!res.ok) break;
    const data = await res.json();
    const items = data.oppHits || [];
    if (items.length === 0) break;

    for (const item of items as Record<string, unknown>[]) {
      const val = {
        id: `grants_gov_${item.id}`,
        source: "grants.gov",
        sourceUrl: `https://simpler.grants.gov/opportunity/${item.id}`,
        title: decodeEntities(String(item.title || "")),
        description: decodeEntities(String(item.synopsis || item.description || "")),
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
        grantUrl: `https://simpler.grants.gov/opportunity/${item.id}`,
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

    startRecord += items.length;
    // Stop if we got fewer than requested (last page) or hit 50K safety cap
    hasMore = items.length >= PAGE_SIZE && startRecord < 50000;
  }

  return total;
}

// ─── SBIR.gov sync ──────────────────────────────────────────────────

export async function syncSbirGov(): Promise<number> {
  // SBIR.gov's own API returns 404; use the Grants.gov SBIR/STTR keyword
  // filter as the source instead.
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
      sourceUrl: `https://simpler.grants.gov/opportunity/${item.id}`,
      title: decodeEntities(String(item.title || "")),
      description: decodeEntities(String(item.synopsis || item.description || "")),
      agency: String(item.agency || item.agencyCode || ""),
      type: isSttr ? "sttr" : "sbir",
      deadline: item.closeDate ? String(item.closeDate) : null,
      postedDate: item.openDate ? String(item.openDate) : null,
      status: "open",
      audience: "business",
      grantUrl: `https://simpler.grants.gov/opportunity/${item.id}`,
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

// ─── SAM.gov sync (federal contract opportunities) ──────────────────
// This is SAM.gov's Contract Opportunities API — procurement notices
// (solicitations), NOT grants/financial assistance. Rows are tagged
// type "contract" so they only surface in the Federal Contracts matcher,
// never in the grant-focused browse/match flows.

function getDateMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().split("T")[0].replace(/-/g, "/");
}

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0].replace(/-/g, "/");
}

export async function syncSamGov(): Promise<number> {
  const SAM_API_KEY = process.env.SAM_GOV_API_KEY;
  if (!SAM_API_KEY) return 0;

  let total = 0;
  let page = 0;
  let hasMore = true;

  while (hasMore && page < 20) {
    const url = new URL("https://api.sam.gov/opportunities/v2/search");
    url.searchParams.set("api_key", SAM_API_KEY);
    url.searchParams.set("postedFrom", getDateMonthsAgo(6));
    url.searchParams.set("postedTo", getTodayDate());
    url.searchParams.set("limit", "1000");
    url.searchParams.set("offset", String(page * 1000));
    url.searchParams.set("ptype", "o,k"); // Solicitation + Combined Synopsis/Solicitation

    try {
      const res = await fetch(url.toString());
      if (!res.ok) break;
      const data = await res.json();
      const items = data.opportunitiesData || [];
      if (items.length === 0) break;

      for (const item of items as Record<string, unknown>[]) {
        const val = {
          id: `sam_gov_${item.noticeId}`,
          source: "sam.gov",
          sourceUrl: `https://sam.gov/opp/${item.noticeId}/view`,
          title: decodeEntities(String(item.title || "")),
          description: decodeEntities(String(item.description || "")),
          agency: String(
            (item.department as Record<string, unknown>)?.name ||
            item.organizationType || ""
          ),
          type: "contract",
          fundingMin: (item.award as Record<string, unknown> | undefined)?.floor
            ? Number((item.award as Record<string, unknown>).floor)
            : null,
          fundingMax: (item.award as Record<string, unknown> | undefined)?.ceiling
            ? Number((item.award as Record<string, unknown>).ceiling)
            : null,
          deadline: item.responseDeadLine ? String(item.responseDeadLine) : null,
          postedDate: item.postedDate ? String(item.postedDate) : null,
          status: "open",
          audience: "business",
          grantUrl: `https://sam.gov/opp/${item.noticeId}/view`,
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
          // Skip
        }
      }

      page++;
      hasMore = items.length >= 1000;
    } catch {
      break;
    }
  }

  return total;
}
