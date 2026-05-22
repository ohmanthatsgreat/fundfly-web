"use client";

import { useState, useEffect } from "react";
import { FileText, Loader2, Plus } from "lucide-react";

interface Application {
  id: number;
  opportunityId: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  opportunityTitle?: string;
  opportunityAgency?: string;
  opportunityDeadline?: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  "in-progress": "bg-blue-100 text-blue-700",
  submitted: "bg-green-100 text-green-700",
  awarded: "bg-purple-100 text-purple-700",
  rejected: "bg-red-100 text-red-700",
};

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch("/api/app/applications");
        const data = await res.json();
        setApps(data.applications || []);
      } catch {}
      setLoading(false);
    }
    fetch_();
  }, []);

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Applications</h1>
          <p className="text-sm text-muted mt-1">
            Track your grant applications
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
      ) : apps.length === 0 ? (
        <div className="text-center py-20">
          <FileText className="w-12 h-12 text-muted mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">No applications yet</p>
          <p className="text-sm text-muted">
            Start an application from any opportunity to track it here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((app) => (
            <div
              key={app.id}
              className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-sm mb-1">
                    {app.opportunityTitle || `Opportunity ${app.opportunityId}`}
                  </h3>
                  {app.opportunityAgency && (
                    <p className="text-xs text-muted mb-2">
                      {app.opportunityAgency}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-medium uppercase ${
                        statusColors[app.status] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {app.status}
                    </span>
                    {app.opportunityDeadline && (
                      <span>Due: {app.opportunityDeadline}</span>
                    )}
                    <span>
                      Started: {new Date(app.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
