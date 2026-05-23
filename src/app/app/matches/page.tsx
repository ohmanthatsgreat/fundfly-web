"use client";

import { useState, useEffect, useCallback } from "react";
import { Brain, Loader2, Sparkles } from "lucide-react";
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
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"org" | "personal">("org");
  const [showUpgrade, setShowUpgrade] = useState(false);

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

  async function runMatch() {
    setRunning(true);
    try {
      const res = await fetch("/api/app/ai-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (data.error === "subscription_required") {
        setShowUpgrade(true);
        setRunning(false);
        return;
      }
      await fetchMatches();
    } catch {}
    setRunning(false);
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

        <button
          onClick={runMatch}
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
        <div className="space-y-3">
          {matches.map((m) => (
            <div key={m.id}>
              <OpportunityCard
                opportunity={m.opportunity}
                matchScore={Math.round(m.score)}
              />
              {m.summary && (
                <div className="ml-5 mt-1 mb-2 text-xs text-muted italic">
                  {m.summary}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {showUpgrade && (
        <UpgradeModal
          feature="matching"
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </div>
  );
}
