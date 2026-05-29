"use client";

import { useEffect, useState, useCallback } from "react";
import type { Opportunity } from "./OpportunityCard";
import { checkEligibility } from "@/lib/eligibility";
import { parseDeadline, daysUntilDeadline } from "@/lib/dates";
import {
  X,
  ExternalLink,
  Building2,
  DollarSign,
  Clock,
  Tag,
  Users,
  Bookmark,
  BookmarkCheck,
  ArrowRight,
  FileText,
  Info,
  Globe,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Loader2,
  TrendingUp,
  Link2,
  Phone,
  Sparkles,
} from "lucide-react";

function formatCurrency(n: number | null) {
  if (!n) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatDate(d: string | null) {
  const parsed = parseDeadline(d);
  if (!parsed) return null;
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Construct the canonical public URL for an opportunity. */
function getOpportunityUrl(opp: {
  id: string;
  source: string | null;
  sourceUrl: string | null;
  grantUrl?: string | null;
}): string | null {
  if (opp.source === "grants.gov") {
    const numericId = opp.id.replace(/^grants_gov_/, "");
    return `https://simpler.grants.gov/opportunity/${numericId}`;
  }
  return opp.grantUrl || opp.sourceUrl || null;
}

const TYPE_COLORS: Record<string, string> = {
  grant:
    "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/20",
  sbir: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/20",
  sttr: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-500/20",
  loan: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20",
};

const ELIG_COLORS: Record<string, { bg: string; icon: typeof ShieldCheck }> = {
  likely: { bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20", icon: ShieldCheck },
  partial: { bg: "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20", icon: ShieldAlert },
  unlikely: { bg: "bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/20", icon: ShieldAlert },
  unknown: { bg: "bg-zinc-50 border-zinc-200 dark:bg-zinc-500/10 dark:border-zinc-500/20", icon: ShieldQuestion },
};

const ELIG_TEXT: Record<string, string> = {
  likely: "text-emerald-700 dark:text-emerald-400",
  partial: "text-amber-700 dark:text-amber-400",
  unlikely: "text-red-700 dark:text-red-400",
  unknown: "text-zinc-600 dark:text-zinc-400",
};

type SimilarOpp = {
  id: string;
  title: string;
  agency: string | null;
  type: string;
  fundingMax: number | null;
  deadline: string | null;
  sourceUrl: string | null;
};

type AgencyStats = {
  agency: string;
  fiscal_years: { fiscal_year: string; grant_obligations: number }[];
  total_grant_obligations: number;
  avg_annual_grant_spending: number;
} | null;

type EnrichedData = {
  description?: string | null;
  applicantTypes?: string | null;
  categories?: string | null;
  contactInfo?: string | null;
  matchingFunds?: string | null;
  fundingMin?: number | null;
  fundingMax?: number | null;
};

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wider">
        <Icon size={13} />
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function OpportunityDetail({
  opportunity: initialOpp,
  isSaved,
  onClose,
  onSave,
  onUnsave,
  onNextStep,
  onSelectSimilar,
}: {
  opportunity: Opportunity;
  isSaved: boolean;
  onClose: () => void;
  onSave: (id: string) => void;
  onUnsave: (id: string) => void;
  onNextStep?: (opp: Opportunity) => void;
  onSelectSimilar?: (opp: Opportunity) => void;
}) {
  const [opp, setOpp] = useState(initialOpp);
  const [enriching, setEnriching] = useState(false);
  const [enriched, setEnriched] = useState(false);
  const [similar, setSimilar] = useState<SimilarOpp[]>([]);
  const [agencyStats, setAgencyStats] = useState<AgencyStats>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [profile, setProfile] = useState<{ orgType?: string | null; state?: string | null; areasOfExpertise?: string | null } | null>(null);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  // Prevent body scroll when panel is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Fetch enrichment, similar, agency stats, and profile on mount
  const fetchExtras = useCallback(async () => {
    const oppId = initialOpp.id;

    // Enrich from Grants.gov
    if (initialOpp.source === "grants.gov" && (!initialOpp.description || initialOpp.description.length < 50)) {
      setEnriching(true);
      try {
        const res = await fetch(`/api/app/opportunities/${oppId}/enrich`, { method: "POST" });
        const data = await res.json();
        if (data.enriched && data.opportunity) {
          setOpp((prev) => ({ ...prev, ...data.opportunity }));
          setEnriched(true);
        }
      } catch {}
      setEnriching(false);
    }

    // Similar opportunities
    try {
      const res = await fetch(`/api/app/opportunities/${oppId}/similar`);
      const data = await res.json();
      if (data.similar) setSimilar(data.similar);
    } catch {}

    // Agency stats
    if (initialOpp.agency) {
      setLoadingStats(true);
      try {
        const res = await fetch(`/api/app/agency-stats?agency=${encodeURIComponent(initialOpp.agency)}`);
        const data = await res.json();
        if (data.stats) setAgencyStats(data.stats);
      } catch {}
      setLoadingStats(false);
    }

    // User profile for eligibility
    try {
      const res = await fetch("/api/app/profile");
      const data = await res.json();
      if (data.profile) setProfile(data.profile);
    } catch {}
  }, [initialOpp]);

  useEffect(() => {
    fetchExtras();
  }, [fetchExtras]);

  const deadlineDate = parseDeadline(opp.deadline);
  const days = daysUntilDeadline(opp.deadline);
  const isUrgent = days !== null && days >= 0 && days <= 7;
  const isPast = days !== null && days < 0;

  const fundingRange =
    formatCurrency(opp.fundingMin) && formatCurrency(opp.fundingMax)
      ? `${formatCurrency(opp.fundingMin)} – ${formatCurrency(opp.fundingMax)}`
      : formatCurrency(opp.fundingMax) || formatCurrency(opp.fundingMin);

  // Eligibility check
  const eligibility = checkEligibility(
    {
      applicantTypes: (opp as unknown as EnrichedData).applicantTypes ?? null,
      location: null,
      categories: (opp as unknown as EnrichedData).categories ?? null,
    },
    profile
  );
  const eligStyle = ELIG_COLORS[eligibility.status] || ELIG_COLORS.unknown;
  const EligIcon = eligStyle.icon;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div className="fixed inset-y-0 right-0 w-full max-w-2xl bg-background border-l border-border z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-6 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                  TYPE_COLORS[opp.type] ||
                  "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-400 dark:border-zinc-500/20"
                }`}
              >
                {opp.type.toUpperCase()}
              </span>
              {opp.status && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400">
                  {opp.status}
                </span>
              )}
              {isUrgent && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20">
                  {days === 0 ? "Due today" : `${days}d left`}
                </span>
              )}
              {isPast && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-500/10">
                  Closed
                </span>
              )}
              {eligibility.status !== "unknown" && (
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${eligStyle.bg} ${ELIG_TEXT[eligibility.status]}`}
                >
                  {eligibility.label}
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold leading-snug text-foreground">
              {opp.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-surface transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Enriching indicator */}
          {enriching && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/5 border border-accent/10">
              <Loader2 size={14} className="animate-spin text-accent" />
              <span className="text-xs text-accent">Fetching full details from Grants.gov...</span>
            </div>
          )}

          {/* Description */}
          {opp.description ? (
            <Section title="Description" icon={FileText}>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                {opp.description.length > 1500
                  ? opp.description.slice(0, 1500) + "..."
                  : opp.description}
              </p>
            </Section>
          ) : !enriching ? (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20">
              <Info
                size={16}
                className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
              />
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <p className="font-medium mb-1">Limited details available</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Click &quot;View Original Listing&quot; below for the complete
                  details.
                </p>
              </div>
            </div>
          ) : null}

          {/* Key details grid */}
          <div className="grid grid-cols-2 gap-4">
            {opp.agency && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <Building2 size={12} />
                  Agency
                </div>
                <p className="text-sm font-medium">{opp.agency}</p>
              </div>
            )}
            {fundingRange && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <DollarSign size={12} />
                  Funding
                </div>
                <p className="text-sm font-medium">{fundingRange}</p>
              </div>
            )}
            {deadlineDate && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <Clock size={12} />
                  Deadline
                </div>
                <p className="text-sm font-medium">{formatDate(opp.deadline)}</p>
                {days !== null && days >= 0 && (
                  <p
                    className={`text-xs ${isUrgent ? "text-red-500" : "text-muted"}`}
                  >
                    {days === 0 ? "Due today" : `${days} days remaining`}
                  </p>
                )}
              </div>
            )}
            {!deadlineDate && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <Clock size={12} />
                  Deadline
                </div>
                <p className="text-sm font-medium">Rolling / Open</p>
              </div>
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Tag size={12} />
                Source
              </div>
              <p className="text-sm font-medium">{opp.source}</p>
            </div>
          </div>

          {/* Eligibility detail */}
          {eligibility.status !== "unknown" && eligibility.reasons.length > 0 && (
            <Section title="Eligibility Check" icon={EligIcon}>
              <div className={`p-3 rounded-lg border ${eligStyle.bg}`}>
                <p className={`text-sm font-medium ${ELIG_TEXT[eligibility.status]}`}>
                  {eligibility.label}
                </p>
                <ul className="mt-2 space-y-1">
                  {eligibility.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-foreground/60 flex items-start gap-1.5">
                      <span className="mt-1 shrink-0">•</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </Section>
          )}

          {/* Contact info (from enrichment) */}
          {(opp as unknown as EnrichedData).contactInfo && (
            <Section title="Contact" icon={Phone}>
              <p className="text-sm text-foreground/70">
                {(opp as unknown as EnrichedData).contactInfo}
              </p>
            </Section>
          )}

          {/* Matching funds */}
          {(opp as unknown as EnrichedData).matchingFunds && (
            <Section title="Cost Sharing" icon={DollarSign}>
              <p className="text-sm text-foreground/70">
                {(opp as unknown as EnrichedData).matchingFunds}
              </p>
            </Section>
          )}

          {/* Audience */}
          {opp.audience && (
            <Section title="Target Audience" icon={Users}>
              <span className="text-xs px-2 py-1 rounded-md bg-surface text-foreground/70 border border-border capitalize">
                {opp.audience}
              </span>
            </Section>
          )}

          {/* Agency funding history */}
          {agencyStats && (
            <Section title="Agency Funding History" icon={TrendingUp}>
              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted">Avg. Annual Grant Spending</span>
                  <span className="text-sm font-semibold">
                    {formatCurrency(agencyStats.avg_annual_grant_spending)}
                  </span>
                </div>
                {agencyStats.fiscal_years.map((fy) => (
                  <div key={fy.fiscal_year} className="flex items-center justify-between text-xs">
                    <span className="text-muted">FY {fy.fiscal_year}</span>
                    <span className="text-foreground/80 font-medium tabular-nums">
                      {formatCurrency(fy.grant_obligations)}
                    </span>
                  </div>
                ))}
                <p className="text-[11px] text-muted pt-1 border-t border-border">
                  Data from USAspending.gov ({agencyStats.agency})
                </p>
              </div>
            </Section>
          )}
          {loadingStats && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 size={12} className="animate-spin" />
              Loading agency funding data...
            </div>
          )}

          {/* Similar opportunities */}
          {similar.length > 0 && (
            <Section title="Similar Opportunities" icon={Sparkles}>
              <div className="space-y-2">
                {similar.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      if (!onSelectSimilar) return;
                      const inferredSource = s.id.startsWith("grants_gov_")
                        ? "grants.gov"
                        : s.id.startsWith("sam_")
                          ? "sam.gov"
                          : "";
                      onSelectSimilar({
                        id: s.id,
                        title: s.title,
                        agency: s.agency,
                        type: s.type,
                        status: null,
                        fundingMin: null,
                        fundingMax: s.fundingMax,
                        deadline: s.deadline,
                        source: inferredSource,
                        description: null,
                        sourceUrl: s.sourceUrl,
                        grantUrl: null,
                        audience: null,
                      });
                    }}
                    className="w-full text-left bg-card border border-border rounded-lg p-3 hover:border-accent/40 hover:bg-surface/50 transition-colors"
                  >
                    <p className="text-sm font-medium line-clamp-1">{s.title}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                      {s.agency && <span>{s.agency}</span>}
                      {s.fundingMax && <span>{formatCurrency(s.fundingMax)}</span>}
                      {parseDeadline(s.deadline) && (
                        <span>
                          Due {parseDeadline(s.deadline)!.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {/* Grant page link */}
          {getOpportunityUrl(opp) && (
            <Section title="Grant Page" icon={Globe}>
              <a
                href={getOpportunityUrl(opp)!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent hover:text-accent/80 underline underline-offset-2 flex items-center gap-1.5"
              >
                View original listing
                <ExternalLink size={12} />
              </a>
            </Section>
          )}
        </div>

        {/* Footer actions — 2x2 grid on mobile, single row on desktop */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 p-4 border-t border-border shrink-0 bg-card/50">
          <button
            onClick={() => (isSaved ? onUnsave(opp.id) : onSave(opp.id))}
            className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 ${
              isSaved
                ? "text-accent bg-accent/10 border border-accent/30"
                : "text-muted hover:text-foreground bg-surface hover:bg-card border border-border"
            }`}
          >
            {isSaved ? (
              <BookmarkCheck size={14} />
            ) : (
              <Bookmark size={14} />
            )}
            {isSaved ? "Saved" : "Save"}
          </button>

          {onNextStep && (
            <button
              onClick={() => onNextStep(opp)}
              className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 transition-all duration-150 sm:ml-auto"
            >
              Start Application
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
