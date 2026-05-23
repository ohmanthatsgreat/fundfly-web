"use client";

import { useState, useEffect } from "react";
import { Building2, Loader2, Save, CheckCircle, Sparkles } from "lucide-react";

const ORG_TYPES = [
  "Small Business",
  "Nonprofit",
  "State/Local Government",
  "Educational Institution",
  "Tribal Government",
  "Individual",
  "For-Profit (Other than Small Business)",
  "Other",
];

const CERTIFICATIONS = [
  "8(a) Business Development",
  "HUBZone",
  "Women-Owned Small Business (WOSB)",
  "Service-Disabled Veteran-Owned (SDVOSB)",
  "Economically Disadvantaged WOSB (EDWOSB)",
  "Small Disadvantaged Business (SDB)",
  "Minority-Owned Business",
  "Veteran-Owned Small Business (VOSB)",
];

const TRL_LEVELS = [
  "TRL 1 — Basic Research",
  "TRL 2 — Technology Concept",
  "TRL 3 — Proof of Concept",
  "TRL 4 — Lab Validation",
  "TRL 5 — Lab-Scale Prototype",
  "TRL 6 — Prototype Demo",
  "TRL 7 — System Prototype",
  "TRL 8 — Qualified System",
  "TRL 9 — Operational",
];

const REVENUE_RANGES = [
  "Under $100K",
  "$100K - $500K",
  "$500K - $1M",
  "$1M - $5M",
  "$5M - $25M",
  "$25M - $100M",
  "$100M+",
];

const EMPLOYEE_RANGES = ["1-5", "6-25", "26-100", "101-500", "501+"];

type Profile = Record<string, string | boolean | null>;

export default function OrganizationPage() {
  const [profile, setProfile] = useState<Profile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [enhancing, setEnhancing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/app/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) setProfile(data.profile);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const update = (key: string, value: string | boolean | null) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleEnhance = async (key: string) => {
    const value = profile[key];
    if (!value || typeof value !== "string" || value.trim().length < 10) return;
    setEnhancing(key);
    try {
      const res = await fetch("/api/app/ai-enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: key, value }),
      });
      const data = await res.json();
      if (data.enhanced) update(key, data.enhanced);
    } catch {}
    setEnhancing(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/app/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  const inputClass =
    "w-full px-3 py-2.5 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 transition-all placeholder:text-muted/40";
  const labelClass =
    "text-[11px] font-medium text-muted uppercase tracking-wider block mb-1.5";

  const certList = ((profile.certifications as string) || "").split(", ").filter(Boolean);

  return (
    <div className="p-6 max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Building2 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Organization Profile</h1>
            <p className="text-xs text-muted">
              The more detail you provide, the better AI can match you with relevant funding
            </p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
            saved
              ? "bg-emerald-500 text-white"
              : "bg-accent text-white hover:bg-accent/90"
          } disabled:opacity-50`}
        >
          {saved ? (
            <>
              <CheckCircle size={15} />
              Saved!
            </>
          ) : saving ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={15} />
              Save Profile
            </>
          )}
        </button>
      </div>

      {/* Organization */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider">
          Organization
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>Organization Name</label>
            <input
              type="text"
              value={(profile.orgName as string) || ""}
              onChange={(e) => update("orgName", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Organization Type</label>
            <select
              value={(profile.orgType as string) || ""}
              onChange={(e) => update("orgType", e.target.value)}
              className={inputClass}
            >
              <option value="">Select type</option>
              {ORG_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Website</label>
            <input
              type="url"
              value={(profile.website as string) || ""}
              onChange={(e) => update("website", e.target.value)}
              placeholder="https://"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Year Founded</label>
            <input
              type="text"
              value={(profile.yearFounded as string) || ""}
              onChange={(e) => update("yearFounded", e.target.value)}
              placeholder="2020"
              maxLength={4}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Annual Revenue</label>
            <select
              value={(profile.annualRevenue as string) || ""}
              onChange={(e) => update("annualRevenue", e.target.value)}
              className={inputClass}
            >
              <option value="">Select range</option>
              {REVENUE_RANGES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Employees</label>
            <select
              value={(profile.employeeCount as string) || ""}
              onChange={(e) => update("employeeCount", e.target.value)}
              className={inputClass}
            >
              <option value="">Select range</option>
              {EMPLOYEE_RANGES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Geographic Focus</label>
            <input
              type="text"
              value={(profile.geographicFocus as string) || ""}
              onChange={(e) => update("geographicFocus", e.target.value)}
              placeholder="National, California, Northeast US"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* About Your Organization */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider">
          About Your Organization
        </h3>
        <div className="space-y-4">
          {(
            [
              {
                key: "missionStatement",
                label: "Mission Statement",
                rows: 3,
                placeholder: "Briefly describe your organization's mission and purpose",
              },
              {
                key: "productsServices",
                label: "Products & Services",
                rows: 3,
                placeholder: "What products or services does your organization offer?",
              },
              {
                key: "areasOfExpertise",
                label: "Areas of Expertise",
                rows: 2,
                placeholder: "Key competencies, research areas, or technical capabilities",
              },
              {
                key: "pastGrantExperience",
                label: "Past Grant / Funding Experience",
                rows: 3,
                placeholder:
                  "List any previous grants received, SBIR/STTR awards, or relevant funding history",
              },
            ] as const
          ).map(({ key, label, rows, placeholder }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-medium text-muted uppercase tracking-wider">
                  {label}
                </label>
                {typeof profile[key] === "string" &&
                  (profile[key] as string).trim().length >= 10 && (
                    <button
                      onClick={() => handleEnhance(key)}
                      disabled={enhancing === key}
                      className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
                    >
                      {enhancing === key ? (
                        <>
                          <Loader2 size={11} className="animate-spin" /> Enhancing...
                        </>
                      ) : (
                        <>
                          <Sparkles size={11} /> Enhance
                        </>
                      )}
                    </button>
                  )}
              </div>
              <textarea
                value={(profile[key] as string) || ""}
                onChange={(e) => update(key, e.target.value)}
                rows={rows}
                placeholder={placeholder}
                className={inputClass + " resize-none"}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Certifications & Readiness */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider">
          Certifications & Readiness
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>Certifications (select all that apply)</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {CERTIFICATIONS.map((cert) => {
                const checked = certList.includes(cert);
                return (
                  <label
                    key={cert}
                    className="flex items-center gap-2 cursor-pointer text-sm text-foreground/70 hover:text-foreground transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = checked
                          ? certList.filter((c) => c !== cert)
                          : [...certList, cert];
                        update("certifications", next.filter(Boolean).join(", ") || "");
                      }}
                      className="w-4 h-4 rounded border-border text-accent focus:ring-accent/20 accent-accent"
                    />
                    {cert}
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <label className={labelClass}>Technology Readiness Level</label>
            <select
              value={(profile.technologyReadinessLevel as string) || ""}
              onChange={(e) => update("technologyReadinessLevel", e.target.value)}
              className={inputClass}
            >
              <option value="">Select TRL</option>
              {TRL_LEVELS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Registration */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider">
          Registration
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>EIN</label>
            <input
              type="text"
              value={(profile.ein as string) || ""}
              onChange={(e) => update("ein", e.target.value)}
              placeholder="XX-XXXXXXX"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>UEI (SAM.gov)</label>
            <input
              type="text"
              value={(profile.uei as string) || ""}
              onChange={(e) => update("uei", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>NAICS Codes</label>
            <input
              type="text"
              value={(profile.naicsCodes as string) || ""}
              onChange={(e) => update("naicsCodes", e.target.value)}
              placeholder="541511, 541512"
              className={inputClass}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!profile.samRegistered}
                onChange={(e) => update("samRegistered", e.target.checked)}
                className="w-4 h-4 rounded border-border text-accent focus:ring-accent/20 accent-accent"
              />
              <span className="text-sm text-foreground/70">Registered on SAM.gov</span>
            </label>
          </div>
        </div>
      </section>

      {/* Address */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider">
          Address
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>Street Address</label>
            <input
              type="text"
              value={(profile.address as string) || ""}
              onChange={(e) => update("address", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>City</label>
            <input
              type="text"
              value={(profile.city as string) || ""}
              onChange={(e) => update("city", e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>State</label>
              <input
                type="text"
                value={(profile.state as string) || ""}
                onChange={(e) => update("state", e.target.value)}
                placeholder="CA"
                maxLength={2}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>ZIP</label>
              <input
                type="text"
                value={(profile.zip as string) || ""}
                onChange={(e) => update("zip", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Primary Contact */}
      <section className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider">
          Primary Contact
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Full Name</label>
            <input
              type="text"
              value={(profile.contactName as string) || ""}
              onChange={(e) => update("contactName", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={(profile.contactEmail as string) || ""}
              onChange={(e) => update("contactEmail", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input
              type="tel"
              value={(profile.contactPhone as string) || ""}
              onChange={(e) => update("contactPhone", e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
