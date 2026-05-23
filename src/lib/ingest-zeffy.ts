import { db, opportunities, userSettings } from "@/lib/db";
import { eq, and, isNull, isNotNull, asc, sql } from "drizzle-orm";

const ALGOLIA_APP_ID = "22BX5DVBCL";
const ALGOLIA_API_KEY = "a0a1c9e5621d1c3dc6329a2381220782";
const ALGOLIA_INDEX = "grant-programs-v3";
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;
const ZEFFY_BASE = "https://www.zeffy.com/grant-programs";

// System user ID for storing sync state (not tied to any real user)
const SYSTEM_USER = "__system__";

type ZeffyHit = {
  objectID: string;
  slug: string;
  title: string;
  organizationName: string;
  organizationEin: string;
  organizationAccessibilityScore: number;
  organizationAccessibilityReasoning: string;
  averageAmount: number;
  medianAmount: number;
  minAmount: number;
  maxAmount: number;
  grantLineItemsCount: number;
  awardedAtYears: number[];
  lastAwardedAtYear: number;
  locationStates: string[];
  locationCities: string[];
  seoCategories: string[];
  lastAgentRunAt: string;
};

type AlgoliaResponse = {
  hits: ZeffyHit[];
  nbHits: number;
  page: number;
  nbPages: number;
  hitsPerPage: number;
};

type ZeffyDetail = {
  website: string | null;
  contactForm: string | null;
  contacts: { name: string | null; role: string; email: string | null; phone: string | null }[];
  instructions: string | null;
  signals: string[];
};

// ─── Algolia query ──────────────────────────────────────────────────

async function queryAlgolia(
  query: string,
  filters: string,
  page: number,
  hitsPerPage: number
): Promise<AlgoliaResponse> {
  const res = await fetch(ALGOLIA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-algolia-api-key": ALGOLIA_API_KEY,
      "x-algolia-application-id": ALGOLIA_APP_ID,
    },
    body: JSON.stringify({
      query,
      page,
      hitsPerPage,
      filters,
      attributesToRetrieve: [
        "slug", "title", "organizationName", "organizationEin",
        "organizationAccessibilityScore", "organizationAccessibilityReasoning",
        "averageAmount", "medianAmount", "minAmount", "maxAmount",
        "grantLineItemsCount", "awardedAtYears", "lastAwardedAtYear",
        "locationStates", "locationCities", "seoCategories", "lastAgentRunAt",
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Algolia error ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── Detail page scraping for enrichment ────────────────────────────

async function fetchZeffyDetail(slug: string): Promise<ZeffyDetail | null> {
  try {
    const res = await fetch(`${ZEFFY_BASE}/${slug}`, {
      headers: { Accept: "text/html" },
    });
    if (!res.ok) return null;

    const html = await res.text();

    const chunks = html.match(/self\.__next_f\.push\(\[1,"(.*?)"\]\)/g) || [];
    let dataText = "";
    for (const chunk of chunks) {
      const inner = chunk.slice('self.__next_f.push([1,"'.length, -'"])'.length);
      try {
        dataText += inner
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
            String.fromCharCode(parseInt(hex, 16))
          )
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      } catch {
        dataText += inner;
      }
    }

    const webMatch = dataText.match(/"website":\{"value":"(https?:\/\/[^"]+)"/);
    const formMatch = dataText.match(/"contactForm":"(https?:\/\/[^"]+)"/);

    const contacts: ZeffyDetail["contacts"] = [];
    const contactRegex =
      /\{"name":"?([^"]*?)"?,"role":"([^"]+)","email":"?([^"]*?)"?,"phone":"?([^"]*?)"?,"title"/g;
    let m;
    while ((m = contactRegex.exec(dataText)) !== null) {
      contacts.push({
        name: m[1] === "null" ? null : m[1] || null,
        role: m[2],
        email: m[3] === "null" ? null : m[3] || null,
        phone: m[4] === "null" ? null : m[4] || null,
      });
    }

    const instrMatch = dataText.match(/"applicationInstructions":\{"value":"([^"]+)"/);
    const filingInstrMatch = dataText.match(/APPLICATION[^"]{10,200}/);

    const signals: string[] = [];
    const sigMatch = dataText.match(/"signals":\[([^\]]+)\]/);
    if (sigMatch) {
      const sigItems = sigMatch[1].match(/"([^"]+)"/g);
      if (sigItems) signals.push(...sigItems.map((s) => s.replace(/^"|"$/g, "")));
    }

    return {
      website: webMatch?.[1] || null,
      contactForm: formMatch?.[1] || null,
      contacts,
      instructions: instrMatch?.[1] || filingInstrMatch?.[0] || null,
      signals,
    };
  } catch {
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function buildDescription(hit: ZeffyHit): string {
  const parts: string[] = [];

  const avgFmt = hit.averageAmount
    ? `$${Math.round(hit.averageAmount).toLocaleString()}`
    : null;
  const medFmt = hit.medianAmount
    ? `$${Math.round(hit.medianAmount).toLocaleString()}`
    : null;
  const minFmt = hit.minAmount
    ? `$${Math.round(hit.minAmount).toLocaleString()}`
    : null;
  const maxFmt = hit.maxAmount
    ? `$${Math.round(hit.maxAmount).toLocaleString()}`
    : null;

  if (avgFmt || medFmt) {
    const funding = [
      `Average: ${avgFmt}`,
      medFmt ? `Median: ${medFmt}` : null,
      `Range: ${minFmt || "N/A"} – ${maxFmt || "N/A"}`,
    ]
      .filter(Boolean)
      .join(" | ");
    parts.push(`Funding: ${funding}`);
  }

  if (hit.grantLineItemsCount) {
    parts.push(`${hit.grantLineItemsCount.toLocaleString()} grants awarded historically`);
  }

  if (hit.awardedAtYears?.length) {
    const years = hit.awardedAtYears.sort((a, b) => b - a);
    parts.push(`Active years: ${years.slice(0, 5).join(", ")}`);
  }

  if (hit.locationStates?.length && hit.locationStates.length <= 10) {
    parts.push(`States: ${hit.locationStates.join(", ")}`);
  } else if (hit.locationStates?.length > 10) {
    parts.push(`Active in ${hit.locationStates.length} states`);
  }

  if (hit.seoCategories?.length) {
    parts.push(`Categories: ${hit.seoCategories.join(", ")}`);
  }

  if (hit.organizationAccessibilityReasoning) {
    parts.push(hit.organizationAccessibilityReasoning);
  }

  return parts.join("\n\n");
}

function mapType(categories: string[]): string {
  if (!categories?.length) return "foundation";
  const joined = categories.join(" ").toLowerCase();
  if (joined.includes("education") || joined.includes("scholarship")) return "scholarship";
  return "foundation";
}

// ─── Upsert hits into PostgreSQL ────────────────────────────────────

async function upsertZeffy(hits: ZeffyHit[]): Promise<number> {
  let newCount = 0;

  for (const hit of hits) {
    const isRecent = hit.lastAwardedAtYear >= new Date().getFullYear() - 2;
    const id = `zeffy-${hit.objectID}`;

    try {
      const result = await db
        .insert(opportunities)
        .values({
          id,
          source: "zeffy",
          sourceUrl: null,
          title: hit.title,
          description: buildDescription(hit),
          agency: hit.organizationName || null,
          type: mapType(hit.seoCategories),
          fundingMin: hit.minAmount ? Math.round(hit.minAmount) : null,
          fundingMax: hit.maxAmount ? Math.round(hit.maxAmount) : null,
          deadline: null,
          postedDate: hit.lastAgentRunAt ? hit.lastAgentRunAt.split("T")[0] : null,
          status: isRecent ? "open" : "closed",
          audience: "both",
          location: hit.locationStates?.join(", ") || null,
          categories: hit.seoCategories?.join(", ") || null,
          grantUrl: `${ZEFFY_BASE}/${hit.slug}`,
          rawJson: JSON.stringify(hit),
        })
        .onConflictDoUpdate({
          target: opportunities.id,
          set: {
            title: hit.title,
            description: buildDescription(hit),
            agency: hit.organizationName || null,
            type: mapType(hit.seoCategories),
            fundingMin: hit.minAmount ? Math.round(hit.minAmount) : null,
            fundingMax: hit.maxAmount ? Math.round(hit.maxAmount) : null,
            status: isRecent ? "open" : "closed",
            audience: "both",
            location: hit.locationStates?.join(", ") || null,
            categories: hit.seoCategories?.join(", ") || null,
            grantUrl: `${ZEFFY_BASE}/${hit.slug}`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: opportunities.id });

      if (result.length > 0) newCount++;
    } catch {
      // Skip individual failures
    }
  }

  return newCount;
}

// ─── Sync index persistence ────────────────────────────────────────

async function getSyncIndex(): Promise<number> {
  const rows = await db
    .select({ value: userSettings.value })
    .from(userSettings)
    .where(
      and(
        eq(userSettings.userId, SYSTEM_USER),
        eq(userSettings.key, "zeffy_sync_index")
      )
    )
    .limit(1);
  return rows.length > 0 ? parseInt(rows[0].value, 10) : 0;
}

async function setSyncIndex(index: number): Promise<void> {
  await db
    .insert(userSettings)
    .values({
      userId: SYSTEM_USER,
      key: "zeffy_sync_index",
      value: String(index),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userSettings.userId, userSettings.key],
      set: {
        value: String(index),
        updatedAt: new Date(),
      },
    });
}

// ─── All 100 Zeffy categories ───────────────────────────────────────

const ALL_CATEGORIES = [
  "Education Nonprofits", "Health Charities", "Food Banks",
  "Youth Development Organizations", "Human Services", "Homeless Shelters",
  "Arts and Culture Nonprofits", "Community Centers",
  "Community and Economic Development Programs", "Environmental Conservation Groups",
  "Mental Health Organizations", "Religious and Faith-based Organizations",
  "Youth Development Programs", "Churches", "Affordable Housing Initiatives",
  "Jewish Organizations", "Community Service Clubs", "Food Insecurity Nonprofits",
  "Foster Care and Child Welfare Agencies", "Educational Foundations",
  "Food Pantries", "Social Justice Organizations", "Civil Rights Organizations",
  "Animal Shelters", "Conservation Groups", "Social Services",
  "Hospitals and Clinics", "Cancer Research Centers", "Women Empowerment Nonprofits",
  "Workforce Development Initiatives", "Universities and Colleges",
  "Health and Wellness Initiatives", "Veterans", "Domestic Violence Shelters",
  "Habitat for Humanity", "Cultural Heritage Nonprofits", "Disaster Response Teams",
  "Research Institutions", "Racial Justice Organizations", "Job Training Programs",
  "After-School Programs", "Disability Support Services", "Museums",
  "STEM Education Programs", "Literacy Programs", "Disease Research Institutions",
  "Historical Preservation Societies", "Disability Advocacy Organizations",
  "Cancer Support Groups", "International Relief Agencies",
  "Senior Assisted Living Facilities", "Financial Literacy Programs",
  "High Schools", "Refugee Support & Assistance Programs", "Music Nonprofits",
  "Autism Nonprofits", "Libraries", "Wildlife Conservation Centers",
  "Religious Educational Institutions", "Charter Schools",
  "Sports Teams, Leagues and Clubs", "Legal Aid Societies",
  "Mentoring Organizations", "Humane Society", "LGBTQ+ Advocacy Groups",
  "Theaters and Performing Arts Centers", "YMCA",
  "Substance Abuse Treatment Programs", "Addiction Recovery Programs",
  "Alzheimer's Support Groups", "Coastal Protection & Restoration", "Schools",
  "Victim Aid Services", "Dog Rescues", "LGBTQ+ Rights Organizations",
  "Voter Education Groups", "Ocean Conservation Organizations",
  "Wildlife Protection Organizations", "Science and Technology Nonprofits",
  "Volunteer Fire Departments", "Political Action Groups",
  "Crime Prevention Programs", "Dementia Support Groups", "Elementary Schools",
  "Women's Shelters", "Wildlife Rehabilitation", "Chronic Illness Support Groups",
  "Cat Rescues", "Native American Organizations", "Big Brother Big Sister",
  "Indigenous Agriculture Organizations", "Community Gardens",
  "Community Supported Agriculture Groups", "Workforce Development Nonprofits",
  "Environmental and Animal Welfare Nonprofits", "Equine Therapy Programs",
  "Civil Rights and Advocacy Groups", "Technology Access Initiatives",
  "Suicide Prevention Nonprofits", "Alumni Groups",
];

const CATEGORIES_PER_SYNC = 5;

// ─── Main sync function ────────────────────────────────────────────

export async function syncZeffy(): Promise<{
  total: number;
  inserted: number;
  categories: string[];
}> {
  let startIndex = await getSyncIndex();
  if (startIndex >= ALL_CATEGORIES.length) startIndex = 0;

  const endIndex = Math.min(startIndex + CATEGORIES_PER_SYNC, ALL_CATEGORIES.length);
  const batch = ALL_CATEGORIES.slice(startIndex, endIndex);

  let totalHits = 0;
  let totalInserted = 0;

  for (const category of batch) {
    const filters = `lastAwardedAtYear >= 2023 AND seoCategories:"${category}"`;
    const data = await queryAlgolia("", filters, 0, 1000);
    totalHits += data.nbHits;
    totalInserted += await upsertZeffy(data.hits);
  }

  // Save progress — next sync starts where this one ended
  const nextIndex = endIndex >= ALL_CATEGORIES.length ? 0 : endIndex;
  await setSyncIndex(nextIndex);

  return {
    total: totalHits,
    inserted: totalInserted,
    categories: batch,
  };
}

// ─── Enrichment function ────────────────────────────────────────────

export async function enrichZeffyGrants(
  batchSize = 25
): Promise<{ enriched: number; failed: number }> {
  const unenriched = await db
    .select({
      id: opportunities.id,
      grantUrl: opportunities.grantUrl,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.source, "zeffy"),
        isNull(opportunities.sourceUrl),
        isNotNull(opportunities.grantUrl)
      )
    )
    .orderBy(sql`${opportunities.fundingMax} DESC NULLS LAST`)
    .limit(batchSize);

  if (unenriched.length === 0) return { enriched: 0, failed: 0 };

  let enriched = 0;
  let failed = 0;

  for (const row of unenriched) {
    const slug = row.grantUrl!.split("/").pop()!;
    const detail = await fetchZeffyDetail(slug);

    if (!detail) {
      failed++;
      continue;
    }

    const foundationUrl = detail.website || detail.contactForm || null;

    const contactParts: string[] = [];
    const applyContact = detail.contacts.find((c) => c.role === "apply");
    const generalContact = detail.contacts.find((c) => c.role === "general");
    if (applyContact) {
      const parts = [applyContact.name, applyContact.phone, applyContact.email].filter(Boolean);
      if (parts.length) contactParts.push(`Apply: ${parts.join(" | ")}`);
    }
    if (generalContact) {
      const parts = [generalContact.name, generalContact.phone, generalContact.email].filter(Boolean);
      if (parts.length) contactParts.push(`Contact: ${parts.join(" | ")}`);
    }
    if (detail.instructions) contactParts.push(`Instructions: ${detail.instructions}`);
    const contactInfo = contactParts.join("\n") || null;

    const extraDesc: string[] = [];
    if (detail.signals.length) extraDesc.push(`Insights: ${detail.signals.join(". ")}`);
    if (detail.instructions) extraDesc.push(`How to apply: ${detail.instructions}`);
    const descAppend = extraDesc.join("\n\n");

    try {
      // Get current description to append to
      const current = await db
        .select({ description: opportunities.description })
        .from(opportunities)
        .where(eq(opportunities.id, row.id))
        .limit(1);

      const currentDesc = current[0]?.description || "";

      await db
        .update(opportunities)
        .set({
          sourceUrl: foundationUrl,
          contactInfo,
          description: descAppend ? `${currentDesc}\n\n${descAppend}` : currentDesc,
          updatedAt: new Date(),
        })
        .where(eq(opportunities.id, row.id));

      enriched++;
    } catch {
      failed++;
    }

    // Rate limit: 150ms between requests
    await new Promise((r) => setTimeout(r, 150));
  }

  return { enriched, failed };
}
