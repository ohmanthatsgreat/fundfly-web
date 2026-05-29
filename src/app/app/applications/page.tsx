"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FileText, ChevronDown, Trash2, PenTool } from "lucide-react";
import ApplicationWorkspace from "@/components/ApplicationWorkspace";
import { parseDeadline } from "@/lib/dates";

interface Application {
  id: number;
  opportunityId: string;
  status: string;
  mode: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  opportunityTitle?: string;
  opportunityAgency?: string;
  opportunityDeadline?: string;
}

const STATUS_STEPS = [
  "draft",
  "in_progress",
  "ready_to_submit",
  "submitted",
  "under_review",
  "awarded",
  "declined",
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  ready_to_submit: "Ready to Submit",
  submitted: "Submitted",
  under_review: "Under Review",
  awarded: "Awarded",
  declined: "Declined",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-400",
  in_progress:
    "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  ready_to_submit:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
  submitted:
    "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
  under_review:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  awarded:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  declined:
    "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

export default function ApplicationsPage() {
  return (
    <Suspense>
      <ApplicationsContent />
    </Suspense>
  );
}

function ApplicationsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [workspaceId, setWorkspaceId] = useState<number | null>(null);
  const [workspaceView, setWorkspaceView] = useState<"workspace" | "submission">("workspace");
  const [modeFilter, setModeFilter] = useState<"business" | "personal">("business");
  // Debounce note saves: typing updates local state instantly, but the PATCH
  // fires only once the user pauses (or blurs) instead of on every keystroke.
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchApps = useCallback(async () => {
    try {
      const res = await fetch("/api/app/applications");
      const data = await res.json();
      setApps(data.applications || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  // Handle deep-link URL params: ?id=123&view=submission
  useEffect(() => {
    const idParam = searchParams.get("id");
    const viewParam = searchParams.get("view");
    if (idParam) {
      setWorkspaceId(parseInt(idParam));
      setWorkspaceView(viewParam === "submission" ? "submission" : "workspace");
      router.replace("/app/applications", { scroll: false });
    }
  }, [searchParams, router]);

  async function updateStatus(id: number, status: string) {
    setSavingId(id);
    setApps((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
    try {
      await fetch("/api/app/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    } catch {}
    setSavingId(null);
  }

  function updateNotesLocal(id: number, notes: string) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, notes } : a)));
  }

  async function saveNotes(id: number, notes: string) {
    try {
      await fetch("/api/app/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, notes }),
      });
    } catch {}
  }

  async function deleteApp(id: number) {
    setApps((prev) => prev.filter((a) => a.id !== id));
    try {
      await fetch("/api/app/applications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {}
  }

  // If workspace is open, show it
  if (workspaceId !== null) {
    return (
      <div className="p-6 max-w-5xl">
        <ApplicationWorkspace
          applicationId={workspaceId}
          initialView={workspaceView}
          onBack={() => {
            setWorkspaceId(null);
            setWorkspaceView("workspace");
            fetchApps();
          }}
        />
      </div>
    );
  }

  // Split by business / personal (mode is set when the application is created;
  // legacy rows without a mode default to business).
  const appMode = (a: Application) => (a.mode === "personal" ? "personal" : "business");
  const businessCount = apps.filter((a) => appMode(a) === "business").length;
  const personalCount = apps.filter((a) => appMode(a) === "personal").length;
  const visibleApps = apps.filter((a) => appMode(a) === modeFilter);

  // Group the active tab's applications by status
  const grouped = STATUS_STEPS.reduce(
    (acc, s) => {
      acc[s] = visibleApps.filter((a) => a.status === s);
      return acc;
    },
    {} as Record<string, Application[]>
  );

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Applications</h1>
          <p className="text-sm text-muted mt-1">
            Track your grant applications ({apps.length} total)
          </p>
        </div>
      </div>

      {/* Business / Personal tabs */}
      {!loading && apps.length > 0 && (
        <div className="flex gap-1 bg-surface rounded-lg p-1 w-fit mb-6">
          <button
            onClick={() => setModeFilter("business")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              modeFilter === "business"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            Business{businessCount > 0 ? ` (${businessCount})` : ""}
          </button>
          <button
            onClick={() => setModeFilter("personal")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              modeFilter === "personal"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            Personal{personalCount > 0 ? ` (${personalCount})` : ""}
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-16 bg-card border border-border rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : apps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-xl bg-surface flex items-center justify-center mb-4">
            <FileText size={24} className="text-muted" />
          </div>
          <h3 className="text-sm font-semibold mb-1">No applications yet</h3>
          <p className="text-sm text-muted max-w-sm">
            Start tracking applications by clicking &quot;Track
            Application&quot; on any opportunity.
          </p>
        </div>
      ) : visibleApps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-xl bg-surface flex items-center justify-center mb-4">
            <FileText size={24} className="text-muted" />
          </div>
          <h3 className="text-sm font-semibold mb-1">
            No {modeFilter} applications
          </h3>
          <p className="text-sm text-muted max-w-sm">
            You don&apos;t have any {modeFilter} applications yet. Start one from
            a {modeFilter === "personal" ? "personal" : "business"} opportunity.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {STATUS_STEPS.map((status) => {
            const statusApps = grouped[status];
            if (!statusApps || statusApps.length === 0) return null;
            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${STATUS_COLORS[status]}`}
                  >
                    {STATUS_LABELS[status]}
                  </span>
                  <span className="text-[11px] text-muted tabular-nums">
                    {statusApps.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {statusApps.map((app) => (
                    <div
                      key={app.id}
                      className="bg-card border border-border rounded-xl overflow-hidden hover:border-accent/20 transition-all duration-200"
                    >
                      <button
                        onClick={() =>
                          setExpandedId(expandedId === app.id ? null : app.id)
                        }
                        className="w-full flex items-center gap-4 p-4 text-left hover:bg-surface/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold line-clamp-1 text-foreground/90">
                            {app.opportunityTitle ||
                              `Opportunity ${app.opportunityId}`}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            {app.opportunityAgency && (
                              <p className="text-xs text-muted">
                                {app.opportunityAgency}
                              </p>
                            )}
                          </div>
                        </div>
                        {parseDeadline(app.opportunityDeadline) && (
                          <span className="text-xs text-muted shrink-0">
                            Due{" "}
                            {parseDeadline(
                              app.opportunityDeadline
                            )!.toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        )}
                        <ChevronDown
                          size={14}
                          className={`text-muted transition-transform duration-200 ${
                            expandedId === app.id ? "rotate-180" : ""
                          }`}
                        />
                      </button>

                      {expandedId === app.id && (
                        <div className="px-4 pb-4 pt-0 border-t border-border space-y-4">
                          <div className="pt-4 flex items-center gap-2 flex-wrap">
                            <div>
                              <label className="text-[11px] font-medium text-muted uppercase tracking-wider block mb-1.5">
                                Status
                              </label>
                              <select
                                value={app.status}
                                onChange={(e) =>
                                  updateStatus(app.id, e.target.value)
                                }
                                className="px-3 py-2 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
                              >
                                {STATUS_STEPS.map((s) => (
                                  <option key={s} value={s}>
                                    {STATUS_LABELS[s]}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              onClick={() => setWorkspaceId(app.id)}
                              className="flex items-center gap-2 px-4 py-2 mt-5 bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all duration-150"
                            >
                              <PenTool size={14} />
                              Open Workspace
                            </button>
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-muted uppercase tracking-wider block mb-1.5">
                              Notes
                            </label>
                            <textarea
                              value={app.notes || ""}
                              onChange={(e) => {
                                const notes = e.target.value;
                                updateNotesLocal(app.id, notes);
                                if (notesTimer.current)
                                  clearTimeout(notesTimer.current);
                                notesTimer.current = setTimeout(
                                  () => saveNotes(app.id, notes),
                                  600
                                );
                              }}
                              onBlur={(e) => {
                                if (notesTimer.current)
                                  clearTimeout(notesTimer.current);
                                saveNotes(app.id, e.target.value);
                              }}
                              placeholder="Add notes about this application..."
                              rows={3}
                              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted">
                              Started{" "}
                              {new Date(app.createdAt).toLocaleDateString()}
                            </span>
                            <button
                              onClick={() => deleteApp(app.id)}
                              className="ml-auto flex items-center gap-1.5 text-xs text-danger hover:bg-danger/10 px-2 py-1 rounded-lg transition-colors"
                            >
                              <Trash2 size={12} />
                              Remove
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
