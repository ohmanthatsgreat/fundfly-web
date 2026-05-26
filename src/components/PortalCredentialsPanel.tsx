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
  ExternalLink,
} from "lucide-react";

/**
 * Normalize a planner-supplied portal name into a clean domain.
 * Planner sometimes returns:
 *   "Zeffy"          → "zeffy.com"
 *   "www.sam.gov"    → "sam.gov"
 *   "https://sam.gov/login" → "sam.gov"
 *   "n/a" / "TBD"    → null (filtered out)
 *   "the agency's website" → null (no dot, not in the alias list)
 */
function normalizePortal(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.toLowerCase().trim();
  if (!s) return null;

  // Strip noise
  const noise = new Set([
    "n/a",
    "na",
    "none",
    "tbd",
    "unknown",
    "tba",
    "the agency's website",
    "agency website",
    "agency's website",
    "program officer",
    "various",
    "multiple",
  ]);
  if (noise.has(s)) return null;

  // Extract from URL if given
  if (s.startsWith("http")) {
    try {
      s = new URL(s).hostname;
    } catch {
      // fall through
    }
  }
  // Strip protocol + paths if regex above didn't catch them
  s = s.replace(/^https?:\/\//, "").split("/")[0];
  // Strip www.
  s = s.replace(/^www\./, "");

  // Known plain-name → canonical domain map (planner often drops the TLD)
  const ALIASES: Record<string, string> = {
    zeffy: "zeffy.com",
    "sam": "sam.gov",
    "grants": "grants.gov",
    "login": "login.gov",
    nspires: "nspires.nasaprs.com",
    "era commons": "era.nih.gov",
    eracommons: "era.nih.gov",
    "nih era": "era.nih.gov",
    dsip: "dsip.dtic.mil",
    submittable: "submittable.com",
    zoomgrants: "zoomgrants.com",
    fluxx: "fluxx.io",
  };
  if (ALIASES[s]) return ALIASES[s];

  // Require a TLD: must contain a dot AND that dot is followed by 2+ letters
  // (rejects "the agency", "program officer", etc.)
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return null;

  return s;
}

/**
 * Known portal signup URLs. The agent doesn't navigate users here — these
 * are surfaced as helper links so users who don't already have accounts can
 * sign up before adding credentials.
 *
 * Keys must be the same normalized lowercase domains used by the planner
 * (and matched against `requiredPortals` upstream).
 */
const SIGNUP_URLS: Record<string, string> = {
  "sam.gov": "https://sam.gov/content/home",
  "login.gov": "https://secure.login.gov/sign_up/enter_email",
  "grants.gov": "https://apply07.grants.gov/apply/register.faces",
  "simpler.grants.gov": "https://simpler.grants.gov/",
  "era.nih.gov": "https://public.era.nih.gov/commonsplus/public/login/newAccount.era",
  "nspires.nasaprs.com": "https://nspires.nasaprs.com/external/aboutRegistration.do",
  "dsip.dtic.mil": "https://www.dodsbirsttr.mil/submissions/login",
  "fluxx.io": "https://www.fluxx.io/",
  "submittable.com": "https://www.submittable.com/sign-up",
  "zoomgrants.com": "https://www.zoomgrants.com/welcome.asp?action=public",
};

/** Display label for the link — falls back to the domain itself. */
function getPortalLabel(domain: string): string {
  const map: Record<string, string> = {
    "sam.gov": "SAM.gov",
    "login.gov": "Login.gov",
    "grants.gov": "Grants.gov",
    "simpler.grants.gov": "Simpler.Grants.gov",
    "era.nih.gov": "NIH eRA Commons",
    "nspires.nasaprs.com": "NASA NSPIRES",
    "dsip.dtic.mil": "DoD DSIP",
    "submittable.com": "Submittable",
    "zoomgrants.com": "ZoomGrants",
  };
  return map[domain] || domain;
}

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

  // Normalize + filter junk + dedupe. Planner output is messy (aliases,
  // missing TLDs, placeholder strings like "TBD") — see normalizePortal.
  const portals = Array.from(
    new Set(
      requiredPortals
        .map((p) => normalizePortal(p))
        .filter((p): p is string => p !== null)
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
            {getPortalLabel(domain)}
          </span>
          {savedCred && (
            <span className="text-[10px] text-muted">
              saved
              {savedCred.lastUsedAt
                ? ` • last used ${new Date(savedCred.lastUsedAt).toLocaleDateString()}`
                : ""}
            </span>
          )}
          {!savedCred && SIGNUP_URLS[domain] && (
            <a
              href={SIGNUP_URLS[domain]}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1 text-[10px] text-accent hover:underline"
              title={`Create an account on ${getPortalLabel(domain)}`}
            >
              No account? Create one
              <ExternalLink size={9} />
            </a>
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
            Encrypted with AES-256-GCM. Used only by auto-submission when it
            hits a login page on this domain.
          </p>
        </div>
      )}
    </div>
  );
}
