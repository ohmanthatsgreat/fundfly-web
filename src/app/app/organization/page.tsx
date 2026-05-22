"use client";

import { useState, useEffect } from "react";
import { Building2, Loader2, Save } from "lucide-react";

const fields = [
  { key: "orgName", label: "Organization Name", type: "text" },
  { key: "orgType", label: "Organization Type", type: "select", options: ["LLC", "Corporation", "Nonprofit", "Sole Proprietorship", "Partnership", "Other"] },
  { key: "ein", label: "EIN", type: "text", placeholder: "XX-XXXXXXX" },
  { key: "uei", label: "UEI (SAM.gov)", type: "text" },
  { key: "samRegistered", label: "SAM.gov Registered", type: "checkbox" },
  { key: "address", label: "Address", type: "text" },
  { key: "city", label: "City", type: "text" },
  { key: "state", label: "State", type: "text" },
  { key: "zip", label: "ZIP Code", type: "text" },
  { key: "contactName", label: "Contact Name", type: "text" },
  { key: "contactEmail", label: "Contact Email", type: "email" },
  { key: "contactPhone", label: "Contact Phone", type: "tel" },
  { key: "website", label: "Website", type: "url" },
  { key: "naicsCodes", label: "NAICS Codes", type: "text", placeholder: "Comma-separated" },
  { key: "missionStatement", label: "Mission Statement", type: "textarea" },
  { key: "productsServices", label: "Products / Services", type: "textarea" },
  { key: "areasOfExpertise", label: "Areas of Expertise", type: "textarea" },
  { key: "certifications", label: "Certifications", type: "text", placeholder: "e.g., 8(a), HUBZone, WOSB" },
  { key: "pastGrantExperience", label: "Past Grant Experience", type: "textarea" },
  { key: "annualRevenue", label: "Annual Revenue", type: "text" },
  { key: "employeeCount", label: "Number of Employees", type: "text" },
  { key: "yearFounded", label: "Year Founded", type: "text" },
  { key: "geographicFocus", label: "Geographic Focus", type: "text" },
];

export default function OrganizationPage() {
  const [profile, setProfile] = useState<Record<string, string | boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/app/profile");
        const data = await res.json();
        if (data.profile) setProfile(data.profile);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/app/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Organization Profile</h1>
          <p className="text-sm text-muted mt-1">
            Used for AI matching against business grants
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? "Saved!" : "Save Profile"}
        </button>
      </div>

      <div className="space-y-5">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium mb-1.5">
              {field.label}
            </label>
            {field.type === "textarea" ? (
              <textarea
                value={(profile[field.key] as string) || ""}
                onChange={(e) =>
                  setProfile({ ...profile, [field.key]: e.target.value })
                }
                rows={3}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-none"
              />
            ) : field.type === "select" ? (
              <select
                value={(profile[field.key] as string) || ""}
                onChange={(e) =>
                  setProfile({ ...profile, [field.key]: e.target.value })
                }
                className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 appearance-none"
              >
                <option value="">Select...</option>
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : field.type === "checkbox" ? (
              <input
                type="checkbox"
                checked={!!profile[field.key]}
                onChange={(e) =>
                  setProfile({ ...profile, [field.key]: e.target.checked })
                }
                className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
              />
            ) : (
              <input
                type={field.type}
                value={(profile[field.key] as string) || ""}
                onChange={(e) =>
                  setProfile({ ...profile, [field.key]: e.target.value })
                }
                placeholder={field.placeholder}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
