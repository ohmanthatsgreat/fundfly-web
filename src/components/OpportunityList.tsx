"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, SlidersHorizontal, Loader2 } from "lucide-react";
import OpportunityCard, { type Opportunity } from "./OpportunityCard";

interface Props {
  endpoint?: string;
  title: string;
  filters?: Record<string, string>;
}

export default function OpportunityList({
  endpoint = "/api/app/opportunities",
  title,
  filters = {},
}: Props) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState("deadline_asc");
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const limit = 25;

  // Stabilize filters reference to prevent infinite re-renders
  const filtersKey = JSON.stringify(filters);
  const stableFilters = useMemo(() => filters, [filtersKey]);

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      sort,
      ...stableFilters,
      ...(search ? { search } : {}),
    });

    try {
      const res = await fetch(`${endpoint}?${params}`);
      const data = await res.json();
      setOpportunities(data.opportunities || []);
      setTotal(data.total || 0);
    } catch {
      setOpportunities([]);
    }
    setLoading(false);
  }, [endpoint, page, sort, search, stableFilters]);

  const fetchSaved = useCallback(async () => {
    try {
      const res = await fetch("/api/app/saved");
      const data = await res.json();
      setSavedIds(new Set((data.saved || []).map((s: { opportunityId: string }) => s.opportunityId)));
    } catch {}
  }, []);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

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

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted mt-1">
            {total.toLocaleString()} opportunities
          </p>
        </div>
      </div>

      {/* Search + Sort */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            placeholder="Search opportunities..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2.5 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-colors"
          />
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
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
      ) : opportunities.length === 0 ? (
        <div className="text-center py-20">
          <SlidersHorizontal className="w-10 h-10 text-muted mx-auto mb-3" />
          <p className="text-muted">No opportunities found</p>
          <p className="text-sm text-muted mt-1">Try adjusting your search or filters</p>
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

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-2">{selected.title}</h2>
            {selected.agency && (
              <p className="text-sm text-muted mb-4">{selected.agency}</p>
            )}

            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div>
                <span className="text-muted">Type:</span>{" "}
                <span className="font-medium uppercase">{selected.type}</span>
              </div>
              <div>
                <span className="text-muted">Status:</span>{" "}
                <span className="font-medium">{selected.status}</span>
              </div>
              <div>
                <span className="text-muted">Funding:</span>{" "}
                <span className="font-medium">
                  {selected.fundingMin || selected.fundingMax
                    ? `$${(selected.fundingMin || 0).toLocaleString()} - $${(selected.fundingMax || 0).toLocaleString()}`
                    : "Varies"}
                </span>
              </div>
              <div>
                <span className="text-muted">Deadline:</span>{" "}
                <span className="font-medium">
                  {selected.deadline || "Rolling"}
                </span>
              </div>
            </div>

            {selected.description && (
              <div className="mb-6">
                <h3 className="font-semibold text-sm mb-2">Description</h3>
                <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap">
                  {selected.description}
                </p>
              </div>
            )}

            <div className="flex items-center gap-3">
              {(selected.grantUrl || selected.sourceUrl) && (
                <a
                  href={selected.grantUrl || selected.sourceUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
                >
                  View Original Listing
                </a>
              )}
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-surface transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
