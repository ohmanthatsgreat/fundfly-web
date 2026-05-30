"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import OpportunityCard, { type Opportunity } from "./OpportunityCard";
import OpportunityDetail from "./OpportunityDetail";
import ActionToast from "./ActionToast";
import { startApplication } from "@/lib/start-application";

interface Props {
  endpoint?: string;
  title: string;
  filters?: Record<string, string>;
  showTitle?: boolean;
}

export default function OpportunityList({
  endpoint = "/api/app/opportunities",
  title,
  filters = {},
  showTitle = true,
}: Props) {
  const router = useRouter();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState("deadline_asc");
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{
    message: string;
    profilePath: string | null;
  } | null>(null);

  // Advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [agencyFilter, setAgencyFilter] = useState("");
  const [minFunding, setMinFunding] = useState("");
  const [maxFunding, setMaxFunding] = useState("");

  // Debounced mirror of the text inputs. Fetches fire once the user pauses
  // (350ms) instead of on every keystroke; sort and pagination stay instant.
  const [query, setQuery] = useState({
    search: "",
    agency: "",
    minFunding: "",
    maxFunding: "",
  });
  const isFirstQuery = useRef(true);

  const limit = 25;

  // Stabilize filters reference to prevent infinite re-renders
  const filtersKey = JSON.stringify(filters);
  const stableFilters = useMemo(() => filters, [filtersKey]);

  const hasActiveFilters = agencyFilter || minFunding || maxFunding;

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort,
      ...stableFilters,
      ...(query.search ? { search: query.search } : {}),
      ...(query.agency ? { search: query.agency } : {}),
      ...(query.minFunding ? { fundingMin: query.minFunding } : {}),
      ...(query.maxFunding ? { fundingMax: query.maxFunding } : {}),
    });

    // If there's both search text and agency filter, search text wins
    if (query.search && query.agency) {
      params.set("search", query.search);
    }

    try {
      const res = await fetch(`${endpoint}?${params}`);
      const data = await res.json();
      setOpportunities(data.opportunities || []);
      setTotal(data.total || 0);
    } catch {
      setOpportunities([]);
    }
    setLoading(false);
  }, [endpoint, page, sort, query, stableFilters]);

  const fetchSaved = useCallback(async () => {
    try {
      const res = await fetch("/api/app/saved");
      const data = await res.json();
      setSavedIds(
        new Set(
          (data.saved || []).map(
            (s: { opportunityId: string }) => s.opportunityId
          )
        )
      );
    } catch {}
  }, []);

  const fetchSubscription = useCallback(async () => {
    try {
      const res = await fetch("/api/app/subscription");
      const data = await res.json();
      setUserPlan(data.subscription?.plan || null);
    } catch {}
  }, []);

  // Debounce text inputs into `query` (which drives the fetch). Skip the
  // initial mount so we don't double-fetch before the user has typed anything.
  useEffect(() => {
    if (isFirstQuery.current) {
      isFirstQuery.current = false;
      return;
    }
    const t = setTimeout(() => {
      setQuery({ search, agency: agencyFilter, minFunding, maxFunding });
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search, agencyFilter, minFunding, maxFunding]);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  useEffect(() => {
    fetchSaved();
    fetchSubscription();
  }, [fetchSaved, fetchSubscription]);

  async function handleSave(id: string) {
    setSavedIds((prev) => new Set(prev).add(id));
    await fetch("/api/app/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: id }),
    });
  }

  async function handleUnsave(id: string) {
    setSavedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await fetch("/api/app/saved", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: id }),
    });
  }

  /**
   * Single "Start Application" CTA — always creates a tracker row and opens
   * the workspace. Free users land on the workspace too; the AI features
   * inside the workspace are individually gated (will prompt to upgrade
   * when the user clicks generate, etc.).
   *
   * "Save" handles the "I'm interested, come back later" use case via the
   * Saved folder. There's no separate "track" action.
   */
  async function handleNextStep(opp: Opportunity) {
    const result = await startApplication(opp.id, userPlan);
    if (!result.ok) {
      setActionError({ message: result.error, profilePath: result.profilePath });
      return;
    }
    setSelected(null);
    router.push(`/app/applications?id=${result.appId}&view=${result.view}`);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      {showTitle && (
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm text-muted mt-1">
              {total.toLocaleString()} opportunities
            </p>
          </div>
        </div>
      )}

      {/* Search + Sort + Filters */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-accent transition-colors" />
            <input
              type="text"
              placeholder="Search opportunities..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 appearance-none"
          >
            <option value="deadline_asc">Deadline (soonest)</option>
            <option value="deadline_desc">Deadline (latest)</option>
            <option value="posted_desc">Newest</option>
            <option value="funding_desc">Funding (high to low)</option>
            <option value="funding_asc">Funding (low to high)</option>
          </select>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm transition-all duration-150 ${
              hasActiveFilters
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border bg-surface text-muted hover:text-foreground hover:border-border"
            }`}
          >
            <SlidersHorizontal size={14} />
            Filters
            {hasActiveFilters && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            )}
          </button>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="flex flex-wrap items-end gap-3 p-4 bg-card border border-border rounded-lg">
            <div className="flex-1 min-w-[200px]">
              <label className="text-[11px] font-medium text-muted uppercase tracking-wider block mb-1.5">
                Agency
              </label>
              <input
                type="text"
                placeholder="e.g. Department of Energy"
                value={agencyFilter}
                onChange={(e) => setAgencyFilter(e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all"
              />
            </div>
            <div className="w-40">
              <label className="text-[11px] font-medium text-muted uppercase tracking-wider block mb-1.5">
                Min Funding
              </label>
              <input
                type="text"
                placeholder="$0"
                value={minFunding}
                onChange={(e) =>
                  setMinFunding(e.target.value.replace(/[^0-9]/g, ""))
                }
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all"
              />
            </div>
            <div className="w-40">
              <label className="text-[11px] font-medium text-muted uppercase tracking-wider block mb-1.5">
                Max Funding
              </label>
              <input
                type="text"
                placeholder="No max"
                value={maxFunding}
                onChange={(e) =>
                  setMaxFunding(e.target.value.replace(/[^0-9]/g, ""))
                }
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all"
              />
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setAgencyFilter("");
                  setMinFunding("");
                  setMaxFunding("");
                }}
                className="px-3 py-2 text-sm text-danger hover:bg-danger/10 rounded-lg transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-24 bg-card border border-border rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : opportunities.length === 0 ? (
        <div className="text-center py-20">
          <SlidersHorizontal className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-muted">No opportunities found</p>
          <p className="text-sm text-muted mt-1">
            Try adjusting your search or filters
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {opportunities.map((opp) => (
              <OpportunityCard
                key={opp.id}
                opportunity={opp}
                isSaved={savedIds.has(opp.id)}
                onSave={handleSave}
                onUnsave={handleUnsave}
                onSelect={setSelected}
                onNextStep={handleNextStep}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-surface disabled:opacity-30 transition-colors"
              >
                Previous
              </button>
              <span className="text-sm text-muted px-3">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-surface disabled:opacity-30 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Detail panel */}
      {selected && (
        <OpportunityDetail
          opportunity={selected}
          isSaved={savedIds.has(selected.id)}
          onClose={() => setSelected(null)}
          onSave={handleSave}
          onUnsave={handleUnsave}
          onNextStep={handleNextStep}
          onSelectSimilar={(opp) => setSelected(opp)}
        />
      )}

      {actionError && (
        <ActionToast
          message={actionError.message}
          actionLabel={actionError.profilePath ? "Set up profile" : undefined}
          onAction={
            actionError.profilePath
              ? () => {
                  const path = actionError.profilePath!;
                  setActionError(null);
                  setSelected(null);
                  router.push(path);
                }
              : undefined
          }
          onDismiss={() => setActionError(null)}
        />
      )}
    </div>
  );
}
