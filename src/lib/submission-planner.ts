import Anthropic from "@anthropic-ai/sdk";

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
  opportunity: OppLike
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

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
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
2. **Portal-specific requirements**: Different agencies use different portals (Grants.gov, NSPIRES, eRA Commons, DSIP, etc.)
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

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate submission plan");
  return JSON.parse(jsonMatch[0]) as SubmissionPlan;
}
