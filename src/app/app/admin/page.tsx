"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Users,
  CreditCard,
  Database,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Brain,
  Bookmark,
  Globe,
  AlertCircle,
  CheckCircle2,
  Key,
  Clock,
  DollarSign,
} from "lucide-react";

type AdminStats = {
  totals: {
    customers: number;
    activeSubscriptions: number;
    opportunities: number;
    applications: number;
    aiMatches: number;
    savedOpportunities: number;
    submissionPlans: number;
  };
  subscriptionsByPlan: Record<string, Record<string, number>>;
  opportunitiesBySource: { source: string; count: number }[];
  opportunitiesByType: { type: string; count: number }[];
  recentCustomers: {
    id: number;
    email: string;
    name: string | null;
    createdAt: string;
  }[];
};

type UserRow = {
  id: number;
  clerkUserId: string;
  email: string;
  name: string | null;
  stripeCustomerId: string | null;
  createdAt: string;
  subscription: {
    plan: string;
    status: string;
    stripeSubscriptionId: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  allSubscriptions: {
    plan: string;
    status: string;
    stripeSubscriptionId: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    createdAt: string;
  }[];
  applicationCount: number;
  licenseKey: { key: string; plan: string } | null;
  trial: {
    plan: string;
    startedAt: string;
    endsAt: string;
    converted: boolean;
    active: boolean;
    daysLeft: number;
  } | null;
  isAdmin: boolean;
};

type AiCost = {
  last30: { costCents: number; calls: number };
  allTime: { costCents: number; calls: number };
  systemCents: number;
  topUsers: {
    userId: string;
    email: string | null;
    costCents: number;
    calls: number;
  }[];
};

type SyncResult = {
  success: boolean;
  synced: {
    grantsGov: number;
    sbirGov: number;
    zeffy: { total: number; inserted: number; categories: string[] };
    zeffyEnrichment: { enriched: number; failed: number };
    errors: string[];
  };
  totalOpportunities: number;
  durationSeconds: string;
};

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center gap-3 mb-2">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent || "bg-accent/10"}`}
        >
          <Icon className={`w-4 h-4 ${accent ? "text-white" : "text-accent"}`} />
        </div>
        <span className="text-xs text-muted uppercase tracking-wide font-medium">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

/**
 * Toggles the stripe_bypass flag for any user. Available only inside the
 * admin panel (the endpoint is admin-gated). When enabled, the target user
 * gets free access to all paid AI features without an active subscription.
 */
function UserBypassToggle({ clerkUserId }: { clerkUserId: string }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/admin/stripe-bypass?userId=${encodeURIComponent(clerkUserId)}`
    )
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setEnabled(Boolean(d.enabled));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clerkUserId]);

  async function toggle() {
    if (enabled === null) return;
    const next = !enabled;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/stripe-bypass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: clerkUserId, enabled: next }),
      });
      const d = await res.json();
      setEnabled(Boolean(d.enabled));
    } catch {
      // ignore — leave UI as-is
    } finally {
      setSaving(false);
    }
  }

  if (enabled === null) {
    return (
      <div className="text-xs text-muted py-2">
        <Loader2 className="w-3 h-3 animate-spin inline mr-1.5" />
        Loading AI bypass status…
      </div>
    );
  }

  return (
    <div className="bg-card rounded-md p-3 flex items-center justify-between gap-3 border border-border">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Brain className="w-3.5 h-3.5 text-accent" />
          <span className="text-sm font-medium">AI Bypass</span>
          {enabled && (
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              Enabled
            </span>
          )}
        </div>
        <p className="text-xs text-muted">
          {enabled
            ? "Free access to all paid AI features (matching, checklist, auto-submission)."
            : "Grant free access to all paid AI features for this user."}
        </p>
      </div>
      <button
        onClick={toggle}
        disabled={saving}
        className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 ${
          enabled
            ? "border border-border hover:bg-surface"
            : "bg-accent text-white hover:bg-accent/90"
        }`}
      >
        {saving ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : enabled ? (
          "Revoke"
        ) : (
          "Grant Access"
        )}
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    trialing: "bg-blue-100 text-blue-700",
    past_due: "bg-amber-100 text-amber-700",
    canceled: "bg-red-100 text-red-700",
    incomplete: "bg-gray-100 text-gray-600",
    paused: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md ${colors[status] || "bg-gray-100 text-gray-600"}`}
    >
      {status}
    </span>
  );
}

function TrialBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md ${
        active ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
      }`}
    >
      {active ? "Trial" : "Trial ended"}
    </span>
  );
}

function UserRowItem({
  user,
  expanded,
  onToggle,
}: {
  user: UserRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-surface/50 transition-colors"
      >
        <div className="w-5 h-5 flex items-center justify-center text-muted">
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {user.name || user.email}
            </span>
            {user.isAdmin && (
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                Admin
              </span>
            )}
          </div>
          <span className="text-xs text-muted">{user.email}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {user.subscription ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted capitalize">
                {user.subscription.plan}
              </span>
              <StatusBadge status={user.subscription.status} />
            </div>
          ) : user.trial ? (
            <TrialBadge active={user.trial.active} />
          ) : (
            <span className="text-xs text-muted">Free</span>
          )}
          <div className="flex items-center gap-1 text-xs text-muted">
            <FileText className="w-3 h-3" />
            {user.applicationCount}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-surface/30 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-xs text-muted block mb-1">Clerk ID</span>
              <span className="font-mono text-xs">{user.clerkUserId}</span>
            </div>
            <div>
              <span className="text-xs text-muted block mb-1">Joined</span>
              <span className="text-xs">
                {new Date(user.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            {user.stripeCustomerId && (
              <div>
                <span className="text-xs text-muted block mb-1">
                  Stripe Customer
                </span>
                <a
                  href={`https://dashboard.stripe.com/test/customers/${user.stripeCustomerId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent hover:underline inline-flex items-center gap-1"
                >
                  {user.stripeCustomerId}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {user.licenseKey && (
              <div>
                <span className="text-xs text-muted block mb-1">
                  License Key
                </span>
                <span className="font-mono text-xs flex items-center gap-1.5">
                  <Key className="w-3 h-3 text-muted" />
                  {user.licenseKey.key}
                </span>
              </div>
            )}
          </div>

          {user.trial && (
            <div className="bg-card rounded-md p-3 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3.5 h-3.5 text-accent" />
                <span className="text-sm font-medium">Free Trial</span>
                <TrialBadge active={user.trial.active} />
                {user.trial.converted && (
                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                    Converted
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted block mb-0.5">Plan</span>
                  <span className="capitalize">
                    {user.trial.plan.replace(/_/g, " ")}
                  </span>
                </div>
                <div>
                  <span className="text-muted block mb-0.5">
                    {user.trial.active ? "Days left" : "Status"}
                  </span>
                  <span>
                    {user.trial.active
                      ? `${user.trial.daysLeft} day${user.trial.daysLeft === 1 ? "" : "s"}`
                      : "Ended"}
                  </span>
                </div>
                <div>
                  <span className="text-muted block mb-0.5">Started</span>
                  <span>
                    {new Date(user.trial.startedAt).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted block mb-0.5">Ends</span>
                  <span>
                    {new Date(user.trial.endsAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {user.allSubscriptions.length > 0 && (
            <div>
              <span className="text-xs text-muted block mb-2 font-medium">
                Subscription History
              </span>
              <div className="space-y-1.5">
                {user.allSubscriptions.map((sub, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 text-xs bg-card rounded-md p-2"
                  >
                    <StatusBadge status={sub.status} />
                    <span className="capitalize">{sub.plan}</span>
                    <span className="text-muted">
                      Renews{" "}
                      {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                    </span>
                    {sub.cancelAtPeriodEnd && (
                      <span className="text-amber-600 text-[10px] font-medium">
                        Cancels at period end
                      </span>
                    )}
                    <a
                      href={`https://dashboard.stripe.com/test/subscriptions/${sub.stripeSubscriptionId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-accent hover:underline inline-flex items-center gap-1"
                    >
                      Stripe
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-user AI bypass — grant free access to all paid AI features */}
          <UserBypassToggle clerkUserId={user.clerkUserId} />
        </div>
      )}
    </div>
  );
}

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [aiCost, setAiCost] = useState<AiCost | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [expandedUser, setExpandedUser] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [userFilter, setUserFilter] = useState<"all" | "subscribed" | "free">(
    "all"
  );
  const [stripeBypass, setStripeBypass] = useState(false);
  const [bypassLoading, setBypassLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{
    totalClerk: number;
    inserted: number;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/admin/users"),
      ]);

      if (statsRes.status === 403 || usersRes.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }

      const statsData = await statsRes.json();
      const usersData = await usersRes.json();

      setStats(statsData);
      setUsers(usersData.users || []);

      // AI spend is best-effort — don't block the dashboard if it fails.
      try {
        const costRes = await fetch("/api/admin/ai-cost");
        if (costRes.ok) setAiCost(await costRes.json());
      } catch {}
    } catch {
      setForbidden(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    fetch("/api/admin/stripe-bypass")
      .then((r) => r.json())
      .then((d) => setStripeBypass(d.enabled))
      .catch(() => {})
      .finally(() => setBypassLoading(false));
  }, [loadData]);

  async function toggleStripeBypass() {
    const next = !stripeBypass;
    setStripeBypass(next);
    await fetch("/api/admin/stripe-bypass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
  }

  async function handleBackfillUsers() {
    if (
      !confirm(
        "Pull all Clerk users into the customers table? Safe to re-run; only inserts missing rows."
      )
    )
      return;
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch("/api/admin/backfill-customers", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBackfillResult({
          totalClerk: data.totalClerk,
          inserted: data.inserted,
        });
        // refresh user list to show new rows
        loadData();
      } else {
        alert(data.error || "Backfill failed");
      }
    } catch {
      alert("Network error during backfill");
    }
    setBackfilling(false);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const data: SyncResult = await res.json();
      setSyncResult(data);
      // Refresh stats after sync
      const statsRes = await fetch("/api/admin/stats");
      const statsData = await statsRes.json();
      setStats(statsData);
    } catch {
      setSyncResult({
        success: false,
        synced: {
          grantsGov: 0,
          sbirGov: 0,
          zeffy: { total: 0, inserted: 0, categories: [] },
          zeffyEnrichment: { enriched: 0, failed: 0 },
          errors: ["Network error"],
        },
        totalOpportunities: 0,
        durationSeconds: "0",
      });
    }
    setSyncing(false);
  }

  const filteredUsers = users.filter((u) => {
    if (userFilter === "subscribed") return u.subscription !== null;
    if (userFilter === "free") return u.subscription === null;
    return true;
  });

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
        <Shield className="w-10 h-10 text-muted" />
        <h2 className="text-lg font-semibold">Access Denied</h2>
        <p className="text-sm text-muted">
          You do not have admin permissions.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Shield className="w-5 h-5 text-accent" />
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        </div>
        <p className="text-sm text-muted">
          Manage tenants, subscriptions, and data sources.
        </p>
      </div>

      {/* Blog Management Link */}
      <a
        href="/app/admin/blog"
        className="bg-card border border-border rounded-xl p-5 flex items-center justify-between hover:border-accent/30 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <FileText className="w-4 h-4 text-accent" />
          </div>
          <div>
            <div className="text-sm font-medium group-hover:text-accent transition-colors">Blog Management</div>
            <div className="text-xs text-muted">
              Generate, edit, publish, and manage blog posts
            </div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted group-hover:text-accent transition-colors" />
      </a>

      {/* Stripe Bypass Toggle */}
      {!bypassLoading && (
        <div className="bg-card border border-border rounded-xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <div className="text-sm font-medium">Stripe Gate Bypass</div>
              <div className="text-xs text-muted">
                Skip subscription checks for your admin account to test AI features
              </div>
            </div>
          </div>
          <button
            onClick={toggleStripeBypass}
            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
              stripeBypass ? "bg-accent" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                stripeBypass ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      )}

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Users"
            value={stats.totals.customers}
            icon={Users}
          />
          <StatCard
            label="Active Subs"
            value={stats.totals.activeSubscriptions}
            icon={CreditCard}
          />
          <StatCard
            label="Opportunities"
            value={stats.totals.opportunities.toLocaleString()}
            icon={Database}
          />
          <StatCard
            label="Applications"
            value={stats.totals.applications}
            icon={FileText}
          />
          <StatCard
            label="AI Matches"
            value={stats.totals.aiMatches.toLocaleString()}
            icon={Brain}
          />
          <StatCard
            label="Saved"
            value={stats.totals.savedOpportunities}
            icon={Bookmark}
          />
          <StatCard
            label="Submission Plans"
            value={stats.totals.submissionPlans}
            icon={Globe}
          />
          <StatCard
            label="Data Sources"
            value={stats.opportunitiesBySource.length}
            icon={Database}
          />
        </div>
      )}

      {/* AI Spend — founder COGS monitoring */}
      {aiCost && (
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <DollarSign className="w-5 h-5 text-accent" />
            <h2 className="font-semibold">AI Spend</h2>
            <span className="text-xs text-muted">(Anthropic API cost)</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-surface rounded-lg px-4 py-3 border border-border">
              <div className="text-xs text-muted mb-1">Last 30 days</div>
              <div className="text-2xl font-bold">
                {fmtUsd(aiCost.last30.costCents)}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {aiCost.last30.calls.toLocaleString()} calls
              </div>
            </div>
            <div className="bg-surface rounded-lg px-4 py-3 border border-border">
              <div className="text-xs text-muted mb-1">All time</div>
              <div className="text-2xl font-bold">
                {fmtUsd(aiCost.allTime.costCents)}
              </div>
              <div className="text-xs text-muted mt-0.5">
                {aiCost.allTime.calls.toLocaleString()} calls
              </div>
            </div>
            <div className="bg-surface rounded-lg px-4 py-3 border border-border">
              <div className="text-xs text-muted mb-1">System (30d)</div>
              <div className="text-2xl font-bold">
                {fmtUsd(aiCost.systemCents)}
              </div>
              <div className="text-xs text-muted mt-0.5">
                crons, blog, classification
              </div>
            </div>
            <div className="bg-surface rounded-lg px-4 py-3 border border-border">
              <div className="text-xs text-muted mb-1">User (30d)</div>
              <div className="text-2xl font-bold">
                {fmtUsd(
                  Math.max(0, aiCost.last30.costCents - aiCost.systemCents)
                )}
              </div>
              <div className="text-xs text-muted mt-0.5">billable users</div>
            </div>
          </div>

          {aiCost.topUsers.length > 0 && (
            <div>
              <div className="text-xs text-muted font-medium mb-2">
                Top spenders (last 30 days)
              </div>
              <div className="space-y-1.5">
                {aiCost.topUsers.map((u) => (
                  <div
                    key={u.userId}
                    className="flex items-center gap-3 text-xs bg-surface rounded-md px-3 py-2 border border-border"
                  >
                    <span className="flex-1 min-w-0 truncate">
                      {u.email || (
                        <span className="font-mono text-muted">{u.userId}</span>
                      )}
                    </span>
                    <span className="text-muted">
                      {u.calls.toLocaleString()} calls
                    </span>
                    <span className="font-semibold tabular-nums">
                      {fmtUsd(u.costCents)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Data Sync */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-accent" />
            <h2 className="font-semibold">Data Sync</h2>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {syncing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Sync Now
              </>
            )}
          </button>
        </div>

        <p className="text-sm text-muted mb-4">
          Pull the latest opportunities from Grants.gov, SBIR.gov, and Zeffy
          into the database. Syncs 5 Zeffy categories per run (rotates through
          all 100). Upserts records and enriches Zeffy grants with contact info.
        </p>

        {/* Source breakdown */}
        {stats && stats.opportunitiesBySource.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {stats.opportunitiesBySource.map((s) => (
              <div
                key={s.source}
                className="bg-surface rounded-lg px-4 py-3 border border-border"
              >
                <div className="text-xs text-muted mb-1">{s.source}</div>
                <div className="text-lg font-semibold">
                  {s.count.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Type breakdown */}
        {stats && stats.opportunitiesByType.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {stats.opportunitiesByType.map((t) => (
              <span
                key={t.type}
                className="text-xs bg-surface border border-border rounded-md px-2.5 py-1"
              >
                {t.type}: {t.count.toLocaleString()}
              </span>
            ))}
          </div>
        )}

        {/* Sync result */}
        {syncResult && (
          <div
            className={`rounded-lg p-4 text-sm ${
              syncResult.success && syncResult.synced.errors.length === 0
                ? "bg-green-50 border border-green-200"
                : "bg-amber-50 border border-amber-200"
            }`}
          >
            <div className="flex items-center gap-2 mb-2 font-medium">
              {syncResult.success &&
              syncResult.synced.errors.length === 0 ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="text-green-800">Sync Complete</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span className="text-amber-800">
                    Sync finished with issues
                  </span>
                </>
              )}
              <span className="ml-auto text-xs text-muted flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {syncResult.durationSeconds}s
              </span>
            </div>
            <div className="space-y-1 text-xs">
              <div>
                Grants.gov: {syncResult.synced.grantsGov.toLocaleString()}{" "}
                records
              </div>
              <div>
                SBIR/STTR: {syncResult.synced.sbirGov.toLocaleString()} records
              </div>
              <div>
                Zeffy: {syncResult.synced.zeffy.inserted.toLocaleString()} new
                {syncResult.synced.zeffy.categories.length > 0 && (
                  <span className="text-muted ml-1">
                    ({syncResult.synced.zeffy.categories.join(", ")})
                  </span>
                )}
              </div>
              {(syncResult.synced.zeffyEnrichment.enriched > 0 ||
                syncResult.synced.zeffyEnrichment.failed > 0) && (
                <div>
                  Zeffy enrichment: {syncResult.synced.zeffyEnrichment.enriched}{" "}
                  enriched
                  {syncResult.synced.zeffyEnrichment.failed > 0 &&
                    `, ${syncResult.synced.zeffyEnrichment.failed} failed`}
                </div>
              )}
              <div>
                Total in DB:{" "}
                {Number(syncResult.totalOpportunities).toLocaleString()}
              </div>
              {syncResult.synced.errors.map((err, i) => (
                <div key={i} className="text-red-600">
                  Error: {err}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-accent" />
            <h2 className="font-semibold">
              Tenants{" "}
              <span className="text-sm font-normal text-muted">
                ({filteredUsers.length})
              </span>
            </h2>
            <button
              onClick={handleBackfillUsers}
              disabled={backfilling}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground border border-border rounded-md hover:bg-surface transition-colors disabled:opacity-50"
              title="Pull any Clerk users missing from the customers table"
            >
              {backfilling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {backfilling ? "Syncing..." : "Sync from Clerk"}
            </button>
            {backfillResult && (
              <span className="text-xs text-muted">
                {backfillResult.inserted > 0
                  ? `Added ${backfillResult.inserted} (of ${backfillResult.totalClerk} in Clerk)`
                  : `All ${backfillResult.totalClerk} Clerk users already in sync`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-0.5">
            {(["all", "subscribed", "free"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setUserFilter(f)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  userFilter === f
                    ? "bg-accent text-white"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {f === "all"
                  ? "All"
                  : f === "subscribed"
                    ? "Subscribed"
                    : "Free"}
              </button>
            ))}
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <p className="text-sm text-muted text-center py-8">
            No users match this filter.
          </p>
        ) : (
          <div className="space-y-2">
            {filteredUsers.map((user) => (
              <UserRowItem
                key={user.id}
                user={user}
                expanded={expandedUser === user.id}
                onToggle={() =>
                  setExpandedUser(
                    expandedUser === user.id ? null : user.id
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold mb-4">External Dashboards</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: "Stripe",
              url: "https://dashboard.stripe.com",
              desc: "Payments & billing",
            },
            {
              label: "Clerk",
              url: "https://dashboard.clerk.com",
              desc: "Auth & users",
            },
            {
              label: "Neon",
              url: "https://console.neon.tech",
              desc: "Database",
            },
            {
              label: "Vercel",
              url: "https://vercel.com",
              desc: "Hosting",
            },
            {
              label: "Railway",
              url: "https://railway.com",
              desc: "Worker",
            },
            {
              label: "Anthropic",
              url: "https://console.anthropic.com",
              desc: "AI API",
            },
            {
              label: "GitHub",
              url: "https://github.com/ohmanthatsgreat/fundfly-web",
              desc: "Source code",
            },
            {
              label: "Worker Health",
              url: "https://fundfly-worker-production.up.railway.app/health",
              desc: "Agent status",
            },
          ].map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-surface transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium group-hover:text-accent transition-colors">
                  {link.label}
                </div>
                <div className="text-xs text-muted">{link.desc}</div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-accent transition-colors shrink-0" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
