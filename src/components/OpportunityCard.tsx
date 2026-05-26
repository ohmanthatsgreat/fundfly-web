"use client";

import { Bookmark, BookmarkCheck, ExternalLink, ArrowRight } from "lucide-react";
import { format, parseISO, isPast } from "date-fns";

export interface Opportunity {
  id: string;
  title: string;
  agency: string | null;
  type: string;
  status: string | null;
  fundingMin: number | null;
  fundingMax: number | null;
  deadline: string | null;
  source: string;
  description: string | null;
  sourceUrl: string | null;
  grantUrl: string | null;
  audience: string | null;
}

interface Props {
  opportunity: Opportunity;
  isSaved?: boolean;
  matchScore?: number;
  onSave?: (id: string) => void;
  onUnsave?: (id: string) => void;
  onSelect?: (opp: Opportunity) => void;
  onNextStep?: (opp: Opportunity) => void;
}

const typeBadgeColors: Record<string, string> = {
  grant: "bg-blue-100 text-blue-700",
  sbir: "bg-purple-100 text-purple-700",
  sttr: "bg-violet-100 text-violet-700",
  foundation: "bg-amber-100 text-amber-700",
  scholarship: "bg-teal-100 text-teal-700",
  personal: "bg-emerald-100 text-emerald-700",
};

const statusBadgeColors: Record<string, string> = {
  open: "bg-green-100 text-green-700",
  closed: "bg-red-100 text-red-700",
  forecasted: "bg-yellow-100 text-yellow-700",
  draft: "bg-gray-100 text-gray-600",
};

function formatFunding(min: number | null, max: number | null): string {
  if (!min && !max) return "Varies";
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString()}`;
  };
  if (min && max && min !== max) return `${fmt(min)} - ${fmt(max)}`;
  return fmt(max || min || 0);
}

function formatDeadline(deadline: string | null): string {
  if (!deadline) return "Rolling";
  try {
    const d = parseISO(deadline);
    return format(d, "MMM d, yyyy");
  } catch {
    return deadline;
  }
}

function isExpired(deadline: string | null): boolean {
  if (!deadline) return false;
  try {
    return isPast(parseISO(deadline));
  } catch {
    return false;
  }
}

export default function OpportunityCard({
  opportunity: opp,
  isSaved = false,
  matchScore,
  onSave,
  onUnsave,
  onSelect,
  onNextStep,
}: Props) {
  const expired = isExpired(opp.deadline);

  return (
    <div
      className="group bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all cursor-pointer"
      onClick={() => onSelect?.(opp)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Badges row */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md ${
                typeBadgeColors[opp.type] || "bg-gray-100 text-gray-600"
              }`}
            >
              {opp.type}
            </span>
            {opp.status && (
              <span
                className={`text-[10px] font-medium uppercase px-2 py-0.5 rounded-md ${
                  statusBadgeColors[opp.status] || "bg-gray-100 text-gray-600"
                }`}
              >
                {opp.status}
              </span>
            )}
            {opp.audience && opp.audience.toLowerCase() === "personal" && (
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
                Personal
              </span>
            )}
            {opp.audience && opp.audience.toLowerCase() === "both" && (
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                Open to all
              </span>
            )}
            {matchScore !== undefined && (
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                  matchScore >= 80
                    ? "bg-green-100 text-green-700"
                    : matchScore >= 50
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {matchScore}% Match
              </span>
            )}
          </div>

          {/* Title */}
          <h3 className="font-semibold text-sm leading-snug mb-1 group-hover:text-accent transition-colors line-clamp-2">
            {opp.title}
          </h3>

          {/* Agency */}
          {opp.agency && (
            <p className="text-xs text-muted mb-3">{opp.agency}</p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-4 text-xs text-muted">
            <span className="font-medium text-foreground">
              {formatFunding(opp.fundingMin, opp.fundingMax)}
            </span>
            <span className={expired ? "text-danger" : ""}>
              {expired ? "Expired: " : "Due: "}
              {formatDeadline(opp.deadline)}
            </span>
            <span className="opacity-60">{opp.source}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {onNextStep && !expired && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNextStep(opp);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent bg-accent/10 border border-accent/30 rounded-lg hover:bg-accent/20 transition-colors"
              title="Start application"
            >
              Apply
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              isSaved ? onUnsave?.(opp.id) : onSave?.(opp.id);
            }}
            className="p-2 rounded-lg hover:bg-surface transition-colors"
            title={isSaved ? "Unsave" : "Save"}
          >
            {isSaved ? (
              <BookmarkCheck className="w-4 h-4 text-accent" />
            ) : (
              <Bookmark className="w-4 h-4 text-muted" />
            )}
          </button>
          {(opp.sourceUrl || opp.grantUrl) && (
            <a
              href={opp.grantUrl || opp.sourceUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              // Hidden on mobile — same destination is reachable from the
              // detail panel via "View on Grants.gov", and 3 actions per card
              // is too dense on a narrow viewport.
              className="hidden sm:inline-flex p-2 rounded-lg hover:bg-surface transition-colors"
              title="View original"
            >
              <ExternalLink className="w-4 h-4 text-muted" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
