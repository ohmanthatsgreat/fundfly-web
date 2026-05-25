"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brain, Loader2, Sparkles, ChevronDown, ChevronUp, RotateCcw, Search } from "lucide-react";
import OpportunityCard, { type Opportunity } from "@/components/OpportunityCard";
import OpportunityDetail from "@/components/OpportunityDetail";
import UpgradeModal from "@/components/UpgradeModal";

interface Match {
  id: number;
  score: number;
  summary: string | null;
  matchReasoning: string | null;
  matchMode: string;
  opportunity: Opportunity;
}

export default function MatchesPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"org" | "personal">("org");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<"matching" | "checklist">("matching");
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [lastScanned, setLastScanned] = useState(0);
  const [expandedReasons, setExpandedReasons] = useState<Set<number>>(new Set());
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

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
    try {
      const res = await fetch("/api/app/ai-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          offset: reset ? 0 : nextOffset,
          reset,
        }),
      });
      const data = await res.json();
      if (data.error === "subscription_required") {
        setShowUpgrade(true);
        setRunning(false);
        return;
      }
      if (data.error) {
        setRunning(false);
        return;
      }
      setHasMore(data.hasMore ?? false);
      setNextOffset(data.nextOffset ?? 0);
      setLastScanned(data.scanned ?? 0);
      await fetchMatches();
    } catch {}
    setRunning(false);
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

  async function handleNextStep(opp: Opportunity) {
    const hasChecklist = userPlan && ["checklist", "auto_submission", "bundle"].includes(userPlan);
    if (!hasChecklist) {
      setUpgradeFeature("checklist");
      setShowUpgrade(true);
      return;
    }
    const res = await fetch("/api/app/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: opp.id }),
    });
    const data = await res.json();
    const appId = data.application?.id;
    if (!appId) return;

    const hasAutoSub = userPlan && ["auto_submission", "bundle"].includes(userPlan);
    const view = hasAutoSub ? "submission" : "workspace";
    router.push(`/app/applications?id=${appId}&view=${view}`);
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">AI Matches</h1>
          <p className="text-sm text-muted mt-1">
            Opportunities scored against your profile
          </p>
        </div>

        <div className="flex items-center gap-2">
          {matches.length > 0 && (
            <button
              onClick={() => runMatch(true)}
              disabled={running}
              className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border border-border text-muted hover:text-foreground hover:bg-surface transition-colors disabled:opacity-50"
              title="Clear existing matches and start fresh"
            >
              <RotateCcw className="w-4 h-4" />
              Re-scan from Start
            </button>
          )}
          <button
            onClick={() => runMatch(false)}
            disabled={running}
            className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {running ? "Matching..." : "Run AI Match"}
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

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
      ) : matches.length === 0 ? (
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
                  {mode === "org" ? "organization" : "personal"} profile
                </p>
                <p className="text-xs text-muted mt-0.5">
                  The more complete, the better the AI matches.{" "}
                  <Link
                    href={
                      mode === "org" ? "/app/profile" : "/app/personal-profile"
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
                  manage AI cost. Each scan takes ~30 seconds.
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
      ) : (
        <>
          {/* Results summary */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
            <div>
              <p className="text-sm">
                <span className="font-semibold">{matches.length}</span>{" "}
                <span className="text-muted">
                  {matches.length === 1 ? "match" : "matches"}
                </span>
                {lastScanned > 0 && (
                  <>
                    <span className="text-muted"> from </span>
                    <span className="font-semibold">
                      {lastScanned.toLocaleString()}
                    </span>
                    <span className="text-muted">
                      {" "}
                      opportunit{lastScanned === 1 ? "y" : "ies"} scanned
                    </span>
                  </>
                )}
              </p>
              {hasMore && (
                <p className="text-xs text-muted mt-0.5">
                  More opportunities available — click &ldquo;Keep Searching&rdquo;
                  below to scan the next batch
                </p>
              )}
            </div>
            <button
              onClick={() => runMatch(true)}
              disabled={running}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground border border-border rounded-md hover:bg-surface transition-colors disabled:opacity-50"
              title="Re-scan from the start with the current profile"
            >
              <RotateCcw size={11} />
              Re-scan from Start
            </button>
          </div>

          <div className="space-y-3">
            {matches.map((m) => (
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
          {lastScanned > 0 && !hasMore && matches.length > 0 && (
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
          onStartApplication={() => handleNextStep(selected)}
          onSelectSimilar={(opp) => setSelected(opp)}
        />
      )}
    </div>
  );
}
