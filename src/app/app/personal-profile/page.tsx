"use client";

import { useState, useEffect } from "react";
import { UserCircle, Loader2, Save } from "lucide-react";

const fields = [
  { key: "fullName", label: "Full Name", type: "text" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "address", label: "Address", type: "text" },
  { key: "city", label: "City", type: "text" },
  { key: "state", label: "State", type: "text" },
  { key: "zip", label: "ZIP Code", type: "text" },
  { key: "citizenship", label: "Citizenship", type: "text" },
  { key: "veteranStatus", label: "Veteran Status", type: "select", options: ["Not a veteran", "Veteran", "Active duty", "Reserve/Guard", "Spouse of veteran"] },
  { key: "gender", label: "Gender", type: "select", options: ["Male", "Female", "Non-binary", "Prefer not to say"] },
  { key: "raceEthnicity", label: "Race / Ethnicity", type: "text" },
  { key: "householdSize", label: "Household Size", type: "text" },
  { key: "annualIncome", label: "Annual Household Income", type: "text" },
  { key: "employmentStatus", label: "Employment Status", type: "select", options: ["Employed", "Self-employed", "Unemployed", "Student", "Retired", "Other"] },
  { key: "educationLevel", label: "Education Level", type: "select", options: ["High school", "Some college", "Associate", "Bachelor's", "Master's", "Doctorate", "Professional"] },
  { key: "fieldOfStudy", label: "Field of Study", type: "text" },
  { key: "currentSchool", label: "Current School", type: "text" },
  { key: "skills", label: "Skills / Expertise", type: "textarea" },
  { key: "interests", label: "Interests", type: "textarea" },
  { key: "housingStatus", label: "Housing Status", type: "select", options: ["Own", "Rent", "Unhoused", "Other"] },
];

export default function PersonalProfilePage() {
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/app/personal-profile");
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
      await fetch("/api/app/personal-profile", {
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
          <h1 className="text-2xl font-bold">Personal Profile</h1>
          <p className="text-sm text-muted mt-1">
            Used for AI matching against personal grants
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
                value={profile[field.key] || ""}
                onChange={(e) =>
                  setProfile({ ...profile, [field.key]: e.target.value })
                }
                rows={3}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-none"
              />
            ) : field.type === "select" ? (
              <select
                value={profile[field.key] || ""}
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
            ) : (
              <input
                type={field.type}
                value={profile[field.key] || ""}
                onChange={(e) =>
                  setProfile({ ...profile, [field.key]: e.target.value })
                }
                className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
