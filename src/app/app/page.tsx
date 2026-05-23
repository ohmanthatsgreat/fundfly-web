"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import OpportunityList from "@/components/OpportunityList";
import StatsBar from "@/components/StatsBar";

type Stats = {
  total: number;
  grants: number;
  sbir: number;
  saved: number;
  applications: number;
  closingSoon: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/app/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <div>
      <div className="p-6 pb-0 max-w-5xl">
        {/* Stats */}
        {stats ? (
          <StatsBar stats={stats} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-24 bg-surface border border-border rounded-xl animate-pulse"
              />
            ))}
          </div>
        )}
      </div>

      {/* Opportunity list */}
      <OpportunityList title="All Opportunities" />
    </div>
  );
}
