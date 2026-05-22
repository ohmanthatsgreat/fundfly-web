import Anthropic from "@anthropic-ai/sdk";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "sk-ant-placeholder") {
    throw new Error("Please add your Anthropic API key in environment variables.");
  }
  return new Anthropic({ apiKey });
}

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

export async function matchOpportunities(
  profile: ProfileLike,
  opportunities: OppLike[],
  batchSize = 20
): Promise<MatchResult[]> {
  const orgSummary = buildOrgSummary(profile);
  if (!orgSummary.includes("Mission") && !orgSummary.includes("Products") && !orgSummary.includes("Expertise")) {
    throw new Error("Please fill out your mission statement, products/services, or areas of expertise to enable AI matching.");
  }

  const allMatches: MatchResult[] = [];

  for (let i = 0; i < opportunities.length; i += batchSize) {
    const batch = opportunities.slice(i, i + batchSize);
    const oppList = batch.map((o, idx) => `--- Opportunity ${idx + 1} ---\n${buildOpportunitySummary(o)}`).join("\n\n");

    const response = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
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
- "summary": 1-2 sentence summary of what this opportunity funds
- "match_reasoning": 2-3 sentences explaining why this is or isn't a good match for this organization

Only include opportunities with a score of 40 or higher. Respond with ONLY the JSON array, no other text.`,
        },
      ],
    });

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

  return allMatches.sort((a, b) => b.score - a.score);
}

export async function matchPersonalOpportunities(
  profile: ProfileLike,
  opportunities: OppLike[],
  batchSize = 20
): Promise<MatchResult[]> {
  const personalSummary = buildPersonalSummary(profile);
  if (!personalSummary.includes("Skills") && !personalSummary.includes("Interests") && !personalSummary.includes("Education")) {
    throw new Error("Please fill out your skills, interests, or education to enable personal matching.");
  }

  const allMatches: MatchResult[] = [];

  for (let i = 0; i < opportunities.length; i += batchSize) {
    const batch = opportunities.slice(i, i + batchSize);
    const oppList = batch.map((o, idx) => `--- Opportunity ${idx + 1} ---\n${buildOpportunitySummary(o)}`).join("\n\n");

    const response = await getClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `You are an expert grant matching analyst specializing in personal grants, scholarships, and individual funding opportunities. Analyze each opportunity below against this individual's profile and determine relevance.

INDIVIDUAL PROFILE:
${personalSummary}

OPPORTUNITIES TO EVALUATE:
${oppList}

For each opportunity, respond with a JSON array. Each element must have:
- "opportunity_id": the ID from the opportunity
- "score": relevance score from 0-100 (0 = not relevant, 100 = perfect match)
- "summary": 1-2 sentence summary of what this opportunity funds
- "match_reasoning": 2-3 sentences explaining why this is or isn't a good match for this individual

Only include opportunities with a score of 40 or higher. Respond with ONLY the JSON array, no other text.`,
        },
      ],
    });

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

  return allMatches.sort((a, b) => b.score - a.score);
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

export type SectionResult = {
  key: string;
  title: string;
  content: string;
};

export async function generateApplicationSections(
  profile: ProfileLike,
  opportunity: OppLike
): Promise<SectionResult[]> {
  const orgSummary = buildOrgSummary(profile);
  const oppSummary = buildOpportunitySummary(opportunity);

  const sectionList = APPLICATION_SECTIONS
    .map((s, i) => `${i + 1}. "${s.key}": ${s.prompt}`)
    .join("\n");

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 12000,
    messages: [
      {
        role: "user",
        content: `You are an expert federal grant writer. Generate a complete, structured grant application for the following opportunity, tailored to this organization.

ORGANIZATION PROFILE:
${orgSummary}

FUNDING OPPORTUNITY:
${oppSummary}

Generate each of these sections:
${sectionList}

Respond with a JSON array where each element has "key" (matching the section key above), "title" (the section title), and "content" (the full section text in markdown). Write in a professional, compelling tone appropriate for federal grant reviewers. Use specific details from the organization profile. Each section should be thorough but focused.

Respond with ONLY the JSON array, no other text.`,
      },
    ],
  });

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
  existingContent?: string
): Promise<string> {
  const orgSummary = buildOrgSummary(profile);
  const oppSummary = buildOpportunitySummary(opportunity);

  const regen = existingContent
    ? `\n\nThe user previously had this content which they want improved:\n${existingContent}`
    : "";

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are an expert federal grant writer. Write this section for a grant application.

ORGANIZATION PROFILE:
${orgSummary}

FUNDING OPPORTUNITY:
${oppSummary}

SECTION TO WRITE: ${sectionPrompt}${regen}

Write in a professional, compelling tone. Use markdown formatting. Return ONLY the section content, no other commentary.`,
      },
    ],
  });

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }
  return text.trim();
}
