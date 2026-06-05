"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Loader2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  Circle,
  Sparkles,
  Clock,
} from "lucide-react";

type Stage = { key: string; label: string };
type FunnelRow = { key: string; label: string; count: number };
type UserRow = {
  clerkUserId: string;
  email: string;
  name: string | null;
  signedUpAt: string | null;
  lastActiveAt: string | null;
  online: boolean;
  furthestStage: string;
  furthestStageLabel: string;
  furthestIdx: number;
  stages: Record<string, string | null>;
  counts: {
    matches: number;
    saved: number;
    applications: number;
    plans: number;
    aiActions: number;
    creditTopups: number;
  };
  subscriptions: { plan: string; status: string }[];
  trial: { plan: string } | null;
  recentAiActions: { feature: string; at: string | null }[];
  engagement: {
    sessions: number;
    pageViews: number;
    events: number;
    firstSeen: string | null;
    lastSeen: string | null;
    topPaths: { path: string; n: number }[];
    recentPageViews: { path: string | null; at: string | null }[];
  };
  recentActions: { name: string | null; at: string | null }[];
};

const ACTION_LABELS: Record<string, string> = {
  upgrade_modal_shown: "👀 Saw upgrade prompt",
  upgrade_checkout_click: "💳 Clicked checkout",
  start_trial: "🎁 Started trial",
  create_checklist: "📋 Built checklist",
  start_auto_submit: "🤖 Started auto-submit",
  generate_application: "✍️ Generated application",
};

/** Make a route path human-readable for the admin (strip /app prefix). */
function prettyPath(p: string | null): string {
  if (!p) return "—";
  const cleaned = p.replace(/^\/app\/?/, "") || "home";
  return cleaned === "" ? "home" : cleaned;
}

const FUNNEL_ORDER: Stage[] = [
  { key: "signed_up", label: "Signed up" },
  { key: "profile", label: "Built profile" },
  { key: "matches", label: "Got AI matches" },
  { key: "application", label: "Started application" },
  { key: "content", label: "Generated content" },
  { key: "checklist", label: "Built checklist" },
  { key: "auto_submit", label: "Ran auto-submit" },
  { key: "submitted", label: "Submitted" },
];

const FEATURE_LABELS: Record<string, string> = {
  enhance: "Enhanced profile",
  match_org: "Ran matching (org)",
  match_personal: "Ran matching (personal)",
  generate_application: "Generated full app",
  generate_section: "Generated a section",
  submission_plan: "Built checklist",
  submission_agent: "Ran auto-submit",
  classify_audience: "Classified audience",
};

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Color the furthest-stage badge by how deep into the funnel they got. */
function stageColor(idx: number): string {
  if (idx >= 7) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300";
  if (idx >= 4) return "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300";
  if (idx >= 2) return "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300";
  return "bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300";
}

/** Inactive (no activity in 7+ days) = a churn-risk flag. */
function isStale(iso: string | null): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() > 7 * 24 * 60 * 60 * 1000;
}

export default function ActivityPage() {
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/user-activity");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      setFunnel(data.funnel || []);
      setUsers(data.users || []);
    } catch {
      // keep prior
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Keep the online indicator live without a manual refresh.
    const id = setInterval(load, 45_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }
  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Activity className="w-10 h-10 text-muted" />
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="text-sm text-muted">You do not have admin permissions.</p>
      </div>
    );
  }

  const top = funnel[0]?.count || 0;

  return (
    <div className="p-6 max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href="/app/admin"
            className="text-muted hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </a>
          <Activity className="w-5 h-5 text-accent" />
          <h1 className="text-2xl font-bold">User Activity</h1>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-surface transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Funnel */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-1">Conversion funnel</h2>
        <p className="text-xs text-muted mb-5">
          How many users have reached each stage. The biggest drop is where to
          focus.
        </p>
        <div className="space-y-2.5">
          {funnel.map((f, i) => {
            const pct = top > 0 ? Math.round((f.count / top) * 100) : 0;
            const prev = i > 0 ? funnel[i - 1].count : f.count;
            const dropped = prev - f.count;
            const dropPct = prev > 0 ? Math.round((dropped / prev) * 100) : 0;
            return (
              <div key={f.key} className="flex items-center gap-3">
                <div className="w-36 shrink-0 text-sm text-right text-foreground/70">
                  {f.label}
                </div>
                <div className="flex-1 h-7 bg-surface rounded-md overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-accent to-purple-500 rounded-md transition-all"
                    style={{ width: `${Math.max(pct, f.count > 0 ? 4 : 0)}%` }}
                  />
                  <span className="absolute inset-y-0 left-2 flex items-center text-xs font-semibold text-foreground/80">
                    {f.count}
                  </span>
                </div>
                <div className="w-24 shrink-0 text-xs text-muted">
                  {i > 0 && dropped > 0 ? (
                    <span className="text-danger">−{dropped} ({dropPct}%)</span>
                  ) : (
                    <span>{pct}%</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Users */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="font-semibold">Users</h2>
          <span className="text-sm text-muted">({users.length})</span>
          {users.some((u) => u.online) && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              {users.filter((u) => u.online).length} online now
            </span>
          )}
          <span className="text-xs text-muted ml-auto">
            Live · sorted by most recently active
          </span>
        </div>

        <div className="space-y-2">
          {users.map((u) => {
            const open = expanded === u.clerkUserId;
            const stale = isStale(u.lastActiveAt);
            return (
              <div
                key={u.clerkUserId}
                className="border border-border rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(open ? null : u.clerkUserId)}
                  className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-surface/50 transition-colors"
                >
                  {open ? (
                    <ChevronDown className="w-4 h-4 text-muted shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted shrink-0" />
                  )}
                  {/* Online indicator */}
                  <span
                    className="relative flex h-2.5 w-2.5 shrink-0"
                    title={u.online ? "Online now" : "Offline"}
                  >
                    {u.online && (
                      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                        u.online ? "bg-emerald-500" : "bg-muted/40"
                      }`}
                    />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {u.name || u.email}
                    </div>
                    <div className="text-xs text-muted truncate">{u.email}</div>
                  </div>
                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md shrink-0 ${stageColor(
                      u.furthestIdx
                    )}`}
                  >
                    {u.furthestStageLabel}
                  </span>
                  <div className="hidden sm:flex items-center gap-1 text-xs shrink-0 w-28 justify-end">
                    <Clock className="w-3 h-3 text-muted" />
                    <span className={stale ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted"}>
                      {relTime(u.lastActiveAt)}
                    </span>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-border bg-surface/30 p-4 space-y-4">
                    {/* Journey */}
                    <div>
                      <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                        Journey
                      </div>
                      <div className="space-y-1.5">
                        {FUNNEL_ORDER.map((s) => {
                          const at = u.stages[s.key];
                          return (
                            <div key={s.key} className="flex items-center gap-2 text-sm">
                              {at ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              ) : (
                                <Circle className="w-4 h-4 text-muted/40 shrink-0" />
                              )}
                              <span className={at ? "" : "text-muted/60"}>
                                {s.label}
                              </span>
                              <span className="ml-auto text-xs text-muted">
                                {at ? fmtDate(at) : ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Counts */}
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {[
                        ["Matches", u.counts.matches],
                        ["Saved", u.counts.saved],
                        ["Apps", u.counts.applications],
                        ["Checklists", u.counts.plans],
                        ["AI actions", u.counts.aiActions],
                        ["Top-ups", u.counts.creditTopups],
                      ].map(([label, n]) => (
                        <div
                          key={label}
                          className="bg-card rounded-md border border-border px-2.5 py-2 text-center"
                        >
                          <div className="text-base font-semibold">{n}</div>
                          <div className="text-[10px] text-muted">{label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Engagement (first-party beacon) */}
                    <div>
                      <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                        Engagement
                      </div>
                      {u.engagement.events > 0 ? (
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-4 text-sm">
                            <span>
                              <span className="font-semibold">
                                {u.engagement.sessions}
                              </span>{" "}
                              <span className="text-muted">
                                session{u.engagement.sessions === 1 ? "" : "s"}
                              </span>
                            </span>
                            <span>
                              <span className="font-semibold">
                                {u.engagement.pageViews}
                              </span>{" "}
                              <span className="text-muted">page views</span>
                            </span>
                            <span className="text-muted text-xs self-center">
                              first seen {fmtDate(u.engagement.firstSeen)}
                            </span>
                          </div>

                          {u.engagement.topPaths.length > 0 && (
                            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                              {u.engagement.topPaths.map((p) => (
                                <div
                                  key={p.path}
                                  className="flex items-center gap-2 text-xs"
                                >
                                  <span className="font-mono text-foreground/70 truncate">
                                    {prettyPath(p.path)}
                                  </span>
                                  <span className="ml-auto text-muted shrink-0">
                                    {p.n}×
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {u.engagement.recentPageViews.length > 0 && (
                            <div>
                              <div className="text-[11px] text-muted mb-1">
                                Recent page views
                              </div>
                              <div className="space-y-1">
                                {u.engagement.recentPageViews
                                  .slice(0, 8)
                                  .map((p, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center gap-2 text-xs"
                                    >
                                      <span className="font-mono text-foreground/70 truncate">
                                        {prettyPath(p.path)}
                                      </span>
                                      <span className="ml-auto text-muted shrink-0">
                                        {relTime(p.at)}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted">
                          No page-view data yet — this user hasn&apos;t browsed
                          since live tracking went on. It&apos;ll populate as
                          they (and new users) use the app.
                        </p>
                      )}
                    </div>

                    {/* Key actions (instrumented clicks) */}
                    {u.recentActions.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                          Key actions
                        </div>
                        <div className="space-y-1">
                          {u.recentActions.map((a, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-xs"
                            >
                              <span className="text-foreground/80">
                                {ACTION_LABELS[a.name || ""] || a.name}
                              </span>
                              <span className="ml-auto text-muted">
                                {relTime(a.at)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Plan / trial */}
                    {(u.subscriptions.length > 0 || u.trial) && (
                      <div className="flex flex-wrap gap-2 text-xs">
                        {u.subscriptions.map((s, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 capitalize"
                          >
                            {s.plan} · {s.status}
                          </span>
                        ))}
                        {u.trial && u.subscriptions.length === 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 capitalize">
                            Trial · {u.trial.plan.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Recent AI actions */}
                    {u.recentAiActions.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3" /> Recent activity
                        </div>
                        <div className="space-y-1">
                          {u.recentAiActions.map((a, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 text-xs"
                            >
                              <span className="text-foreground/70">
                                {FEATURE_LABELS[a.feature] || a.feature}
                              </span>
                              <span className="ml-auto text-muted">
                                {relTime(a.at)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-[11px] text-muted">
                      Signed up {fmtDate(u.signedUpAt)} · last active{" "}
                      {fmtDate(u.lastActiveAt)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
