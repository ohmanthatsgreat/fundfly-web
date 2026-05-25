"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2,
  Play,
  XCircle,
  CheckCircle,
  Circle,
  AlertTriangle,
  Globe,
  Lock,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RotateCcw,
  ArrowRight,
  ShieldCheck,
  FileSearch,
  Paperclip,
  Upload,
  X,
  FileText,
} from "lucide-react";
import UpgradeModal from "./UpgradeModal";
import PortalCredentialsPanel from "./PortalCredentialsPanel";

type SubmissionStep = {
  step_number: number;
  portal: string;
  portal_url: string;
  action: string;
  description: string;
  requires_login: boolean;
  prerequisite_step: number | null;
  artifacts_produced: string[];
  artifacts_needed: string[];
  estimated_time: string;
  automatable: boolean;
  notes: string;
};

type PlanData = {
  opportunity_id: string;
  opportunity_title: string;
  total_steps: number;
  estimated_total_time: string;
  portals_involved: string[];
  prerequisites_summary: string;
  steps: SubmissionStep[];
  warnings: string[];
};

type StepStatus =
  | "pending"
  | "running"
  | "waiting_login"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "skipped";

type DiscoveredRequirement = {
  id: string;
  description: string;
  source_portal: string;
  priority: "blocker" | "required" | "optional";
  suggested_action: string;
  step_discovered_at: number;
};

type AgentEvent = {
  type: string;
  step?: SubmissionStep;
  progress?: {
    step_number: number;
    status: StepStatus;
    message: string;
    artifacts_collected?: Record<string, string>;
  };
  portal?: string;
  url?: string;
  description?: string;
  message?: string;
  error?: string;
  artifacts?: Record<string, string>;
  requirements?: DiscoveredRequirement[];
};

type StepAttachment = {
  id: number;
  name: string;
  filename: string;
  fileUrl: string | null;
  stepNumber: number;
  artifactName: string;
  source: string;
  mimeType: string;
};

export default function SubmissionPlanView({
  applicationId,
  onBack,
  hasSections,
  onGenerateSections,
  generatingSections,
}: {
  applicationId: number;
  onBack: () => void;
  hasSections: boolean;
  onGenerateSections: () => void;
  generatingSections: boolean;
}) {
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [planId, setPlanId] = useState<number | null>(null);
  const [planStatus, setPlanStatus] = useState<string>("none");
  const [generating, setGenerating] = useState(false);
  const [stepStatuses, setStepStatuses] = useState<
    Record<number, StepStatus>
  >({});
  const [stepMessages, setStepMessages] = useState<Record<number, string>>(
    {}
  );
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const [waitingInfo, setWaitingInfo] = useState<{
    type: string;
    portal?: string;
    url?: string;
    description?: string;
  } | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(
    new Set()
  );
  const [artifacts, setArtifacts] = useState<Record<string, string>>({});
  const [discoveries, setDiscoveries] = useState<DiscoveredRequirement[]>(
    []
  );
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [showUpgrade, setShowUpgrade] = useState<"checklist" | "auto_submission" | null>(null);
  const [stepAttachments, setStepAttachments] = useState<StepAttachment[]>([]);
  const [uploadingFor, setUploadingFor] = useState<{ step: number; artifact: string } | null>(null);
  const [stepsReady, setStepsReady] = useState<Record<number, boolean>>({});

  const fetchPlan = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/app/submission-plan?application_id=${applicationId}`
      );
      const data = await res.json();
      if (data.plan) {
        setPlanData(data.plan.plan_data);
        setPlanId(data.plan.id);
        setPlanStatus(data.plan.status);
        setArtifacts(data.plan.artifacts || {});
        if (data.plan.artifacts?._steps_ready) {
          try {
            setStepsReady(JSON.parse(data.plan.artifacts._steps_ready));
          } catch {}
        }
      }
    } catch {}
  }, [applicationId]);

  const fetchAttachments = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/app/step-attachments?application_id=${applicationId}`
      );
      const data = await res.json();
      setStepAttachments(
        (data.documents || [])
          .filter((d: StepAttachment) => d.stepNumber && d.artifactName)
      );
    } catch {}
  }, [applicationId]);

  useEffect(() => {
    fetchPlan();
    fetchAttachments();
  }, [fetchPlan, fetchAttachments]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [agentLogs]);

  async function handleAttachFile(
    stepNumber: number,
    artifactName: string,
    file: File
  ) {
    setUploadingFor({ step: stepNumber, artifact: artifactName });

    // For now, store file as a data URL (in production you'd upload to S3/Vercel Blob)
    const reader = new FileReader();
    reader.onload = async () => {
      const fileUrl = reader.result as string;
      try {
        const res = await fetch("/api/app/step-attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            application_id: applicationId,
            step_number: stepNumber,
            artifact_name: artifactName,
            name: artifactName,
            filename: file.name,
            file_url: fileUrl,
            mime_type: file.type || "application/pdf",
            file_size: file.size,
            source: "upload",
          }),
        });
        const data = await res.json();
        if (data.document) {
          setStepAttachments((prev) => [...prev, data.document]);
        }
      } catch {}
      setUploadingFor(null);
    };
    reader.readAsDataURL(file);
  }

  async function handleRemoveAttachment(docId: number) {
    setStepAttachments((prev) => prev.filter((d) => d.id !== docId));
    await fetch("/api/app/step-attachments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_id: docId,
        application_id: applicationId,
      }),
    });
  }

  function getAttachmentForStep(stepNumber: number, artifactName: string) {
    return stepAttachments.find(
      (d) => d.stepNumber === stepNumber && d.artifactName === artifactName
    );
  }

  async function toggleStepReady(stepNumber: number) {
    const updated = { ...stepsReady, [stepNumber]: !stepsReady[stepNumber] };
    setStepsReady(updated);
    // Persist to plan artifacts
    if (planId) {
      await fetch("/api/app/submission-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: applicationId,
          update_artifacts: { _steps_ready: JSON.stringify(updated) },
        }),
      }).catch(() => {});
    }
  }

  const handleGeneratePlan = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/app/submission-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: applicationId }),
      });
      const data = await res.json();
      if (data.error === "subscription_required") {
        setShowUpgrade("checklist");
        setGenerating(false);
        return;
      } else if (data.error) {
        alert(data.error);
      } else {
        setPlanData(data.plan);
        setPlanId(data.plan_id);
        setPlanStatus("pending");
      }
    } catch {
      alert("Failed to generate plan.");
    }
    setGenerating(false);
  };

  const handleStartAgent = async () => {
    if (!planId) return;
    setPlanStatus("running");
    setStepStatuses({});
    setStepMessages({});
    setAgentLogs([]);
    setWaitingInfo(null);
    setDiscoveries([]);

    // Start the agent via our proxy
    const startRes = await fetch("/api/app/submission-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", plan_id: planId }),
    });
    const startData = await startRes.json();
    if (startData.error === "subscription_required") {
      setShowUpgrade("auto_submission");
      setPlanStatus("pending");
      return;
    }

    // Connect to SSE stream via our proxy
    const eventSource = new EventSource(
      `/api/app/submission-agent?plan_id=${planId}`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data) as AgentEvent;

      switch (data.type) {
        case "step_start":
          if (data.progress) {
            setStepStatuses((prev) => ({
              ...prev,
              [data.progress!.step_number]: "running",
            }));
            setStepMessages((prev) => ({
              ...prev,
              [data.progress!.step_number]: data.progress!.message,
            }));
          }
          break;
        case "step_complete":
          if (data.progress) {
            setStepStatuses((prev) => ({
              ...prev,
              [data.progress!.step_number]: "completed",
            }));
            setStepMessages((prev) => ({
              ...prev,
              [data.progress!.step_number]: data.progress!.message,
            }));
            if (data.progress.artifacts_collected) {
              setArtifacts((prev) => ({
                ...prev,
                ...data.progress!.artifacts_collected,
              }));
            }
          }
          break;
        case "step_failed":
          if (data.step) {
            setStepStatuses((prev) => ({
              ...prev,
              [data.step!.step_number]: "failed",
            }));
            setStepMessages((prev) => ({
              ...prev,
              [data.step!.step_number]: data.error || "Failed",
            }));
          }
          break;
        case "waiting_login":
          if (data.step) {
            setStepStatuses((prev) => ({
              ...prev,
              [data.step!.step_number]: "waiting_login",
            }));
          }
          setWaitingInfo({
            type: "login",
            portal: data.portal,
            url: data.url,
          });
          break;
        case "waiting_credentials":
          if (data.step) {
            setStepStatuses((prev) => ({
              ...prev,
              [data.step!.step_number]: "waiting_login",
            }));
          }
          setWaitingInfo({
            type: "credentials",
            portal: data.portal,
            url: data.url,
            description: data.description,
          });
          break;
        case "waiting_mfa":
          if (data.step) {
            setStepStatuses((prev) => ({
              ...prev,
              [data.step!.step_number]: "waiting_login",
            }));
          }
          setWaitingInfo({
            type: "mfa",
            portal: data.portal,
            description: data.description,
          });
          break;
        case "waiting_approval":
          if (data.step) {
            setStepStatuses((prev) => ({
              ...prev,
              [data.step!.step_number]: "waiting_approval",
            }));
          }
          setWaitingInfo({
            type: "approval",
            description: data.description,
          });
          break;
        case "discovery":
          if (data.requirements) {
            setDiscoveries((prev) => {
              const existingIds = new Set(prev.map((d) => d.id));
              const unique = data.requirements!.filter(
                (d) => !existingIds.has(d.id)
              );
              return [...prev, ...unique];
            });
          }
          break;
        case "log":
          setAgentLogs((prev) => [...prev, data.message || ""]);
          break;
        case "plan_complete":
          setPlanStatus("completed");
          if (data.artifacts) setArtifacts(data.artifacts);
          eventSource.close();
          break;
        case "plan_failed":
          setPlanStatus("failed");
          setAgentLogs((prev) => [...prev, `FAILED: ${data.error}`]);
          eventSource.close();
          break;
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };
  };

  const handleResume = async (payload?: Record<string, unknown>) => {
    if (!planId) return;
    setWaitingInfo(null);
    await fetch("/api/app/submission-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "resume",
        plan_id: planId,
        resume_payload: payload,
      }),
    });
  };

  const handleCancel = async () => {
    if (!planId) return;
    await fetch("/api/app/submission-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", plan_id: planId }),
    });
    setPlanStatus("cancelled");
  };

  const toggleStep = (stepNum: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNum)) next.delete(stepNum);
      else next.add(stepNum);
      return next;
    });
  };

  const stepStatusIcon = (status: StepStatus) => {
    switch (status) {
      case "completed":
        return (
          <CheckCircle
            size={16}
            className="text-emerald-600 dark:text-emerald-400"
          />
        );
      case "running":
        return <Loader2 size={16} className="animate-spin text-accent" />;
      case "failed":
        return (
          <XCircle
            size={16}
            className="text-red-600 dark:text-red-400"
          />
        );
      case "waiting_login":
        return (
          <Lock
            size={16}
            className="text-amber-600 dark:text-amber-400"
          />
        );
      case "waiting_approval":
        return (
          <ShieldCheck
            size={16}
            className="text-amber-600 dark:text-amber-400"
          />
        );
      default:
        return <Circle size={16} className="text-muted" />;
    }
  };

  // === RENDER ===

  // No plan yet
  if (!planData && !generating) {
    return (
      <div className="space-y-6">
        <button
          onClick={onBack}
          className="text-sm text-accent hover:text-accent/80 transition-colors"
        >
          &larr; Back to workspace
        </button>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mb-4">
            <Globe size={28} className="text-accent" />
          </div>
          <h3 className="text-base font-semibold mb-2">
            Submission Agent
          </h3>
          <p className="text-sm text-muted max-w-md mb-6">
            The AI will research the submission requirements for this
            opportunity and create a step-by-step plan across all required
            government portals. You&apos;ll review and approve before any
            automation begins.
          </p>
          <button
            onClick={handleGeneratePlan}
            disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all duration-150 disabled:opacity-50"
          >
            <Sparkles size={16} />
            Research Submission Plan
          </button>
        </div>
        {showUpgrade && (
          <UpgradeModal
            feature={showUpgrade}
            onClose={() => setShowUpgrade(null)}
          />
        )}
      </div>
    );
  }

  // Generating plan
  if (generating) {
    return (
      <div className="space-y-6">
        <button
          onClick={onBack}
          className="text-sm text-accent hover:text-accent/80 transition-colors"
        >
          &larr; Back to workspace
        </button>
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-6 flex items-center gap-4">
          <Loader2 size={24} className="animate-spin text-accent" />
          <div>
            <p className="text-sm font-medium">
              Researching submission requirements...
            </p>
            <p className="text-xs text-muted mt-1">
              Claude is analyzing the opportunity type, agency, and
              required portals. This may take 15-30 seconds.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!planData) return null;

  const isRunning = planStatus === "running";
  const isComplete = planStatus === "completed";
  const isFailed = planStatus === "failed";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-sm text-accent hover:text-accent/80 transition-colors"
        >
          &larr; Back to workspace
        </button>
        <div className="flex items-center gap-2">
          {planStatus === "pending" && (
            <button
              onClick={handleStartAgent}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all duration-150"
            >
              <Play size={14} />
              Launch Browser Agent
            </button>
          )}
          {isRunning && !waitingInfo && (
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/80 text-white text-sm font-medium rounded-lg hover:bg-red-500 transition-all duration-150"
            >
              <XCircle size={14} />
              Cancel
            </button>
          )}
          {(isComplete || isFailed || planStatus === "cancelled") && (
            <button
              onClick={handleGeneratePlan}
              className="flex items-center gap-2 px-4 py-2 border border-border text-sm font-medium text-muted hover:text-foreground rounded-lg hover:bg-surface transition-all duration-150"
            >
              <RotateCcw size={14} />
              Regenerate Plan
            </button>
          )}
        </div>
      </div>

      {/* Plan summary */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Submission Plan</h3>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>{planData.total_steps} steps</span>
            <span>{planData.estimated_total_time}</span>
          </div>
        </div>

        <p className="text-sm text-foreground/60">
          {planData.prerequisites_summary}
        </p>

        <div className="flex flex-wrap gap-2">
          {planData.portals_involved.map((portal) => (
            <span
              key={portal}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/20"
            >
              <Globe size={12} />
              {portal}
            </span>
          ))}
        </div>

        {planData.warnings.length > 0 && (
          <div className="space-y-2">
            {planData.warnings.map((warning, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-sm text-amber-700 bg-amber-100 border border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20 rounded-lg px-3 py-2"
              >
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Portal credentials — pre-flight */}
      <PortalCredentialsPanel
        requiredPortals={[
          ...planData.portals_involved,
          ...planData.steps
            .filter((s) => s.requires_login && s.portal)
            .map((s) => s.portal),
          ...discoveries.map((d) => d.source_portal),
        ]}
      />

      {/* Prompt to generate sections if missing */}
      {!hasSections && !isRunning && !isComplete && (
        <div className="bg-accent/5 border border-accent/20 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-accent" />
            <h4 className="text-sm font-semibold">
              Generate Application Content
            </h4>
          </div>
          <p className="text-sm text-foreground/60">
            Before launching the browser agent, generate your application
            content. The agent will use these sections to fill out portal
            forms during submission.
          </p>
          <button
            onClick={onGenerateSections}
            disabled={generatingSections}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all duration-150 disabled:opacity-50"
          >
            {generatingSections ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Generating
                sections...
              </>
            ) : (
              <>
                <Sparkles size={14} /> Generate Application with AI
              </>
            )}
          </button>
        </div>
      )}

      {hasSections && !isRunning && !isComplete && planStatus === "pending" && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-100 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 rounded-xl px-4 py-3">
          <CheckCircle size={16} className="shrink-0" />
          <span>
            Application content is ready. You can launch the browser agent
            to begin submission.
          </span>
        </div>
      )}

      {/* Waiting for user action */}
      {waitingInfo && (
        <WaitingBlock
          waitingInfo={waitingInfo}
          onResume={handleResume}
          onCancel={handleCancel}
        />
      )}

      {/* Discovered requirements */}
      {discoveries.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <FileSearch size={14} className="text-amber-500" />
            <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">
              Discovered Requirements ({discoveries.length})
            </h4>
          </div>
          <div className="p-3 space-y-2">
            {discoveries.map((d) => (
              <div
                key={d.id}
                className={`flex items-start gap-3 text-sm rounded-lg px-3 py-2.5 border ${
                  d.priority === "blocker"
                    ? "bg-red-100 border-red-200 dark:bg-red-500/10 dark:border-red-500/20"
                    : d.priority === "required"
                      ? "bg-amber-100 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20"
                      : "bg-surface border-border"
                }`}
              >
                <AlertTriangle
                  size={14}
                  className={`shrink-0 mt-0.5 ${
                    d.priority === "blocker"
                      ? "text-red-600 dark:text-red-400"
                      : d.priority === "required"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                        d.priority === "blocker"
                          ? "bg-red-200 text-red-800 dark:bg-red-500/25 dark:text-red-300"
                          : d.priority === "required"
                            ? "bg-amber-200 text-amber-800 dark:bg-amber-500/25 dark:text-amber-300"
                            : "bg-surface text-muted"
                      }`}
                    >
                      {d.priority}
                    </span>
                    <span className="text-[10px] text-muted">
                      via {d.source_portal} at step{" "}
                      {d.step_discovered_at}
                    </span>
                  </div>
                  <p
                    className={`text-sm font-medium ${
                      d.priority === "blocker"
                        ? "text-red-900 dark:text-red-100"
                        : d.priority === "required"
                          ? "text-amber-900 dark:text-amber-100"
                          : "text-foreground"
                    }`}
                  >
                    {d.description}
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${
                      d.priority === "blocker"
                        ? "text-red-800/80 dark:text-red-200/80"
                        : d.priority === "required"
                          ? "text-amber-800/80 dark:text-amber-200/80"
                          : "text-muted"
                    }`}
                  >
                    {d.suggested_action}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Steps list */}
      <div className="space-y-2">
        {planData.steps.map((step) => {
          const status = stepStatuses[step.step_number] || "pending";
          const message = stepMessages[step.step_number];
          const isExpanded = expandedSteps.has(step.step_number);
          const isReady = stepsReady[step.step_number] || status === "completed";

          return (
            <div
              key={step.step_number}
              className={`bg-card border rounded-xl overflow-hidden hover:border-accent/15 transition-all duration-200 ${
                isReady ? "border-emerald-200 dark:border-emerald-500/20" : "border-border"
              }`}
            >
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface/50 transition-colors"
                onClick={() => toggleStep(step.step_number)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStepReady(step.step_number);
                  }}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                    isReady
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "border-border hover:border-accent/50"
                  }`}
                  title={isReady ? "Mark as not ready" : "Mark as ready"}
                >
                  {isReady && <CheckCircle size={12} />}
                </button>
                {stepStatusIcon(status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted">
                      Step {step.step_number}
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-surface text-muted">
                      {step.portal}
                    </span>
                    {step.requires_login && (
                      <Lock size={11} className="text-muted" />
                    )}
                    <span className="text-xs text-muted">
                      {step.estimated_time}
                    </span>
                  </div>
                  <p className="text-sm font-medium mt-0.5">
                    {step.action}
                  </p>
                  {message && status !== "pending" && (
                    <p className="text-xs text-muted mt-0.5">{message}</p>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronUp size={16} className="text-muted" />
                ) : (
                  <ChevronDown size={16} className="text-muted" />
                )}
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                  <p className="text-sm text-foreground/60">
                    {step.description}
                  </p>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {step.artifacts_needed.length > 0 && (
                      <div>
                        <span className="font-medium text-muted">
                          Needs:
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {step.artifacts_needed.map((a) => {
                            const attachment = getAttachmentForStep(step.step_number, a);
                            return (
                              <span
                                key={a}
                                className={`px-2 py-0.5 rounded-full border ${
                                  artifacts[a] || attachment
                                    ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20"
                                    : "bg-surface text-muted border-border"
                                }`}
                              >
                                {a}{" "}
                                {(artifacts[a] || attachment) && (
                                  <CheckCircle
                                    size={10}
                                    className="inline"
                                  />
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {step.artifacts_produced.length > 0 && (
                      <div>
                        <span className="font-medium text-muted">
                          Produces:
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {step.artifacts_produced.map((a) => (
                            <span
                              key={a}
                              className={`px-2 py-0.5 rounded-full border ${
                                artifacts[a]
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20"
                                  : "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20"
                              }`}
                            >
                              {a}{" "}
                              {artifacts[a] && `: ${artifacts[a]}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Document attachment slots for auto_submission users */}
                  {step.artifacts_needed.length > 0 && planStatus !== "running" && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
                        <Paperclip size={12} />
                        Attach documents for this step
                      </div>
                      {step.artifacts_needed.map((artifactName) => {
                        const attachment = getAttachmentForStep(
                          step.step_number,
                          artifactName
                        );
                        const isUploading =
                          uploadingFor?.step === step.step_number &&
                          uploadingFor?.artifact === artifactName;

                        return (
                          <div
                            key={artifactName}
                            className="flex items-center gap-2 p-2 rounded-lg border border-border bg-surface/50"
                          >
                            {attachment ? (
                              <>
                                <FileText
                                  size={14}
                                  className="text-emerald-600 dark:text-emerald-400 shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">
                                    {attachment.filename}
                                  </p>
                                  <p className="text-[10px] text-muted">
                                    {artifactName}
                                  </p>
                                </div>
                                <button
                                  onClick={() =>
                                    handleRemoveAttachment(attachment.id)
                                  }
                                  className="p-1 rounded hover:bg-card text-muted hover:text-danger transition-colors"
                                  title="Remove attachment"
                                >
                                  <X size={12} />
                                </button>
                              </>
                            ) : (
                              <>
                                <Upload
                                  size={14}
                                  className="text-muted shrink-0"
                                />
                                <span className="flex-1 text-xs text-muted">
                                  {artifactName}
                                </span>
                                {isUploading ? (
                                  <Loader2
                                    size={14}
                                    className="animate-spin text-accent"
                                  />
                                ) : (
                                  <label className="text-[11px] font-medium text-accent cursor-pointer hover:text-accent/80 transition-colors">
                                    Upload
                                    <input
                                      type="file"
                                      className="hidden"
                                      accept=".pdf,.doc,.docx,.txt,.xlsx,.csv"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          handleAttachFile(
                                            step.step_number,
                                            artifactName,
                                            file
                                          );
                                        }
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {step.notes && (
                    <p className="text-xs text-muted italic">
                      {step.notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Agent logs */}
      {agentLogs.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">
              Agent Log
            </h4>
          </div>
          <div className="px-4 py-3 max-h-48 overflow-y-auto font-mono text-xs space-y-1">
            {agentLogs.map((log, i) => (
              <div
                key={i}
                className={`${
                  log.startsWith("FAILED")
                    ? "text-red-600 dark:text-red-400"
                    : "text-foreground/60"
                }`}
              >
                {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}

      {/* Collected artifacts */}
      {Object.keys(artifacts).length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
            Collected Artifacts
          </h4>
          <div className="space-y-1">
            {Object.entries(artifacts).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-sm">
                <CheckCircle
                  size={14}
                  className="text-emerald-600 dark:text-emerald-400 shrink-0"
                />
                <span className="font-medium">{key}:</span>
                <span className="text-foreground/70">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {showUpgrade && (
        <UpgradeModal
          feature={showUpgrade}
          onClose={() => setShowUpgrade(null)}
        />
      )}
    </div>
  );
}

/**
 * Pause block — renders different forms based on what the agent is waiting for.
 * - "credentials": username/password form (with optional Save for next time)
 * - "mfa": 6-digit code input
 * - "login": legacy manual-login pass-through ("log in separately")
 * - "approval": just Continue/Cancel
 */
function WaitingBlock({
  waitingInfo,
  onResume,
  onCancel,
}: {
  waitingInfo: {
    type: string;
    portal?: string;
    url?: string;
    description?: string;
  };
  onResume: (payload?: Record<string, unknown>) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saveCreds, setSaveCreds] = useState(true);
  const [mfaCode, setMfaCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleSubmitCredentials() {
    if (!username || !password || !waitingInfo.portal) return;
    setSubmitting(true);

    if (saveCreds) {
      // Save encrypted in DB before resuming (best-effort)
      try {
        await fetch("/api/app/portal-credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            portalDomain: waitingInfo.portal,
            username,
            password,
          }),
        });
      } catch {
        // Continue even if save fails — agent still needs creds
      }
    }

    await onResume({ username, password, saved: saveCreds });
  }

  async function handleSubmitMfa() {
    if (!mfaCode) return;
    setSubmitting(true);
    await onResume({ mfa_code: mfaCode });
  }

  if (waitingInfo.type === "credentials") {
    return (
      <div className="bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-amber-600 dark:text-amber-400" />
          <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Login Required: {waitingInfo.portal}
          </h4>
        </div>
        <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
          {waitingInfo.description ||
            `The agent hit a login page on ${waitingInfo.portal}. Enter your credentials below — they'll be encrypted and used only for this submission.`}
        </p>
        <div className="space-y-2">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username or email"
            autoComplete="off"
            disabled={submitting}
            className="w-full px-3 py-2 text-sm bg-card border border-border rounded-md focus:outline-none focus:border-accent"
          />
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="off"
              disabled={submitting}
              className="w-full px-3 py-2 pr-9 text-sm bg-card border border-border rounded-md focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setShowPass((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
              tabIndex={-1}
            >
              {showPass ? "Hide" : "Show"}
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-amber-900/80 dark:text-amber-200/80 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saveCreds}
              onChange={(e) => setSaveCreds(e.target.checked)}
              className="accent-accent"
            />
            Save encrypted for next time (you&apos;ll still be prompted for
            MFA codes)
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSubmitCredentials}
            disabled={!username || !password || submitting}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ArrowRight size={14} />
            )}
            Submit & Continue
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-surface transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (waitingInfo.type === "mfa") {
    return (
      <div className="bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-amber-600 dark:text-amber-400" />
          <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Two-Factor Code Required
          </h4>
        </div>
        <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
          {waitingInfo.description ||
            `${waitingInfo.portal || "The portal"} is asking for a verification code. Check your phone or authenticator app and enter the code below.`}
        </p>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={mfaCode}
          onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
          placeholder="123456"
          maxLength={8}
          autoFocus
          disabled={submitting}
          className="w-full px-3 py-2.5 text-lg font-mono tracking-widest text-center bg-card border border-border rounded-md focus:outline-none focus:border-accent"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleSubmitMfa}
            disabled={!mfaCode || submitting}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {submitting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ArrowRight size={14} />
            )}
            Submit Code
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-surface transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Fall through to legacy login or approval blocks
  return (
    <div className="bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 rounded-xl p-5 space-y-3">
      {waitingInfo.type === "login" ? (
        <>
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-amber-600 dark:text-amber-400" />
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Login Required
            </h4>
          </div>
          <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
            The agent needs you to log in to{" "}
            <strong>{waitingInfo.portal}</strong>. Since the browser runs on
            our server, please log in separately and click &quot;Continue&quot;
            when ready.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <ShieldCheck
              size={18}
              className="text-amber-600 dark:text-amber-400"
            />
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Approval Required
            </h4>
          </div>
          <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
            {waitingInfo.description ||
              "The agent is about to perform a submission action. Please review and confirm."}
          </p>
        </>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onResume()}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all"
        >
          <ArrowRight size={14} />
          Continue
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-surface transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
