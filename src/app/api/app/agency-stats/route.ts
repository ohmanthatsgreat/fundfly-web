import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";

const CACHE = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

const PARENT_AGENCY: Record<string, string> = {
  "National Park Service": "Department of the Interior",
  "Fish and Wildlife Service": "Department of the Interior",
  "Bureau of Land Management": "Department of the Interior",
  "Bureau of Reclamation": "Department of the Interior",
  "Bureau of Indian Affairs": "Department of the Interior",
  "National Institutes of Health": "Department of Health and Human Services",
  "Centers for Disease Control and Prevention": "Department of Health and Human Services",
  "Administration for Children and Families": "Department of Health and Human Services",
  "Health Resources and Services Administration": "Department of Health and Human Services",
  "National Science Foundation": "National Science Foundation",
  "National Aeronautics and Space Administration": "National Aeronautics and Space Administration",
  "Environmental Protection Agency": "Environmental Protection Agency",
  "Office of Elementary and Secondary Education": "Department of Education",
  "Office of Postsecondary Education": "Department of Education",
  "National Institute of Food and Agriculture": "Department of Agriculture",
  "Forest Service": "Department of Agriculture",
  "Federal Highway Administration": "Department of Transportation",
  "Federal Transit Administration": "Department of Transportation",
  "Office of Justice Programs": "Department of Justice",
  "Federal Emergency Management Agency": "Department of Homeland Security",
  "Office of Energy Efficiency and Renewable Energy": "Department of Energy",
};

type SpendingResult = {
  agency: string;
  fiscal_years: { fiscal_year: string; grant_obligations: number }[];
  total_grant_obligations: number;
  avg_annual_grant_spending: number;
};

async function fetchUSASpending(agency: string): Promise<SpendingResult | null> {
  const cacheKey = agency.toLowerCase();
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data as SpendingResult;
  }

  const currentYear = new Date().getFullYear();
  const fyStart = `${currentYear - 1}-10-01`;
  const fyEnd = `${currentYear}-09-30`;
  const prevFyStart = `${currentYear - 2}-10-01`;
  const prevFyEnd = `${currentYear - 1}-09-30`;

  const body = {
    group: "fiscal_year",
    filters: {
      agencies: [{ type: "awarding", tier: "toptier", name: agency }],
      award_type_codes: ["02", "03", "04", "05"],
      time_period: [
        { start_date: prevFyStart, end_date: prevFyEnd },
        { start_date: fyStart, end_date: fyEnd },
      ],
    },
  };

  try {
    const res = await fetch(
      "https://api.usaspending.gov/api/v2/search/spending_over_time/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const results = data.results || [];

    const years = results.map((r: Record<string, unknown>) => ({
      fiscal_year: (r.time_period as Record<string, string>).fiscal_year,
      grant_obligations: (r as Record<string, number>).aggregated_amount || 0,
    }));

    const totalObligated = years.reduce(
      (s: number, y: { grant_obligations: number }) => s + y.grant_obligations,
      0
    );
    const avgPerYear = years.length > 0 ? totalObligated / years.length : 0;

    const result: SpendingResult = {
      agency,
      fiscal_years: years,
      total_grant_obligations: totalObligated,
      avg_annual_grant_spending: avgPerYear,
    };

    CACHE.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  await requireAuth();

  const agency = req.nextUrl.searchParams.get("agency");
  if (!agency) {
    return Response.json({ error: "agency parameter required" }, { status: 400 });
  }

  try {
    let agencyToQuery = agency;
    let spending = await fetchUSASpending(agencyToQuery);

    if ((!spending || spending.avg_annual_grant_spending === 0) && PARENT_AGENCY[agency]) {
      agencyToQuery = PARENT_AGENCY[agency];
      spending = await fetchUSASpending(agencyToQuery);
    }

    if (!spending || spending.avg_annual_grant_spending === 0) {
      return Response.json({ stats: null });
    }

    return Response.json({ stats: spending });
  } catch {
    return Response.json({ error: "Failed to fetch agency stats", stats: null });
  }
}
