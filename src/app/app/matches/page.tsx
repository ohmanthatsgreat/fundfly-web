"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Brain, Loader2, Sparkles, ChevronDown, ChevronUp, RotateCcw, Search } from "lucide-react";
import OpportunityCard, { type Opportunity } from "@/components/OpportunityCard";
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
        <div className="text-center py-20">
          <Brain className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">No matches yet</p>
          <p className="text-sm text-muted mb-6">
            Fill out your {mode === "org" ? "organization" : "personal"} profile,
            then click &ldquo;Run AI Match&rdquo; to score opportunities.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {matches.map((m) => (
              <div key={m.id}>
                <OpportunityCard
                  opportunity={m.opportunity}
                  matchScore={Math.round(m.score)}
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
    </div>
  );
}
