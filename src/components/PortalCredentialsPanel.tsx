"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Lock,
  CheckCircle2,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type SavedCred = {
  id: number;
  portalDomain: string;
  portalLabel: string | null;
  lastUsedAt: string | null;
};

/**
 * Pre-flight credential panel.
 * Lists the portals this submission plan touches, shows which have saved creds,
 * and lets the user add/update/remove credentials inline.
 *
 * Generic — works for any portal domain (sam.gov, grants.gov, login.gov, foundation portals, etc.).
 */
export default function PortalCredentialsPanel({
  requiredPortals,
}: {
  /** Domains the agent will need to log into. Normalized lowercase (e.g. "sam.gov"). */
  requiredPortals: string[];
}) {
  const [saved, setSaved] = useState<SavedCred[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingDomain, setEditingDomain] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/app/portal-credentials");
      const data = await res.json();
      setSaved(data.credentials || []);
    } catch {
      // ignore — empty state is fine
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Dedupe + normalize portal list
  const portals = Array.from(
    new Set(
      requiredPortals
        .map((p) => p.toLowerCase().trim())
        .filter((p) => p && p !== "n/a")
    )
  );

  if (portals.length === 0) return null;

  const savedCount = portals.filter((p) =>
    saved.some((s) => s.portalDomain === p)
  ).length;
  const allSaved = savedCount === portals.length;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full px-4 py-3 border-b border-border flex items-center justify-between hover:bg-surface/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Lock size={14} className="text-accent" />
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">
            Portal Logins
          </h4>
          <span
            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
              allSaved
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
            }`}
          >
            {savedCount} / {portals.length} saved
          </span>
        </div>
        {collapsed ? (
          <ChevronDown size={14} className="text-muted" />
        ) : (
          <ChevronUp size={14} className="text-muted" />
        )}
      </button>

      {!collapsed && (
        <div className="p-3 space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted py-2">
              <Loader2 size={14} className="animate-spin" />
              Loading saved credentials...
            </div>
          ) : (
            <>
              <p className="text-xs text-muted mb-2">
                Save credentials so the agent can log in automatically. MFA codes
                are never stored — you&apos;ll be prompted when needed.
              </p>
              {portals.map((domain) => {
                const savedCred = saved.find((s) => s.portalDomain === domain);
                const isEditing = editingDomain === domain;

                return (
                  <PortalRow
                    key={domain}
                    domain={domain}
                    savedCred={savedCred}
                    isEditing={isEditing}
                    onStartEdit={() => setEditingDomain(domain)}
                    onCancelEdit={() => setEditingDomain(null)}
                    onSaved={() => {
                      setEditingDomain(null);
                      refresh();
                    }}
                    onDeleted={() => refresh()}
                  />
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PortalRow({
  domain,
  savedCred,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSaved,
  onDeleted,
}: {
  domain: string;
  savedCred: SavedCred | undefined;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/app/portal-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portalDomain: domain,
          username,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        setSaving(false);
        return;
      }
      setUsername("");
      setPassword("");
      onSaved();
    } catch {
      setError("Network error");
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm(`Remove saved credentials for ${domain}?`)) return;
    await fetch(
      `/api/app/portal-credentials?portalDomain=${encodeURIComponent(domain)}`,
      { method: "DELETE" }
    );
    onDeleted();
  }

  return (
    <div className="bg-surface/50 border border-border rounded-lg p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {savedCred ? (
            <CheckCircle2
              size={14}
              className="text-emerald-600 dark:text-emerald-400 shrink-0"
            />
          ) : (
            <Lock size={14} className="text-muted shrink-0" />
          )}
          <span className="text-sm font-medium text-foreground truncate">
            {domain}
          </span>
          {savedCred && (
            <span className="text-[10px] text-muted">
              saved
              {savedCred.lastUsedAt
                ? ` • last used ${new Date(savedCred.lastUsedAt).toLocaleDateString()}`
                : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!isEditing && (
            <button
              onClick={onStartEdit}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium border border-border rounded hover:bg-card transition-colors"
            >
              {savedCred ? "Update" : <><Plus size={11} /> Add</>}
            </button>
          )}
          {savedCred && !isEditing && (
            <button
              onClick={handleDelete}
              className="p-1 text-muted hover:text-red-500 transition-colors"
              title="Remove"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 space-y-2">
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
          {error && (
            <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!username || !password || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-md hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                "Save credentials"
              )}
            </button>
            <button
              onClick={() => {
                setUsername("");
                setPassword("");
                setError(null);
                onCancelEdit();
              }}
              className="px-3 py-1.5 text-xs font-medium border border-border rounded-md hover:bg-card transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="text-[10px] text-muted leading-relaxed">
            Encrypted with AES-256-GCM. Used only by the submission agent when it
            hits a login page on this domain.
          </p>
        </div>
      )}
    </div>
  );
}
