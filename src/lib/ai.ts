import Anthropic from "@anthropic-ai/sdk";
import { recordCallCost, recordCallCostSync } from "@/lib/ai-cost";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "sk-ant-placeholder") {
    throw new Error("Please add your Anthropic API key in environment variables.");
  }
  return new Anthropic({ apiKey });
}

/**
 * Model used for the AI matching scan (org + personal). Matching is a
 * high-volume relevance-scoring task (up to ~25 calls per full scan), so it
 * runs on Haiku 4.5 — ~3x cheaper in+out than Sonnet — rather than the
 * Sonnet 4.6 used for user-facing long-form generation (drafts, sections).
 * Scoring + short rationale is well within Haiku's ability; the expensive
 * Sonnet calls stay on the application-writing paths where quality matters.
 * NOTE: keep this string in sync with the pricing map in lib/ai-cost.ts so
 * COGS is attributed correctly.
 */
const MATCH_MODEL = "claude-haiku-4-5-20251001";

/** Output cap per matching batch. Trimmed rationale keeps batches well under this. */
const MATCH_MAX_TOKENS = 3072;

type ProfileLike = Record<string, unknown>;

function buildOrgSummary(profile: ProfileLike): string {
  const fields: [string, string][] = [
    ["orgName", "Organization"],
    ["orgType", "Type"],
    ["missionStatement", "Mission"],
    ["productsServices", "Products/Services"],
    ["areasOfExpertise", "Expertise"],
    ["naicsCodes", "NAICS Codes"],
    ["certifications", "Certifications"],
    ["pastGrantExperience", "Past Grant Experience"],
    ["annualRevenue", "Annual Revenue"],
    ["employeeCount", "Employees"],
    ["yearFounded", "Year Founded"],
    ["technologyReadinessLevel", "TRL"],
    ["geographicFocus", "Geographic Focus"],
  ];
  const parts: string[] = [];
  for (const [key, label] of fields) {
    if (profile[key]) parts.push(`${label}: ${profile[key]}`);
  }
  if (profile.city && profile.state) parts.push(`Location: ${profile.city}, ${profile.state}`);
  return parts.join("\n");
}

function buildPersonalSummary(profile: ProfileLike): string {
  const fields: [string, string][] = [
    ["fullName", "Name"],
    ["citizenship", "Citizenship"],
    ["veteranStatus", "Veteran Status"],
    ["gender", "Gender"],
    ["raceEthnicity", "Race/Ethnicity"],
    ["householdSize", "Household Size"],
    ["annualIncome", "Annual Income"],
    ["employmentStatus", "Employment"],
    ["housingStatus", "Housing"],
    ["educationLevel", "Education"],
    ["fieldOfStudy", "Field of Study"],
    ["currentSchool", "Current School"],
    ["skills", "Skills"],
    ["interests", "Interests"],
    // Narrative fields — provide rich content for personal application writing
    ["bio", "Bio"],
    ["personalMission", "Personal Mission / Cause"],
    ["projectGoals", "Project Goals"],
    ["intendedUseOfFunds", "Intended Use of Funds"],
    ["pastAchievements", "Past Achievements / Awards"],
    ["portfolioLinks", "Portfolio / Work Samples"],
  ];
  const parts: string[] = [];
  for (const [key, label] of fields) {
    if (profile[key]) parts.push(`${label}: ${profile[key]}`);
  }
  if (profile.city && profile.state) parts.push(`Location: ${profile.city}, ${profile.state}`);
  return parts.join("\n");
}

type OppLike = {
  id: string;
  title: string;
  agency?: string | null;
  type: string;
  description?: string | null;
  fundingMin?: number | null;
  fundingMax?: number | null;
  deadline?: string | null;
  eligibilityTypes?: string | null;
  cfdaNumber?: string | null;
};

function buildOpportunitySummary(opp: OppLike): string {
  const parts = [
    `ID: ${opp.id}`,
    `Title: ${opp.title}`,
    `Agency: ${opp.agency || "Unknown"}`,
    `Type: ${opp.type}`,
  ];
  if (opp.description) parts.push(`Description: ${opp.description.slice(0, 500)}`);
  if (opp.fundingMin || opp.fundingMax) {
    parts.push(`Funding: ${opp.fundingMin ? `$${opp.fundingMin.toLocaleString()}` : "?"} – ${opp.fundingMax ? `$${opp.fundingMax.toLocaleString()}` : "?"}`);
  }
  if (opp.deadline) parts.push(`Deadline: ${opp.deadline}`);
  if (opp.eligibilityTypes) parts.push(`Eligibility: ${opp.eligibilityTypes}`);
  if (opp.cfdaNumber) parts.push(`CFDA: ${opp.cfdaNumber}`);
  return parts.join("\n");
}

export type MatchResult = {
  opportunity_id: string;
  score: number;
  summary: string;
  match_reasoning: string;
};

/** Matches plus the total AI cost (in cents) incurred to produce them. */
export type MatchRun = {
  matches: MatchResult[];
  costCents: number;
};

export async function matchOpportunities(
  profile: ProfileLike,
  opportunities: OppLike[],
  batchSize = 20,
  userId: string | null = null
): Promise<MatchRun> {
  const orgSummary = buildOrgSummary(profile);
  if (!orgSummary.includes("Mission") && !orgSummary.includes("Products") && !orgSummary.includes("Expertise")) {
    throw new Error("Please fill out your mission statement, products/services, or areas of expertise to enable AI matching.");
  }

  const allMatches: MatchResult[] = [];
  let costCents = 0;

  for (let i = 0; i < opportunities.length; i += batchSize) {
    const batch = opportunities.slice(i, i + batchSize);
    const oppList = batch.map((o, idx) => `--- Opportunity ${idx + 1} ---\n${buildOpportunitySummary(o)}`).join("\n\n");

    const model = MATCH_MODEL;
    const response = await getClient().messages.create({
      model,
      max_tokens: MATCH_MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: `You are an expert grant matching analyst. Analyze each funding opportunity below against this organization profile and determine relevance.

ORGANIZATION PROFILE:
${orgSummary}

OPPORTUNITIES TO EVALUATE:
${oppList}

For each opportunity, respond with a JSON array. Each element must have:
- "opportunity_id": the ID from the opportunity
- "score": relevance score from 0-100 (0 = not relevant, 100 = perfect match)
- "summary": ONE concise sentence on what this opportunity funds
- "match_reasoning": ONE sentence on why it does or doesn't fit this organization

Be concise — single sentences only. Only include opportunities with a score of 40 or higher. Respond with ONLY the JSON array, no other text.`,
        },
      ],
    });
    costCents += await recordCallCostSync(userId, model, response, "match_org");

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed: MatchResult[] = JSON.parse(jsonMatch[0]);
        allMatches.push(...parsed);
      }
    } catch {
      // skip unparseable batch
    }
  }

  return { matches: allMatches.sort((a, b) => b.score - a.score), costCents };
}

export async function matchPersonalOpportunities(
  profile: ProfileLike,
  opportunities: OppLike[],
  batchSize = 20,
  userId: string | null = null
): Promise<MatchRun> {
  const personalSummary = buildPersonalSummary(profile);
  if (!personalSummary.includes("Skills") && !personalSummary.includes("Interests") && !personalSummary.includes("Education")) {
    throw new Error("Please fill out your skills, interests, or education to enable personal matching.");
  }

  const allMatches: MatchResult[] = [];
  let costCents = 0;

  for (let i = 0; i < opportunities.length; i += batchSize) {
    const batch = opportunities.slice(i, i + batchSize);
    const oppList = batch.map((o, idx) => `--- Opportunity ${idx + 1} ---\n${buildOpportunitySummary(o)}`).join("\n\n");

    const model = MATCH_MODEL;
    const response = await getClient().messages.create({
      model,
      max_tokens: MATCH_MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: `You are an expert grant matching analyst specializing in personal grants, scholarships, fellowships, and individual funding opportunities. Analyze each opportunity below against this individual's profile and determine relevance.

INDIVIDUAL PROFILE:
${personalSummary}

OPPORTUNITIES TO EVALUATE:
${oppList}

CRITICAL: This is a PERSONAL grant search. You are scoring opportunities for an INDIVIDUAL applicant, not an organization. **Score 0-20 (effectively "not a match") any opportunity that:**
- Requires the applicant to be a registered nonprofit, 501(c)(3), school, business, or other organization
- Requires an EIN, UEI, SAM.gov registration, or DUNS number
- Is described as "small business," "entrepreneurship," "research institution," or "501(c) organization" funding
- Lists eligible applicants as agencies, governments, tribes, or organizations rather than individuals
- Is for capacity-building or operational support of a nonprofit

ONLY score 40+ if the opportunity is genuinely available to individuals applying for themselves — artists, students, researchers acting as individuals, people in hardship, demographic-specific aid recipients, fellowship applicants, scholarship recipients.

For each opportunity, respond with a JSON array. Each element must have:
- "opportunity_id": the ID from the opportunity
- "score": relevance score from 0-100 (0 = not relevant, 100 = perfect match)
- "summary": ONE concise sentence on what this opportunity funds
- "match_reasoning": ONE sentence on why it does or doesn't fit this individual. If the opportunity is org-only, say so.

Be concise — single sentences only. Only include opportunities with a score of 40 or higher. Respond with ONLY the JSON array, no other text.`,
        },
      ],
    });
    costCents += await recordCallCostSync(userId, model, response, "match_personal");

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed: MatchResult[] = JSON.parse(jsonMatch[0]);
        allMatches.push(...parsed);
      }
    } catch {
      // skip unparseable batch
    }
  }

  return { matches: allMatches.sort((a, b) => b.score - a.score), costCents };
}

export const APPLICATION_SECTIONS = [
  { key: "abstract", title: "Project Abstract", prompt: "Write a concise project abstract (200-300 words) summarizing the proposed work, objectives, methods, and expected outcomes." },
  { key: "need", title: "Statement of Need", prompt: "Write a compelling statement of need (300-500 words) describing the problem or gap being addressed, supported by context and why it matters." },
  { key: "description", title: "Project Description", prompt: "Write a detailed project description (500-800 words) covering the approach, methodology, activities, and timeline with specific milestones." },
  { key: "capability", title: "Organizational Capability", prompt: "Write an organizational capability statement (300-500 words) demonstrating why this organization is qualified, including relevant experience, staff, and resources." },
  { key: "outcomes", title: "Expected Outcomes & Impact", prompt: "Write an outcomes section (300-500 words) with specific, measurable goals, evaluation methods, and broader impact." },
  { key: "budget", title: "Budget Justification", prompt: "Write a budget justification (200-400 words) with a high-level cost breakdown and rationale for each major category. Use the funding range if known." },
  { key: "key_personnel", title: "Key Personnel", prompt: "Write brief bios/qualifications (200-300 words) for key personnel who would work on this project, based on the organization profile." },
  { key: "timeline", title: "Project Timeline", prompt: "Create a project timeline with major phases, milestones, and deliverables organized by quarter or month." },
];

/**
 * Personal grant application template — for artists, students, individuals
 * applying for personal grants, fellowships, endowments, or emergency relief.
 * Different shape from org applications: no "Organizational Capability" or
 * "Key Personnel" — instead leads with personal narrative, qualifications,
 * and intended use of funds.
 */
export const PERSONAL_APPLICATION_SECTIONS = [
  { key: "personal_statement", title: "Personal Statement", prompt: "Write a compelling personal statement (300-500 words) introducing the applicant — their background, motivations, and why this grant matters to them personally. Use first person. Draw heavily from the applicant's bio, personal mission, and life context." },
  { key: "background", title: "Background & Qualifications", prompt: "Write a background and qualifications section (300-500 words) covering relevant education, experience, skills, and demonstrated commitment to the field. Use specific examples from the applicant's profile (education, field of study, skills, achievements). First person." },
  { key: "project_proposal", title: "Project Proposal", prompt: "Write a project proposal (400-700 words) describing what the applicant intends to do with the grant. Based on the applicant's project goals and intended use of funds, lay out a clear plan with objectives, approach, and timeline. First person." },
  { key: "impact_statement", title: "Impact & Use of Funds", prompt: "Write an impact statement (300-500 words) describing the specific outcomes the applicant aims to achieve, who benefits, and how the funds will be used. Include a high-level budget breakdown based on the intended use of funds. First person." },
  { key: "achievements", title: "Past Achievements", prompt: "Write a past achievements section (200-400 words) highlighting awards, exhibitions, publications, scholarships, completed projects, or other accomplishments that demonstrate the applicant's track record. Use specifics from the applicant's profile. First person." },
  { key: "portfolio_summary", title: "Portfolio / Sample Work", prompt: "Write a portfolio summary (200-400 words) describing the applicant's body of work, with references to specific pieces, publications, performances, research, or projects. If portfolio links are provided in the profile, mention them. First person." },
  { key: "references", title: "References & Letters of Support", prompt: "Provide a list of recommended references and a brief note on letters of support the applicant should plan to gather, based on their field, education, and past collaborators. Format as a numbered list with suggested types of references (e.g., 'Academic advisor — speaks to research capacity')." },
  { key: "timeline", title: "Project Timeline", prompt: "Create a personal project timeline with major milestones and deliverables organized by month or quarter, scoped to one individual's effort (not a team). Be realistic about what one person can accomplish." },
];

/**
 * Pick which section template to use based on opportunity audience or profile mode.
 * "personal" → personal grants for individuals (artists, students, etc.)
 * "business" / "org" / null → standard organizational applications
 */
export function pickApplicationSections(audience: string | null | undefined) {
  if (audience && audience.toLowerCase() === "personal") {
    return PERSONAL_APPLICATION_SECTIONS;
  }
  return APPLICATION_SECTIONS;
}

export type SectionResult = {
  key: string;
  title: string;
  content: string;
};

export async function generateApplicationSections(
  profile: ProfileLike,
  opportunity: OppLike,
  mode: "org" | "personal" = "org",
  userId: string | null = null
): Promise<SectionResult[]> {
  const isPersonal = mode === "personal";
  const profileSummary = isPersonal
    ? buildPersonalSummary(profile)
    : buildOrgSummary(profile);
  const oppSummary = buildOpportunitySummary(opportunity);

  const sections = isPersonal ? PERSONAL_APPLICATION_SECTIONS : APPLICATION_SECTIONS;
  const sectionList = sections
    .map((s, i) => `${i + 1}. "${s.key}": ${s.prompt}`)
    .join("\n");

  const expertRole = isPersonal
    ? "an expert grant writer specializing in personal grants, fellowships, endowments, and individual funding awards for artists, students, and individuals"
    : "an expert federal grant writer";

  const profileLabel = isPersonal ? "APPLICANT PROFILE" : "ORGANIZATION PROFILE";
  const reviewerNote = isPersonal
    ? "Write in first person, with a personal and authentic voice. Use specific details from the applicant's profile — their bio, mission, project goals, and past achievements. Make it feel human, not corporate."
    : "Write in a professional, compelling tone appropriate for federal grant reviewers. Use specific details from the organization profile.";

  const model = "claude-sonnet-4-6";
  const response = await getClient().messages.create({
    model,
    max_tokens: 12000,
    messages: [
      {
        role: "user",
        content: `You are ${expertRole}. Generate a complete, structured grant application for the following opportunity, tailored to this ${isPersonal ? "applicant" : "organization"}.

${profileLabel}:
${profileSummary}

FUNDING OPPORTUNITY:
${oppSummary}

Generate each of these sections:
${sectionList}

Respond with a JSON array where each element has "key" (matching the section key above), "title" (the section title), and "content" (the full section text in markdown). ${reviewerNote} Each section should be thorough but focused.

Respond with ONLY the JSON array, no other text.`,
      },
    ],
  });
  await recordCallCost(userId, model, response, "generate_application");

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as SectionResult[];
    }
  } catch {
    // fallback
  }

  return [{ key: "narrative", title: "Full Narrative", content: text }];
}

export async function generateSection(
  profile: ProfileLike,
  opportunity: OppLike,
  sectionPrompt: string,
  existingContent?: string,
  mode: "org" | "personal" = "org",
  userId: string | null = null
): Promise<string> {
  const isPersonal = mode === "personal";
  const profileSummary = isPersonal
    ? buildPersonalSummary(profile)
    : buildOrgSummary(profile);
  const oppSummary = buildOpportunitySummary(opportunity);

  const regen = existingContent
    ? `\n\nThe user previously had this content which they want improved:\n${existingContent}`
    : "";

  const expertRole = isPersonal
    ? "an expert grant writer specializing in personal grants, fellowships, and individual funding awards"
    : "an expert federal grant writer";

  const profileLabel = isPersonal ? "APPLICANT PROFILE" : "ORGANIZATION PROFILE";

  const voiceNote = isPersonal
    ? "Write in first person, with a personal and authentic voice."
    : "Write in a professional, compelling tone.";

  const model = "claude-sonnet-4-6";
  const response = await getClient().messages.create({
    model,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are ${expertRole}. Write this section for a grant application.

${profileLabel}:
${profileSummary}

FUNDING OPPORTUNITY:
${oppSummary}

SECTION TO WRITE: ${sectionPrompt}${regen}

${voiceNote} Use markdown formatting. Return ONLY the section content, no other commentary.`,
      },
    ],
  });
  await recordCallCost(userId, model, response, "generate_section");

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }
  return text.trim();
}
