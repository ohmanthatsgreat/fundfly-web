"use client";

import { useState, useEffect } from "react";
import { UserCircle, Loader2, Save, CheckCircle, Sparkles } from "lucide-react";

type Field = {
  key: string;
  label: string;
  type: string;
  options?: string[];
  placeholder?: string;
};

type FieldGroup = {
  title: string;
  fields: Field[];
};

const FIELD_GROUPS: FieldGroup[] = [
  {
    title: "Basic Information",
    fields: [
      { key: "fullName", label: "Full Name", type: "text" },
      { key: "email", label: "Email", type: "email" },
      { key: "phone", label: "Phone", type: "tel" },
      { key: "dateOfBirth", label: "Date of Birth", type: "date" },
      {
        key: "citizenship",
        label: "Citizenship Status",
        type: "select",
        options: ["US Citizen", "Permanent Resident", "DACA", "Visa Holder", "Other"],
      },
    ],
  },
  {
    title: "Address",
    fields: [
      { key: "address", label: "Street Address", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "state", label: "State", type: "text" },
      { key: "zip", label: "ZIP Code", type: "text" },
    ],
  },
  {
    title: "Demographics",
    fields: [
      {
        key: "veteranStatus",
        label: "Veteran Status",
        type: "select",
        options: ["Not a Veteran", "Veteran", "Active Duty", "Reserve/National Guard", "Spouse of Veteran"],
      },
      {
        key: "disabilityStatus",
        label: "Disability Status",
        type: "select",
        options: ["No Disability", "Has Disability", "Prefer Not to Say"],
      },
      {
        key: "gender",
        label: "Gender",
        type: "select",
        options: ["Male", "Female", "Non-Binary", "Prefer Not to Say"],
      },
      {
        key: "raceEthnicity",
        label: "Race/Ethnicity",
        type: "select",
        options: [
          "White",
          "Black/African American",
          "Hispanic/Latino",
          "Asian",
          "Native American/Alaska Native",
          "Native Hawaiian/Pacific Islander",
          "Two or More Races",
          "Prefer Not to Say",
        ],
      },
    ],
  },
  {
    title: "Financial & Household",
    fields: [
      {
        key: "householdSize",
        label: "Household Size",
        type: "select",
        options: ["1", "2", "3", "4", "5", "6", "7", "8+"],
      },
      {
        key: "annualIncome",
        label: "Annual Household Income",
        type: "select",
        options: [
          "Under $25,000",
          "$25,000 - $50,000",
          "$50,000 - $75,000",
          "$75,000 - $100,000",
          "$100,000 - $150,000",
          "Over $150,000",
          "Prefer Not to Say",
        ],
      },
      {
        key: "employmentStatus",
        label: "Employment Status",
        type: "select",
        options: ["Employed Full-Time", "Employed Part-Time", "Self-Employed", "Unemployed", "Student", "Retired", "Disabled"],
      },
      {
        key: "housingStatus",
        label: "Housing Status",
        type: "select",
        options: ["Homeowner", "Renter", "Living with Family", "Experiencing Homelessness", "Other"],
      },
    ],
  },
  {
    title: "Education",
    fields: [
      {
        key: "educationLevel",
        label: "Highest Education Level",
        type: "select",
        options: [
          "Less than High School",
          "High School/GED",
          "Some College",
          "Associate Degree",
          "Bachelor's Degree",
          "Master's Degree",
          "Doctorate/Professional",
          "Trade/Vocational",
        ],
      },
      { key: "fieldOfStudy", label: "Field of Study", type: "text" },
      { key: "currentSchool", label: "Current School (if applicable)", type: "text" },
    ],
  },
  {
    title: "Skills & Interests",
    fields: [
      { key: "skills", label: "Skills & Qualifications", type: "textarea" },
      { key: "interests", label: "Areas of Interest for Funding", type: "textarea" },
    ],
  },
  {
    title: "About You (used by AI to write personal applications)",
    fields: [
      {
        key: "bio",
        label: "Short Bio",
        type: "textarea",
        placeholder:
          "A few sentences about who you are, where you're from, what you do, and what drives you.",
      },
      {
        key: "personalMission",
        label: "Personal Mission or Cause",
        type: "textarea",
        placeholder:
          "What matters most to you? What change do you want to make through your work?",
      },
      {
        key: "projectGoals",
        label: "Project / Career Goals",
        type: "textarea",
        placeholder:
          "What are you working on or hoping to accomplish in the next 1–3 years?",
      },
      {
        key: "intendedUseOfFunds",
        label: "How You'd Use Grant Funds",
        type: "textarea",
        placeholder:
          "Be specific: materials, tuition, equipment, studio space, living expenses while working on a project, etc.",
      },
      {
        key: "pastAchievements",
        label: "Past Achievements, Awards, or Recognition",
        type: "textarea",
        placeholder:
          "Awards, exhibitions, publications, scholarships, completed projects — anything that demonstrates your track record.",
      },
      {
        key: "portfolioLinks",
        label: "Portfolio / Sample Work Links",
        type: "textarea",
        placeholder:
          "URLs to your website, portfolio, GitHub, behance, published articles, social channels, etc. One per line.",
      },
    ],
  },
];

export default function PersonalProfilePage() {
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [enhancing, setEnhancing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/app/personal-profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) setProfile(data.profile);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleChange = (key: string, value: string) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleEnhance = async (key: string) => {
    const value = profile[key];
    if (!value || value.trim().length < 10) return;
    setEnhancing(key);
    try {
      const res = await fetch("/api/app/ai-enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: key, value }),
      });
      const data = await res.json();
      if (data.enhanced) handleChange(key, data.enhanced);
    } catch {}
    setEnhancing(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/app/personal-profile", {
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

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center">
            <UserCircle size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Personal Profile</h1>
            <p className="text-xs text-muted">
              Used to match you with personal grant opportunities
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

      {/* Field Groups */}
      {FIELD_GROUPS.map((group) => (
        <section
          key={group.title}
          className="bg-card border border-border rounded-xl p-5 space-y-4"
        >
          <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider">
            {group.title}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {group.fields.map((field) => (
              <div
                key={field.key}
                className={field.type === "textarea" ? "col-span-2" : ""}
              >
                {field.type === "textarea" ? (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-medium text-muted uppercase tracking-wider">
                        {field.label}
                      </label>
                      {profile[field.key]?.trim().length >= 10 && (
                        <button
                          onClick={() => handleEnhance(field.key)}
                          disabled={enhancing === field.key}
                          className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
                        >
                          {enhancing === field.key ? (
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
                      value={profile[field.key] || ""}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      rows={3}
                      className={inputClass + " resize-none"}
                    />
                  </div>
                ) : field.type === "select" ? (
                  <>
                    <label className="text-[11px] font-medium text-muted uppercase tracking-wider block mb-1.5">
                      {field.label}
                    </label>
                    <select
                      value={profile[field.key] || ""}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select...</option>
                      {field.options!.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <label className="text-[11px] font-medium text-muted uppercase tracking-wider block mb-1.5">
                      {field.label}
                    </label>
                    <input
                      type={field.type}
                      value={profile[field.key] || ""}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className={inputClass}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
