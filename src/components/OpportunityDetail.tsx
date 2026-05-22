"use client";

import { useEffect } from "react";
import type { Opportunity } from "./OpportunityCard";
import {
  X,
  ExternalLink,
  Building2,
  DollarSign,
  Clock,
  Calendar,
  Tag,
  Users,
  Bookmark,
  BookmarkCheck,
  ArrowRight,
  FileText,
  Info,
  Globe,
} from "lucide-react";

function formatCurrency(n: number | null) {
  if (!n) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatDate(d: string | null) {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("en-US", {
      weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function daysUntil(d: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

const TYPE_COLORS: Record<string, string> = {
  grant:
    "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/20",
  sbir: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/20",
  sttr: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-500/20",
  loan: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20",
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
  opportunity: opp,
  isSaved,
  onClose,
  onSave,
  onUnsave,
  onStartApplication,
}: {
  opportunity: Opportunity;
  isSaved: boolean;
  onClose: () => void;
  onSave: (id: string) => void;
  onUnsave: (id: string) => void;
  onStartApplication?: (id: string) => void;
}) {
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

  const days = daysUntil(opp.deadline);
  const isUrgent = days !== null && days >= 0 && days <= 7;
  const isPast = days !== null && days < 0;

  const fundingRange =
    formatCurrency(opp.fundingMin) && formatCurrency(opp.fundingMax)
      ? `${formatCurrency(opp.fundingMin)} – ${formatCurrency(opp.fundingMax)}`
      : formatCurrency(opp.fundingMax) || formatCurrency(opp.fundingMin);

  const isGrantsGov = opp.source === "grants.gov";

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
          {/* Description */}
          {opp.description ? (
            <Section title="Description" icon={FileText}>
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                {opp.description}
              </p>
            </Section>
          ) : (
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
          )}

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
            {opp.deadline && (
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
            {!opp.deadline && (
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

          {/* Audience */}
          {opp.audience && (
            <Section title="Target Audience" icon={Users}>
              <span className="text-xs px-2 py-1 rounded-md bg-surface text-foreground/70 border border-border capitalize">
                {opp.audience}
              </span>
            </Section>
          )}

          {/* Grant page link */}
          {(opp.grantUrl || opp.sourceUrl) && (
            <Section title="Grant Page" icon={Globe}>
              <a
                href={opp.grantUrl || opp.sourceUrl || "#"}
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

        {/* Footer actions */}
        <div className="flex items-center gap-2 p-4 border-t border-border shrink-0 bg-card/50">
          <button
            onClick={() => (isSaved ? onUnsave(opp.id) : onSave(opp.id))}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 ${
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

          {onStartApplication && (
            <button
              onClick={() => onStartApplication(opp.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-muted hover:text-foreground bg-surface hover:bg-card border border-border rounded-lg transition-all duration-150"
            >
              Track Application
              <ArrowRight size={13} />
            </button>
          )}

          {(opp.grantUrl || opp.sourceUrl) && (
            <a
              href={opp.grantUrl || opp.sourceUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 transition-all duration-150 ml-auto"
            >
              {isGrantsGov ? "View on Grants.gov" : "Apply Now"}
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>
    </>
  );
}
