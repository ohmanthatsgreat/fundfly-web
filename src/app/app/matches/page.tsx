"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Brain, Loader2, Sparkles, ChevronDown, ChevronUp, RotateCcw, Search } from "lucide-react";
import OpportunityCard, { type Opportunity } from "@/components/OpportunityCard";
import OpportunityDetail from "@/components/OpportunityDetail";
import UpgradeModal from "@/components/UpgradeModal";
import ActionToast from "@/components/ActionToast";
import { startApplication } from "@/lib/start-application";

interface Match {
  id: number;
  score: number;
  summary: string | null;
  matchReasoning: string | null;
  matchMode: string;
  opportunity: Opportunity;
}

/**
 * Best-effort progress bar for the AI matching scan.
 * The underlying API call is one big batched fetch with no per-opportunity
 * progress events. We estimate ~90s for a full 500-opp scan (25 batches of 20
 * at ~3.6s each) and animate to ~95% by then, holding short of 100% until
 * the response actually returns. Reassures the user that things are moving.
 */
function ScanProgressBar({
  elapsedMs,
  mode,
}: {
  elapsedMs: number;
  mode: "org" | "personal";
}) {
  const estimatedTotalMs = 90_000; // ~90s baseline for a 500-opp scan
  const pct = Math.min(95, (elapsedMs / estimatedTotalMs) * 95);
  const elapsedSec = Math.floor(elapsedMs / 1000);
  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-2 text-xs">
        <span className="text-foreground/80 font-medium">
          Scoring opportunities against your {mode === "personal" ? "personal" : "organization"} profile…
        </span>
        <span className="text-muted tabular-nums">
          {elapsedSec}s elapsed
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-purple-500 transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-muted mt-2">
        Scan time varies based on the number of opportunities in this batch.
      </p>
    </div>
  );
}

const ADMIN_USER_IDS = (process.env.NEXT_PUBLIC_ADMIN_USER_IDS || "")
  .split(",")
  .filter(Boolean);

export default function MatchesPage() {
  const router = useRouter();
  const { user } = useUser();
  const isAdmin = user?.id ? ADMIN_USER_IDS.includes(user.id) : false;
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"org" | "personal">("org");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<"matching" | "checklist">("matching");
  const [hasMore, setHasMore] = useState(false);
  // Cumulative count of opportunities scanned for the current mode. This is
  // owned by the server (match_scan_state) and hydrated on load, so navigating
  // away and back no longer loses the place or replays the first batch.
  const [totalScanned, setTotalScanned] = useState(0);
  const [totalAvailable, setTotalAvailable] = useState(0);
  // True total saved matches for this mode (the rendered list is capped, so
  // the summary count comes from this rather than matches.length).
  const [matchTotal, setMatchTotal] = useState(0);
  // Cost (in cents) of the most recent scan batch, surfaced for transparency.
  const [lastScanCostCents, setLastScanCostCents] = useState<number | null>(null);
  // Set when the monthly AI cost cap for this tier has been reached.
  const [limitReached, setLimitReached] = useState(false);
  // Client-side pagination for the results list — matches accumulate across
  // batches and the best are sorted first, so reveal them a page at a time.
  const RESULTS_PAGE_SIZE = 25;
  const [visibleCount, setVisibleCount] = useState(RESULTS_PAGE_SIZE);
  // Elapsed time for the in-flight scan, used to animate the progress bar
  // since the underlying API is one big batch with no per-opp progress event.
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  const [scanElapsedMs, setScanElapsedMs] = useState(0);

  // Reset transient display state when the user switches mode. The real scan
  // progress (totalScanned / hasMore) is re-hydrated from the server by
  // fetchMatches below, so we don't zero it permanently here.
  useEffect(() => {
    setVisibleCount(RESULTS_PAGE_SIZE);
    setLastScanCostCents(null);
    setLimitReached(false);
  }, [mode]);

  // Tick elapsed time during a scan
  useEffect(() => {
    if (!running || scanStartedAt === null) {
      setScanElapsedMs(0);
      return;
    }
    const t = setInterval(() => {
      setScanElapsedMs(Date.now() - scanStartedAt);
    }, 200);
    return () => clearInterval(t);
  }, [running, scanStartedAt]);
  const [expandedReasons, setExpandedReasons] = useState<Set<number>>(new Set());
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<{
    message: string;
    profilePath: string | null;
  } | null>(null);

  const handleSave = async (id: string) => {
    setSavedIds((prev) => new Set(prev).add(id));
    await fetch("/api/app/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: id }),
    });
  };

  const handleUnsave = async (id: string) => {
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
  };

  // Prime saved set from server so the heart icon reflects truth
  useEffect(() => {
    fetch("/api/app/saved")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.saved)) {
          setSavedIds(
            new Set(
              d.saved.map((s: { opportunityId: string }) => s.opportunityId)
            )
          );
        }
      })
      .catch(() => {});
  }, []);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/app/ai-matches?mode=${mode}`);
      const data = await res.json();
      setMatches(data.matches || []);
      setMatchTotal(data.matchTotal ?? (data.matches?.length || 0));
      // Hydrate scan progress from the server so "X of Y scanned" and the
      // Keep-Searching control survive navigation.
      if (data.scan) {
        setTotalScanned(data.scan.totalScanned ?? 0);
        setTotalAvailable(data.scan.totalAvailable ?? 0);
        setHasMore(data.scan.hasMore ?? false);
      }
    } catch {}
    setLoading(false);
  }, [mode]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  useEffect(() => {
    fetch("/api/app/subscription")
      .then((r) => r.json())
      .then((d) => setUserPlan(d.subscription?.plan || null))
      .catch(() => {});
  }, []);

  async function runMatch(reset = false) {
    setRunning(true);
    setScanStartedAt(Date.now());
    setLimitReached(false);
    if (reset) setTotalScanned(0);
    try {
      // The server owns the scan cursor (match_scan_state); we only tell it the
      // mode and whether this is a fresh "Re-scan from Start".
      const res = await fetch("/api/app/ai-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, reset }),
      });
      const data = await res.json();
      if (data.error === "subscription_required") {
        setShowUpgrade(true);
        setRunning(false);
        setScanStartedAt(null);
        return;
      }
      if (data.error === "ai_limit_reached") {
        setLimitReached(true);
        setRunning(false);
        setScanStartedAt(null);
        return;
      }
      if (data.error) {
        setRunning(false);
        setScanStartedAt(null);
        return;
      }
      setHasMore(data.hasMore ?? false);
      // Server returns the authoritative cumulative count.
      if (typeof data.totalScanned === "number") {
        setTotalScanned(data.totalScanned);
      }
      if (typeof data.totalAvailable === "number") {
        setTotalAvailable(data.totalAvailable);
      }
      if (typeof data.scanCostCents === "number") {
        setLastScanCostCents(data.scanCostCents);
      }
      await fetchMatches();
    } catch {}
    setRunning(false);
    setScanStartedAt(null);
  }

  function toggleReason(matchId: number) {
    setExpandedReasons((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) {
        next.delete(matchId);
      } else {
        next.add(matchId);
      }
      return next;
    });
  }

  /**
   * Single "Start Application" CTA — always creates a tracker row and opens
   * the workspace. AI features inside the workspace are individually gated.
   * No upgrade gate here so free users can also start an application.
   */
  async function handleNextStep(opp: Opportunity) {
    const result = await startApplication(opp.id, userPlan);
    if (!result.ok) {
      setActionError({ message: result.error, profilePath: result.profilePath });
      return;
    }
    router.push(`/app/applications?id=${result.appId}&view=${result.view}`);
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">AI Matches</h1>
          <p className="text-sm text-muted mt-1">
            Opportunities scored against your profile
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {matches.length > 0 && (
            <button
              onClick={() => runMatch(true)}
              disabled={running}
              className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border border-border text-muted hover:text-foreground hover:bg-surface transition-colors disabled:opacity-50 whitespace-nowrap"
              title="Clear existing matches and start fresh"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Re-scan from Start</span>
              <span className="sm:hidden">Re-scan</span>
            </button>
          )}
          <button
            onClick={() => runMatch(false)}
            disabled={running}
            className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {running ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {running
              ? "Matching..."
              : matches.length > 0
                ? "Keep Searching"
                : "Run AI Match"}
          </button>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 w-fit mb-6">
        <button
          onClick={() => setMode("org")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === "org"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          Business Matches
        </button>
        <button
          onClick={() => setMode("personal")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            mode === "personal"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted hover:text-foreground"
          }`}
        >
          Personal Matches
        </button>
      </div>

      {limitReached && (
        <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-foreground">
            You&apos;ve reached this month&apos;s AI scanning limit on your plan.
          </p>
          <p className="text-xs text-muted mt-1">
            Your already-matched opportunities are still below. Scanning resets
            at the start of your next billing period
            {userPlan === "matching" ? (
              <>
                , or{" "}
                <button
                  onClick={() => {
                    setUpgradeFeature("checklist");
                    setShowUpgrade(true);
                  }}
                  className="text-accent hover:underline font-medium"
                >
                  upgrade for more
                </button>
              </>
            ) : null}
            .
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
      ) : matches.length === 0 && totalScanned === 0 ? (
        <div className="max-w-xl mx-auto py-12">
          <div className="text-center mb-8">
            <Brain className="w-12 h-12 text-accent mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              Let&apos;s find your best grants
            </h2>
            <p className="text-sm text-muted">
              Our AI scores every opportunity against your profile so you can
              focus on what fits.
            </p>
          </div>

          {/* Live progress for the very first scan (no matches/total yet) */}
          {running && (
            <div className="mb-4">
              <ScanProgressBar elapsedMs={scanElapsedMs} mode={mode} />
            </div>
          )}

          {/* How it works — set expectations up front */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wider">
              How it works
            </h3>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                1
              </div>
              <div>
                <p className="text-sm font-medium">
                  Fill out your{" "}
                  {mode === "personal" ? "personal" : "organization"} profile
                </p>
                <p className="text-xs text-muted mt-0.5">
                  The more complete, the better the AI matches.{" "}
                  <Link
                    href={
                      mode === "personal" ? "/app/personal-profile" : "/app/organization"
                    }
                    className="text-accent hover:underline"
                  >
                    Open profile &rarr;
                  </Link>
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                2
              </div>
              <div>
                <p className="text-sm font-medium">Click &ldquo;Run AI Match&rdquo;</p>
                <p className="text-xs text-muted mt-0.5">
                  We score opportunities <strong>500 at a time</strong> to
                  manage AI cost. Scan time varies depending on how many
                  opportunities are in the batch.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-accent/15 text-accent text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                3
              </div>
              <div>
                <p className="text-sm font-medium">
                  Keep clicking &ldquo;Keep Searching&rdquo; until you&apos;ve covered them all
                </p>
                <p className="text-xs text-muted mt-0.5">
                  There are 1M+ opportunities indexed — your best matches may
                  be in batch 2, 3, or beyond. Or hit &ldquo;Re-scan from
                  Start&rdquo; anytime to redo with a refreshed profile.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <button
                onClick={() => runMatch(false)}
                disabled={running}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
              >
                {running ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Matching...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Run AI Match
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : matches.length === 0 ? (
        /* A scan ran (totalScanned > 0) but turned up no matches in the rows
           covered so far. Show real progress + next actions instead of the
           onboarding empty state. */
        <div className="max-w-xl mx-auto py-12">
          <div className="text-center mb-6">
            <Search className="w-12 h-12 text-muted mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">No matches yet</h2>
            <p className="text-sm text-muted">
              We&apos;ve scored{" "}
              <span className="font-semibold text-foreground">
                {totalScanned.toLocaleString()}
              </span>{" "}
              {mode === "personal" ? "personal" : "business"} opportunit
              {totalScanned === 1 ? "y" : "ies"}
              {totalAvailable > 0 && (
                <>
                  {" "}
                  of{" "}
                  <span className="font-semibold text-foreground">
                    {totalAvailable.toLocaleString()}
                  </span>
                </>
              )}{" "}
              so far and none cleared the relevance bar.
              {hasMore
                ? " Your best matches may be further in — keep searching."
                : " Try refining your profile, then re-scan from the start."}
            </p>
            {isAdmin && lastScanCostCents !== null && (
              <p className="text-xs text-muted mt-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-accent/70 mr-1">
                  Admin
                </span>
                Last scan AI cost:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  ${(lastScanCostCents / 100).toFixed(2)}
                </span>
              </p>
            )}
          </div>

          {running && <ScanProgressBar elapsedMs={scanElapsedMs} mode={mode} />}

          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            {hasMore && (
              <button
                onClick={() => runMatch(false)}
                disabled={running}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {running ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {running ? "Scanning..." : "Keep Searching"}
              </button>
            )}
            <button
              onClick={() => runMatch(true)}
              disabled={running}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 border border-border rounded-lg text-sm font-medium text-muted hover:text-foreground hover:bg-surface transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Re-scan from Start
            </button>
          </div>

          <p className="text-center text-xs text-muted mt-4">
            Tip:{" "}
            <Link
              href={mode === "personal" ? "/app/personal-profile" : "/app/organization"}
              className="text-accent hover:underline"
            >
              Complete your {mode === "personal" ? "personal" : "organization"} profile
            </Link>{" "}
            to improve match quality.
          </p>
        </div>
      ) : (
        <>
          {/* Results summary */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border gap-3">
            <div className="min-w-0">
              <p className="text-sm">
                <span className="font-semibold">{matchTotal}</span>{" "}
                <span className="text-muted">
                  {matchTotal === 1 ? "match" : "matches"}
                </span>
                {matchTotal > matches.length && (
                  <span className="text-muted">
                    {" "}
                    (showing top {matches.length})
                  </span>
                )}
                {totalScanned > 0 && (
                  <>
                    <span className="text-muted"> from </span>
                    <span className="font-semibold">
                      {totalScanned.toLocaleString()}
                    </span>
                    <span className="text-muted">
                      {" "}
                      scanned
                      {totalAvailable > 0 && (
                        <>
                          {" "}
                          of{" "}
                          <span className="font-semibold text-foreground">
                            {totalAvailable.toLocaleString()}
                          </span>{" "}
                          available
                        </>
                      )}
                    </span>
                  </>
                )}
              </p>
              {hasMore && !running && (
                <p className="text-xs text-muted mt-0.5">
                  {totalAvailable - totalScanned > 0
                    ? `${(totalAvailable - totalScanned).toLocaleString()} more to scan — click "Keep Searching" below`
                    : "More opportunities available — click “Keep Searching” below"}
                </p>
              )}
              {isAdmin && lastScanCostCents !== null && !running && (
                <p className="text-xs text-muted mt-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-accent/70 mr-1">
                    Admin
                  </span>
                  Last scan AI cost:{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    ${(lastScanCostCents / 100).toFixed(2)}
                  </span>
                </p>
              )}
            </div>
            <button
              onClick={() => runMatch(true)}
              disabled={running}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground border border-border rounded-md hover:bg-surface transition-colors disabled:opacity-50 shrink-0"
              title="Re-scan from the start with the current profile"
            >
              <RotateCcw size={11} />
              Re-scan from Start
            </button>
          </div>

          {/* Live scan progress */}
          {running && (
            <ScanProgressBar elapsedMs={scanElapsedMs} mode={mode} />
          )}

          <div className="space-y-3">
            {matches.slice(0, visibleCount).map((m) => (
              <div key={m.id}>
                <OpportunityCard
                  opportunity={m.opportunity}
                  matchScore={Math.round(m.score)}
                  isSaved={savedIds.has(m.opportunity.id)}
                  onSelect={setSelected}
                  onSave={handleSave}
                  onUnsave={handleUnsave}
                  onNextStep={handleNextStep}
                />
                {/* Match reasoning accordion */}
                {(m.summary || m.matchReasoning) && (
                  <div className="ml-5 mt-1 mb-2">
                    <button
                      onClick={() => toggleReason(m.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
                    >
                      {expandedReasons.has(m.id) ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                      Why this is a good match
                    </button>
                    {expandedReasons.has(m.id) && (
                      <div className="mt-1.5 pl-4 border-l-2 border-accent/30 text-xs text-muted leading-relaxed">
                        {m.matchReasoning || m.summary}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Show more (reveal additional already-scored matches) */}
          {visibleCount < matches.length && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() =>
                  setVisibleCount((c) => c + RESULTS_PAGE_SIZE)
                }
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-accent hover:underline"
              >
                <ChevronDown className="w-4 h-4" />
                Show {Math.min(RESULTS_PAGE_SIZE, matches.length - visibleCount)} more
                <span className="text-muted">
                  ({matches.length - visibleCount} remaining)
                </span>
              </button>
            </div>
          )}

          {/* Keep Searching / pagination controls */}
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => runMatch(false)}
                disabled={running}
                className="inline-flex items-center gap-2 px-5 py-3 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-card hover:border-accent/40 transition-all disabled:opacity-50"
              >
                {running ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {running ? "Scanning..." : "Keep Searching"}
              </button>
            </div>
          )}
          {totalScanned > 0 && !hasMore && matches.length > 0 && (
            <p className="text-center text-xs text-muted mt-4">
              All available opportunities have been scanned.
            </p>
          )}
        </>
      )}
      {showUpgrade && (
        <UpgradeModal
          feature={upgradeFeature}
          onClose={() => setShowUpgrade(false)}
        />
      )}
      {selected && (
        <OpportunityDetail
          opportunity={selected}
          isSaved={savedIds.has(selected.id)}
          onClose={() => setSelected(null)}
          onSave={handleSave}
          onUnsave={handleUnsave}
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
