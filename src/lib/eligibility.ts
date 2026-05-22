type EligibilityResult = {
  status: "likely" | "partial" | "unlikely" | "unknown";
  label: string;
  reasons: string[];
};

type OppLike = {
  applicantTypes?: string | null;
  location?: string | null;
  categories?: string | null;
};

type ProfileLike = {
  orgType?: string | null;
  state?: string | null;
  areasOfExpertise?: string | null;
};

const ORG_TYPE_MAP: Record<string, string[]> = {
  "Sole Proprietorship": ["Individual", "Business", "Small Business"],
  LLC: ["Business", "Small Business", "For-Profit"],
  Corporation: ["Business", "Small Business", "For-Profit"],
  "S-Corp": ["Business", "Small Business", "For-Profit"],
  "C-Corp": ["Business", "Small Business", "For-Profit"],
  Nonprofit: ["Nonprofit", "Non-Profit", "501(c)(3)", "Community-Based Organization"],
  Partnership: ["Business", "Small Business", "For-Profit"],
  "Government Entity": ["Public Agency", "Government", "State Government", "Local Government"],
  "Educational Institution": ["Educational Institution", "University", "College", "School"],
  "Tribal Organization": ["Tribal Government", "Tribal Organization", "Indian/Native American Tribal Government"],
};

function normalizeType(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function orgTypeMatches(orgType: string, applicantTypes: string[]): boolean {
  const mappedTerms = ORG_TYPE_MAP[orgType] || [orgType];
  const normalizedApplicantTypes = applicantTypes.map(normalizeType);
  return mappedTerms.some((term) =>
    normalizedApplicantTypes.some(
      (at) => at.includes(normalizeType(term)) || normalizeType(term).includes(at)
    )
  );
}

function stateMatches(profileState: string, location: string): boolean {
  if (!location) return true;
  const loc = location.toLowerCase();
  const st = profileState.toLowerCase();
  if (loc.includes(st)) return true;
  if (loc.includes("nationwide") || loc.includes("national") || loc.includes("all states")) return true;
  if (loc.includes("statewide") || loc.includes("multiple")) return true;
  return false;
}

export function checkEligibility(
  opportunity: OppLike,
  profile: ProfileLike | null
): EligibilityResult {
  if (!profile || (!profile.orgType && !profile.state)) {
    return { status: "unknown", label: "Complete profile to check", reasons: [] };
  }

  const reasons: string[] = [];
  let matchPoints = 0;
  let totalChecks = 0;

  if (opportunity.applicantTypes && profile.orgType) {
    totalChecks++;
    const types = opportunity.applicantTypes.split(";").map((t) => t.trim()).filter(Boolean);
    if (orgTypeMatches(profile.orgType, types)) {
      matchPoints++;
      reasons.push(`${profile.orgType} is an eligible applicant type`);
    } else {
      reasons.push(`${profile.orgType} may not match required applicant types`);
    }
  }

  if (opportunity.location && profile.state) {
    totalChecks++;
    if (stateMatches(profile.state, opportunity.location)) {
      matchPoints++;
      reasons.push(`Location matches (${profile.state})`);
    } else {
      reasons.push(`Location may not match: ${opportunity.location}`);
    }
  }

  if (opportunity.categories && profile.areasOfExpertise) {
    totalChecks++;
    const cats = opportunity.categories.split(";").map((c) => normalizeType(c));
    const expertise = profile.areasOfExpertise.split(",").map((e) => normalizeType(e));
    const overlap = cats.some((c) => expertise.some((e) => c.includes(e) || e.includes(c)));
    if (overlap) {
      matchPoints++;
      reasons.push("Categories align with your areas of expertise");
    }
  }

  if (totalChecks === 0) {
    return { status: "unknown", label: "Complete profile to check", reasons: [] };
  }

  const ratio = matchPoints / totalChecks;
  if (ratio >= 0.8) return { status: "likely", label: "Likely eligible", reasons };
  if (ratio >= 0.4) return { status: "partial", label: "May qualify", reasons };
  return { status: "unlikely", label: "May not qualify", reasons };
}
