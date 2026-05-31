import Anthropic from "@anthropic-ai/sdk";
import { recordCallCost } from "@/lib/ai-cost";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "sk-ant-placeholder") {
    throw new Error("Please configure your Anthropic API key.");
  }
  return new Anthropic({ apiKey });
}

type ProfileLike = {
  orgName?: string | null;
  orgType?: string | null;
  samRegistered?: boolean | null;
  uei?: string | null;
  ein?: string | null;
  certifications?: string | null;
  naicsCodes?: string | null;
};

type OppLike = {
  id: string;
  title: string;
  agency?: string | null;
  type: string;
  source: string;
  sourceUrl?: string | null;
  description?: string | null;
  deadline?: string | null;
  cfdaNumber?: string | null;
  eligibilityTypes?: string | null;
};

/**
 * How the completed application is delivered to the funder.
 * - "portal":  Submitted online via a government portal (Grants.gov, NSPIRES,
 *              eRA Commons, etc.) — supported by the browser agent.
 * - "email":   Submitted as an attachment to a designated email address.
 *              Use the DOCX export and have the user send it manually.
 * - "mail":    Physical mail submission. Use DOCX export, user prints + mails.
 * - "mixed":   Some materials online, some via email/mail.
 */
export type SubmissionMethod = "portal" | "email" | "mail" | "mixed";

export type SubmissionPlan = {
  opportunity_id: string;
  opportunity_title: string;
  total_steps: number;
  estimated_total_time: string;
  portals_involved: string[];
  prerequisites_summary: string;
  /** Primary submission method — drives whether to launch agent or use DOCX export. */
  submission_method: SubmissionMethod;
  /** Recipient email address if submission_method is "email" (or "mixed" with email component). */
  submission_email: string | null;
  /** Mailing address if submission_method is "mail". */
  submission_mailing_address: string | null;
  /** Human-readable note about delivery requirements. */
  submission_notes: string | null;
  steps: {
    step_number: number;
    portal: string;
    portal_url: string;
    action: string;
    description: string;
    requires_login: boolean;
    prerequisite_step: number | null;
    artifacts_produced: string[];
    artifacts_needed: string[];
    estimated_time: string;
    automatable: boolean;
    notes: string;
  }[];
  warnings: string[];
};

export async function researchSubmissionPlan(
  profile: ProfileLike,
  opportunity: OppLike,
  userId: string | null = null
): Promise<SubmissionPlan> {
  const profileParts: string[] = [];
  if (profile.orgName) profileParts.push(`Organization: ${profile.orgName}`);
  if (profile.orgType) profileParts.push(`Type: ${profile.orgType}`);
  if (profile.samRegistered) profileParts.push("SAM.gov registered: Yes");
  if (profile.uei) profileParts.push(`UEI: ${profile.uei}`);
  if (profile.ein) profileParts.push(`EIN: ${profile.ein}`);
  if (profile.certifications)
    profileParts.push(`Certifications: ${profile.certifications}`);
  if (profile.naicsCodes)
    profileParts.push(`NAICS: ${profile.naicsCodes}`);

  const oppParts = [
    `Title: ${opportunity.title}`,
    `Agency: ${opportunity.agency || "Unknown"}`,
    `Type: ${opportunity.type}`,
    `Source: ${opportunity.source}`,
    opportunity.sourceUrl ? `URL: ${opportunity.sourceUrl}` : null,
    opportunity.deadline ? `Deadline: ${opportunity.deadline}` : null,
    opportunity.description
      ? `Description: ${opportunity.description.slice(0, 1000)}`
      : null,
    opportunity.cfdaNumber ? `CFDA: ${opportunity.cfdaNumber}` : null,
    opportunity.eligibilityTypes
      ? `Eligibility: ${opportunity.eligibilityTypes}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const model = "claude-sonnet-4-6";
  const response = await getClient().messages.create({
    model,
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: `You are an expert in federal grant and SBIR/STTR submission processes. Research and create a detailed, step-by-step submission plan for the following opportunity.

ORGANIZATION PROFILE:
${profileParts.join("\n")}

OPPORTUNITY:
${oppParts}

Based on the opportunity type, agency, and source portal, create a complete submission plan. Consider:

1. **Submission method**: First, determine how the application is delivered. Most federal opportunities go through Grants.gov/NSPIRES/eRA Commons portals. However, some foundation grants, NIH program announcements, and smaller agency grants require **email submission** to a program officer, or even physical **mail**. Read the description carefully for phrases like "email completed application to," "send to mailing address," "submit via email," "PDF attachment to," or for explicit recipient email/postal addresses. Pick ONE primary method: "portal", "email", "mail", or "mixed" (if there's both online registration AND email/mail components).
2. **Portal-specific requirements**: Different agencies use different portals (Grants.gov, NSPIRES, eRA Commons, DSIP, etc.). IMPORTANT: Grants.gov has migrated opportunity search and viewing to the NEW system at simpler.grants.gov. For any Grants.gov opportunity, use https://simpler.grants.gov/opportunity/<id> to view/find the opportunity (the legacy grants.gov/search-results-detail URLs are deprecated). Workspace/application submission may still occur via the Grants.gov Workspace, but the opportunity itself lives on simpler.grants.gov.
3. **Prerequisites**: SAM.gov registration, Grants.gov registration, agency-specific accounts, CCR reports
4. **Artifacts that flow between portals**: Report IDs, confirmation numbers, registration certificates
5. **Order of operations**: Which steps must complete before others can begin

Return a JSON object with this structure:
{
  "opportunity_id": "${opportunity.id}",
  "opportunity_title": "${opportunity.title}",
  "total_steps": <number>,
  "estimated_total_time": "<time estimate>",
  "portals_involved": ["portal1.gov", "portal2.gov"],
  "prerequisites_summary": "<brief summary of what needs to happen first>",
  "submission_method": "portal" | "email" | "mail" | "mixed",
  "submission_email": "<recipient email if method is email or mixed, else null>",
  "submission_mailing_address": "<full address if method is mail, else null>",
  "submission_notes": "<one-line note describing delivery requirements, e.g. 'PDF attached to program officer email by 5pm EST on deadline'>",
  "steps": [
    {
      "step_number": 1,
      "portal": "sam.gov",
      "portal_url": "https://sam.gov",
      "action": "Verify SAM.gov registration",
      "description": "Log in to SAM.gov and verify active registration. Copy UEI and CAGE code.",
      "requires_login": true,
      "prerequisite_step": null,
      "artifacts_produced": ["UEI", "CAGE Code"],
      "artifacts_needed": [],
      "estimated_time": "5 min",
      "automatable": true,
      "notes": "Registration must be active — renew if expired"
    }
  ],
  "warnings": ["any important warnings about this submission"]
}

Be thorough and specific to this exact opportunity type and agency. Include ALL prerequisite steps. If submission is by email or mail, the steps should focus on preparing the application package — the user will deliver it manually using a DOCX export, NOT a browser agent.

Return ONLY the JSON object.`,
      },
    ],
  });
  await recordCallCost(userId, model, response, "submission_plan");

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }

  const truncated = response.stop_reason === "max_tokens";
  const plan = parsePlanJson(text, truncated);
  if (!plan) {
    throw new Error(
      "The AI returned an incomplete plan. Please try generating it again."
    );
  }
  return rewriteLegacyGrantsGovUrls(plan, opportunity);
}

/**
 * Safety net: rewrite legacy grants.gov opportunity URLs in the plan to the
 * new simpler.grants.gov system. Grants.gov migrated opportunity viewing
 * there, so the old `grants.gov/search-results-detail/...` links 404.
 */
function rewriteLegacyGrantsGovUrls(
  plan: SubmissionPlan,
  opportunity: OppLike
): SubmissionPlan {
  // Derive the numeric opportunity id (our ids look like "grants_gov_358289").
  const idMatch = opportunity.id.match(/(\d{4,})/);
  const simplerUrl = idMatch
    ? `https://simpler.grants.gov/opportunity/${idMatch[1]}`
    : "https://simpler.grants.gov/";

  const fix = (url: string): string => {
    if (!url) return url;
    // Legacy grants.gov opportunity/search pages → simpler.grants.gov.
    if (
      /grants\.gov\/(search-results-detail|web\/grants\/search|search-grants)/i.test(
        url
      ) ||
      /^https?:\/\/(www\.)?grants\.gov\/?$/i.test(url)
    ) {
      return simplerUrl;
    }
    return url;
  };

  for (const step of plan.steps) {
    if (step.portal_url) step.portal_url = fix(step.portal_url);
  }
  return plan;
}

/**
 * Extract and parse the plan JSON from the model's text output.
 *
 * The model occasionally returns JSON that is truncated (hit max_tokens) or
 * wrapped in prose/markdown fences. We:
 *   1. Slice from the first `{` to the last `}`.
 *   2. Try a direct parse.
 *   3. On failure, attempt to repair a truncated object by trimming the
 *      partial trailing element and closing any open brackets — salvaging
 *      all fully-formed steps instead of throwing.
 *
 * Returns null only if nothing usable could be recovered.
 */
function parsePlanJson(
  text: string,
  truncated: boolean
): SubmissionPlan | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  const raw = text.slice(start, end + 1);

  // Direct parse first (the happy path).
  try {
    return normalizePlan(JSON.parse(raw));
  } catch {
    // fall through to repair
  }

  if (truncated) {
    console.warn(
      "[submission-planner] Response hit max_tokens; attempting JSON repair."
    );
  }

  // Repair: the full text (not the lastIndexOf-trimmed slice) is more
  // faithful when truncated, since the final `}` may be a nested object.
  const repaired = repairTruncatedJson(text.slice(start));
  if (!repaired) return null;
  try {
    return normalizePlan(JSON.parse(repaired));
  } catch (err) {
    console.error("[submission-planner] Repair parse failed:", err);
    return null;
  }
}

/**
 * Ensure a parsed (possibly salvaged) plan has the required array/string
 * fields so downstream UI never crashes on a missing property. Returns null
 * if the object has no usable steps.
 */
function normalizePlan(obj: unknown): SubmissionPlan | null {
  if (!obj || typeof obj !== "object") return null;
  const p = obj as Partial<SubmissionPlan>;
  if (!Array.isArray(p.steps)) return null;

  // Drop any partial steps a truncation-repair may have left behind — a real
  // step must at least have an action and a description.
  const steps = p.steps.filter(
    (s) =>
      s &&
      typeof s === "object" &&
      typeof s.action === "string" &&
      s.action.trim().length > 0 &&
      typeof s.description === "string"
  );
  if (steps.length === 0) return null;

  return {
    opportunity_id: p.opportunity_id ?? "",
    opportunity_title: p.opportunity_title ?? "",
    total_steps: steps.length,
    estimated_total_time: p.estimated_total_time ?? "",
    portals_involved: Array.isArray(p.portals_involved)
      ? p.portals_involved
      : [],
    prerequisites_summary: p.prerequisites_summary ?? "",
    submission_method: p.submission_method ?? "portal",
    submission_email: p.submission_email ?? null,
    submission_mailing_address: p.submission_mailing_address ?? null,
    submission_notes: p.submission_notes ?? null,
    steps,
    warnings: Array.isArray(p.warnings) ? p.warnings : [],
  };
}

/**
 * Best-effort repair of a truncated JSON object: cut back to the last fully
 * closed value, drop any dangling comma, and append the brackets needed to
 * balance every still-open `{`/`[`. String-aware so braces inside string
 * literals are ignored.
 */
function repairTruncatedJson(s: string): string | null {
  // Walk once to find the index of the last fully-closed value (a `}` or `]`
  // at depth >= 1) so we can discard a partial trailing element.
  let inStr = false;
  let esc = false;
  let depth = 0;
  let lastCompleteIdx = -1;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;

    if (c === "{" || c === "[") {
      depth++;
    } else if (c === "}" || c === "]") {
      depth--;
      if (depth >= 1) lastCompleteIdx = i;
    }
  }

  if (lastCompleteIdx === -1) return null;

  // Cut to the last complete nested value, then drop a trailing comma.
  let cut = s.slice(0, lastCompleteIdx + 1).replace(/,\s*$/, "");

  // Recompute open brackets on the cut string and close them in reverse.
  inStr = false;
  esc = false;
  const closers: string[] = [];
  for (let i = 0; i < cut.length; i++) {
    const c = cut[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === "{") closers.push("}");
    else if (c === "[") closers.push("]");
    else if (c === "}" || c === "]") closers.pop();
  }

  while (closers.length) cut += closers.pop();
  return cut;
}
