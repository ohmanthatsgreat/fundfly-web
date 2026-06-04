"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Lock,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  KeyRound,
} from "lucide-react";

type SavedCred = {
  id: number;
  portalDomain: string;
  portalLabel: string | null;
  lastUsedAt: string | null;
  createdAt: string | null;
};

/**
 * Central vault of all the user's saved portal logins (sam.gov, grants.gov,
 * login.gov, foundation portals, etc.). Lives in Settings. Add / update /
 * delete here; the submission agent uses these to log in automatically.
 * Passwords are AES-256-GCM encrypted and never returned to the browser.
 */
export default function CredentialsVault() {
  const [creds, setCreds] = useState<SavedCred[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingDomain, setEditingDomain] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/app/portal-credentials");
      const data = await res.json();
      setCreds(data.credentials || []);
    } catch {
      // empty state is fine
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(domain: string) {
    if (!confirm(`Remove saved login for ${domain}?`)) return;
    await fetch(
      `/api/app/portal-credentials?portalDomain=${encodeURIComponent(domain)}`,
      { method: "DELETE" }
    );
    refresh();
  }

  return (
    <section className="bg-card border border-border rounded-2xl p-6 shadow-xs">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-accent" />
          <h2 className="font-semibold">Saved Portal Logins</h2>
        </div>
        {!adding && !editingDomain && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:border-accent/40 hover:bg-surface transition-colors"
          >
            <Plus size={13} /> Add login
          </button>
        )}
      </div>
      <p className="text-xs text-muted mb-4 flex items-center gap-1.5">
        <ShieldCheck size={12} className="text-emerald-500 shrink-0" />
        Encrypted at rest. The auto-submission agent uses these to sign in for
        you. MFA codes are never stored — you&apos;re prompted when needed.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted py-4">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {creds.length === 0 && !adding && (
            <p className="text-sm text-muted py-2">
              No saved logins yet. Add one here, or save them on the fly during
              a submission.
            </p>
          )}

          {creds.map((c) =>
            editingDomain === c.portalDomain ? (
              <CredForm
                key={c.id}
                initialDomain={c.portalDomain}
                lockDomain
                onDone={() => {
                  setEditingDomain(null);
                  refresh();
                }}
                onCancel={() => setEditingDomain(null)}
              />
            ) : (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 p-3 rounded-xl border border-border bg-surface/50"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Lock
                    size={14}
                    className="text-emerald-600 dark:text-emerald-400 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {c.portalLabel || c.portalDomain}
                    </p>
                    <p className="text-[11px] text-muted">
                      {c.lastUsedAt
                        ? `Last used ${new Date(
                            c.lastUsedAt
                          ).toLocaleDateString()}`
                        : "Not used yet"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEditingDomain(c.portalDomain)}
                    className="px-2 py-1 text-xs font-medium border border-border rounded hover:bg-card transition-colors"
                  >
                    Update
                  </button>
                  <button
                    onClick={() => handleDelete(c.portalDomain)}
                    className="p-1 text-muted hover:text-danger transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          )}

          {adding && (
            <CredForm
              onDone={() => {
                setAdding(false);
                refresh();
              }}
              onCancel={() => setAdding(false)}
            />
          )}
        </div>
      )}
    </section>
  );
}

function CredForm({
  initialDomain = "",
  lockDomain = false,
  onDone,
  onCancel,
}: {
  initialDomain?: string;
  lockDomain?: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [domain, setDomain] = useState(initialDomain);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/app/portal-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalDomain: domain, username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        setSaving(false);
        return;
      }
      onDone();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <div className="p-3 rounded-xl border border-accent/30 bg-accent/5 space-y-2">
      <input
        type="text"
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        readOnly={lockDomain}
        placeholder="Portal domain (e.g. sam.gov, login.gov)"
        className={`w-full px-3 py-2 text-sm bg-card border border-border rounded-md focus:outline-none focus:border-accent ${
          lockDomain ? "opacity-70" : ""
        }`}
      />
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username or email"
        autoComplete="off"
        className="w-full px-3 py-2 text-sm bg-card border border-border rounded-md focus:outline-none focus:border-accent"
      />
      <div className="relative">
        <input
          type={showPass ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="off"
          className="w-full px-3 py-2 pr-9 text-sm bg-card border border-border rounded-md focus:outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => setShowPass((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
          tabIndex={-1}
        >
          {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={!domain || !username || !password || saving}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-md hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : "Save login"}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
