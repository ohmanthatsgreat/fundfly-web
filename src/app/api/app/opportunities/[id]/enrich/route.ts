import { db, opportunities } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";

const GRANTS_DETAIL_API = "https://apply07.grants.gov/grantsws/rest/opportunity/details";

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseMoney(val: string | undefined | null): number | null {
  if (!val || val === "none" || val === "None" || val === "N/A") return null;
  const cleaned = val.replace(/[,$]/g, "");
  const num = parseInt(cleaned);
  return isNaN(num) ? null : num;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAuth();
  const { id } = await params;

  const [opp] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, id))
    .limit(1);

  if (!opp) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (opp.source !== "grants.gov") {
    return Response.json({ enriched: false, reason: "not a grants.gov opportunity" });
  }

  const hasDescription = opp.description && opp.description.length > 50;
  const hasApplicantTypes = opp.applicantTypes && opp.applicantTypes.length > 0;
  if (hasDescription && hasApplicantTypes) {
    return Response.json({ enriched: false, reason: "already enriched" });
  }

  // Extract numeric ID from our composite ID (grants_gov_12345 -> 12345)
  const numericId = id.replace("grants_gov_", "").replace("grants-", "");

  try {
    const res = await fetch(GRANTS_DETAIL_API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `oppId=${numericId}`,
    });

    if (!res.ok) {
      return Response.json({ enriched: false, reason: `API returned ${res.status}` });
    }

    const data = await res.json();
    const synopsis = data.synopsis || {};
    const forecast = data.forecast || {};
    const details = synopsis.synopsisDesc ? synopsis : forecast;

    const description = details.synopsisDesc
      ? stripHtml(details.synopsisDesc)
      : details.forecastDesc
        ? stripHtml(details.forecastDesc)
        : null;

    const applicantTypes = (synopsis.applicantTypes || [])
      .map((t: { description: string }) => t.description)
      .join("; ");

    const categories = (synopsis.fundingActivityCategories || [])
      .map((c: { description: string }) => c.description)
      .join("; ");

    const fundingMin = parseMoney(details.awardFloor);
    const fundingMax = parseMoney(details.awardCeiling);

    const contactParts: string[] = [];
    if (details.agencyContactName) contactParts.push(details.agencyContactName);
    if (details.agencyContactEmail) contactParts.push(details.agencyContactEmail);
    if (details.agencyContactPhone) contactParts.push(details.agencyContactPhone);
    const contactInfo = contactParts.join(" | ") || null;

    const matchingFunds = details.costSharing ? "Cost sharing required" : null;

    const grantUrl = synopsis.fundingDescLinkUrl || null;

    const cfdas = (data.cfdas || [])
      .map((c: { cfdaNumber: string }) => c.cfdaNumber)
      .filter(Boolean)
      .join(", ");

    // Update the opportunity with enriched data
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (description && !hasDescription) updateData.description = description;
    if (applicantTypes) updateData.applicantTypes = applicantTypes;
    if (categories) updateData.categories = categories;
    if (fundingMin) updateData.fundingMin = fundingMin;
    if (fundingMax) updateData.fundingMax = fundingMax;
    if (contactInfo) updateData.contactInfo = contactInfo;
    if (matchingFunds) updateData.matchingFunds = matchingFunds;
    if (grantUrl) updateData.grantUrl = grantUrl;
    if (cfdas) updateData.cfdaNumber = cfdas;

    const [updated] = await db
      .update(opportunities)
      .set(updateData)
      .where(eq(opportunities.id, id))
      .returning();

    return Response.json({
      enriched: true,
      opportunity: updated,
    });
  } catch (err) {
    return Response.json({
      enriched: false,
      reason: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
