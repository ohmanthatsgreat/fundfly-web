"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  CheckCircle,
  Circle,
  RefreshCw,
  ExternalLink,
  Download,
  ChevronDown,
  ChevronUp,
  FileText,
  Globe,
} from "lucide-react";
import SubmissionPlanView from "./SubmissionPlanView";
import UpgradeModal from "./UpgradeModal";

type Section = {
  id: number;
  sectionKey: string;
  sectionTitle: string;
  content: string;
  sortOrder: number;
  completed: boolean;
};

type AppData = {
  id: number;
  opportunityId: string;
  status: string;
  title: string;
  agency: string | null;
  type: string;
  fundingMin: number | null;
  fundingMax: number | null;
  deadline: string | null;
  sourceUrl: string | null;
  sections: Section[];
};

const STATUS_OPTIONS = [
  "draft",
  "in_progress",
  "ready_to_submit",
  "submitted",
  "under_review",
  "awarded",
  "declined",
];

function statusLabel(s: string) {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ApplicationWorkspace({
  applicationId,
  onBack,
}: {
  applicationId: number;
  onBack: () => void;
}) {
  const [app, setApp] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [showSubmission, setShowSubmission] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const fetchApp = useCallback(async () => {
    try {
      // Fetch the application
      const appRes = await fetch(`/api/app/applications?id=${applicationId}`);
      const appData = await appRes.json();
      if (!appData.application) {
        setLoading(false);
        return;
      }

      // Fetch sections
      const secRes = await fetch(
        `/api/app/application-sections?application_id=${applicationId}`
      );
      const secData = await secRes.json();

      // Fetch opportunity details for title/agency/deadline
      const oppRes = await fetch(
        `/api/app/opportunities/${appData.application.opportunityId}`
      );
      const oppData = await oppRes.json();
      const opp = oppData.opportunity || {};

      setApp({
        id: appData.application.id,
        opportunityId: appData.application.opportunityId,
        status: appData.application.status,
        title: opp.title || `Application ${applicationId}`,
        agency: opp.agency || null,
        type: opp.type || "grant",
        fundingMin: opp.fundingMin || null,
        fundingMax: opp.fundingMax || null,
        deadline: opp.deadline || null,
        sourceUrl: opp.sourceUrl || null,
        sections: (secData.sections || []).sort(
          (a: Section, b: Section) => a.sortOrder - b.sortOrder
        ),
      });
    } catch {}
    setLoading(false);
  }, [applicationId]);

  useEffect(() => {
    fetchApp();
  }, [fetchApp]);

  const handleGenerateAll = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/app/application-sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: applicationId,
          action: "generate_all",
        }),
      });
      const data = await res.json();
      if (data.error === "subscription_required") {
        setShowUpgrade(true);
        setGenerating(false);
        return;
      } else if (data.error) {
        alert(data.error);
      } else if (data.sections) {
        setApp((prev) =>
          prev
            ? {
                ...prev,
                sections: data.sections.sort(
                  (a: Section, b: Section) => a.sortOrder - b.sortOrder
                ),
                status: "in_progress",
              }
            : prev
        );
      }
    } catch {
      alert("Failed to generate sections. Please try again.");
    }
    setGenerating(false);
  };

  const handleRegenerateSection = async (sectionKey: string) => {
    setRegenerating(sectionKey);
    try {
      const res = await fetch("/api/app/application-sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: applicationId,
          action: "regenerate_section",
          section_key: sectionKey,
        }),
      });
      const data = await res.json();
      if (data.content && app) {
        setApp({
          ...app,
          sections: app.sections.map((s) =>
            s.sectionKey === sectionKey ? { ...s, content: data.content } : s
          ),
        });
      }
    } catch {}
    setRegenerating(null);
  };

  const handleToggleComplete = async (section: Section) => {
    if (!app) return;
    const newCompleted = !section.completed;
    setApp({
      ...app,
      sections: app.sections.map((s) =>
        s.id === section.id ? { ...s, completed: newCompleted } : s
      ),
    });
    try {
      await fetch("/api/app/application-sections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_id: section.id,
          completed: newCompleted,
        }),
      });
    } catch {}
  };

  const handleStartEdit = (section: Section) => {
    setEditingSection(section.sectionKey);
    setEditContent(section.content);
    setExpandedSection(section.sectionKey);
  };

  const handleSaveEdit = async (section: Section) => {
    setSaving(true);
    try {
      await fetch("/api/app/application-sections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_id: section.id, content: editContent }),
      });
      if (app) {
        setApp({
          ...app,
          sections: app.sections.map((s) =>
            s.id === section.id ? { ...s, content: editContent } : s
          ),
        });
      }
    } catch {}
    setEditingSection(null);
    setSaving(false);
  };

  const handleExport = () => {
    if (!app) return;
    const content = app.sections
      .map((s) => `# ${s.sectionTitle}\n\n${s.content}`)
      .join("\n\n---\n\n");

    const header = `${app.title}\n${"=".repeat(app.title.length)}\nAgency: ${app.agency || "N/A"}\nDeadline: ${app.deadline || "N/A"}\n\n---\n\n`;
    const full = header + content;

    const blob = new Blob([full], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `application-${app.opportunityId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpdateStatus = async (status: string) => {
    if (!app) return;
    setApp({ ...app, status });
    try {
      await fetch("/api/app/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: applicationId, status }),
      });
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-muted" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <FileText size={32} className="text-muted mb-3" />
        <p className="text-sm text-muted">Application not found</p>
        <button
          onClick={onBack}
          className="mt-4 text-sm text-accent hover:underline"
        >
          Go back
        </button>
      </div>
    );
  }

  const completedCount = app.sections.filter((s) => s.completed).length;
  const totalSections = app.sections.length;
  const hasSections = totalSections > 0;
  const progress =
    totalSections > 0
      ? Math.round((completedCount / totalSections) * 100)
      : 0;

  // Submission agent view
  if (showSubmission) {
    return (
      <SubmissionPlanView
        applicationId={applicationId}
        onBack={() => setShowSubmission(false)}
        hasSections={hasSections}
        onGenerateSections={handleGenerateAll}
        generatingSections={generating}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-surface text-muted hover:text-foreground transition-all"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold truncate">{app.title}</h2>
          <div className="flex items-center gap-3 text-xs text-muted mt-0.5">
            {app.agency && <span>{app.agency}</span>}
            {app.deadline && (
              <span>Due {new Date(app.deadline).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={app.status}
          onChange={(e) => handleUpdateStatus(e.target.value)}
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>

        {!hasSections && (
          <button
            onClick={handleGenerateAll}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all duration-150 disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Generating all
                sections...
              </>
            ) : (
              <>
                <Sparkles size={14} /> Generate Application with AI
              </>
            )}
          </button>
        )}

        {hasSections && (
          <>
            <button
              onClick={handleGenerateAll}
              disabled={generating}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border text-muted hover:text-foreground rounded-lg hover:bg-surface hover:border-border transition-all duration-150 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Regenerating...
                </>
              ) : (
                <>
                  <RefreshCw size={14} /> Regenerate All
                </>
              )}
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border text-muted hover:text-foreground rounded-lg hover:bg-surface hover:border-border transition-all duration-150"
            >
              <Download size={14} /> Export
            </button>
            {app.sourceUrl && (
              <a
                href={app.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border text-muted hover:text-foreground rounded-lg hover:bg-surface hover:border-border transition-all duration-150"
              >
                <ExternalLink size={14} /> Submit on Portal
              </a>
            )}
            <button
              onClick={() => setShowSubmission(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-lg hover:opacity-90 transition-all duration-150"
            >
              <Globe size={14} /> Submit via Agent
            </button>
          </>
        )}
      </div>

      {/* Generation progress */}
      {generating && (
        <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 flex items-center gap-3">
          <Loader2 size={18} className="animate-spin text-accent" />
          <div>
            <p className="text-sm font-medium">
              AI is writing your application...
            </p>
            <p className="text-xs text-muted mt-0.5">
              This may take 30-60 seconds. Claude is generating all 8 sections
              tailored to this opportunity and your org profile.
            </p>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {hasSections && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted shrink-0 tabular-nums">
            {completedCount}/{totalSections} complete
          </span>
        </div>
      )}

      {/* Empty state */}
      {!hasSections && !generating && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-xl bg-surface flex items-center justify-center mb-4">
            <FileText size={24} className="text-muted" />
          </div>
          <h3 className="text-sm font-semibold mb-1">No sections yet</h3>
          <p className="text-sm text-muted max-w-sm mb-4">
            Click &quot;Generate Application with AI&quot; to create all
            application sections using your organization profile and the
            opportunity details.
          </p>
          <button
            onClick={() => setShowSubmission(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border text-muted hover:text-foreground rounded-lg hover:bg-surface transition-all duration-150"
          >
            <Globe size={14} /> Research Submission Plan
          </button>
        </div>
      )}

      {/* Sections list */}
      {hasSections && (
        <div className="space-y-2">
          {app.sections.map((section) => {
            const isExpanded = expandedSection === section.sectionKey;
            const isEditing = editingSection === section.sectionKey;
            const isRegen = regenerating === section.sectionKey;

            return (
              <div
                key={section.id}
                className="bg-card border border-border rounded-xl overflow-hidden hover:border-accent/15 transition-all duration-200"
              >
                {/* Section header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface/50 transition-colors"
                  onClick={() =>
                    setExpandedSection(isExpanded ? null : section.sectionKey)
                  }
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleComplete(section);
                    }}
                    className="shrink-0"
                  >
                    {section.completed ? (
                      <CheckCircle
                        size={16}
                        className="text-emerald-600 dark:text-emerald-400"
                      />
                    ) : (
                      <Circle size={16} className="text-muted" />
                    )}
                  </button>
                  <span
                    className={`flex-1 text-sm font-medium ${
                      section.completed
                        ? "text-muted line-through"
                        : "text-foreground/90"
                    }`}
                  >
                    {section.sectionTitle}
                  </span>
                  {section.content && (
                    <span className="text-[11px] text-muted tabular-nums shrink-0">
                      {section.content.split(/\s+/).filter(Boolean).length} words
                    </span>
                  )}
                  {isExpanded ? (
                    <ChevronUp size={14} className="text-muted" />
                  ) : (
                    <ChevronDown size={14} className="text-muted" />
                  )}
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                    {/* Edit/Regen controls */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          isEditing
                            ? handleSaveEdit(section)
                            : handleStartEdit(section)
                        }
                        disabled={saving}
                        className="text-xs font-medium text-accent hover:text-accent/80 transition-colors"
                      >
                        {saving
                          ? "Saving..."
                          : isEditing
                            ? "Save Changes"
                            : "Edit"}
                      </button>
                      {isEditing && (
                        <button
                          onClick={() => setEditingSection(null)}
                          className="text-xs font-medium text-muted hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={() =>
                          handleRegenerateSection(section.sectionKey)
                        }
                        disabled={isRegen}
                        className="flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground transition-colors disabled:opacity-50 ml-auto"
                      >
                        {isRegen ? (
                          <>
                            <Loader2 size={11} className="animate-spin" />{" "}
                            Regenerating...
                          </>
                        ) : (
                          <>
                            <Sparkles size={11} /> Regenerate
                          </>
                        )}
                      </button>
                    </div>

                    {/* Content area */}
                    {isEditing ? (
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={12}
                        className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent/40 focus:border-accent/40 leading-relaxed"
                      />
                    ) : (
                      <div className="text-sm text-foreground/60 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                        {section.content || (
                          <span className="text-muted italic">
                            No content yet. Click &quot;Regenerate&quot; to
                            generate.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {showUpgrade && (
        <UpgradeModal
          feature="submissions"
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </div>
  );
}
