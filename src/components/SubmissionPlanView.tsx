"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2,
  Play,
  Pause,
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
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Mail,
  Send,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import UpgradeModal from "./UpgradeModal";
import PortalCredentialsPanel from "./PortalCredentialsPanel";
import { trackAction } from "@/lib/track";

/** Two short beeps via Web Audio (no asset needed) to alert the user the
 *  agent is waiting on them — works even when the tab is in the background. */
function playAlertSound() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const beep = (at: number, freq: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.32);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.34);
    };
    beep(0, 880);
    beep(0.4, 1100);
  } catch {
    // Audio may be blocked until a user gesture — non-fatal.
  }
}

/** Fire a desktop notification (if permitted) + the alert sound. */
function alertAgentNeedsYou(description: string, soundOn: boolean) {
  if (soundOn) playAlertSound();
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification("FundFly — the agent needs you", {
        body: description || "Your input is required to continue the submission.",
        icon: "/icon.png",
        tag: "fundfly-agent",
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    }
  } catch {
    // ignore
  }
}

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
  eligibility_assessment?: {
    status: "likely_eligible" | "check_required" | "likely_ineligible";
    summary: string;
  } | null;
  submission_method?: "portal" | "email" | "mail" | "mixed";
  submission_email?: string | null;
  submission_email_draft?: { subject: string; body: string } | null;
  submission_mailing_address?: string | null;
  submission_notes?: string | null;
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
  /** base64 JPEG of the page the agent currently sees (screenshot events). */
  data?: string;
  step_number?: number;
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
  const [planError, setPlanError] = useState<string | null>(null);
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
  // Desktop notification + sound when the agent pauses for the user.
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevWaitingRef = useRef<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(
    new Set()
  );

  // Fire an alert on the rising edge of "agent needs you" (waitingInfo goes
  // from null → set), so the user is pinged even if they're in another tab.
  useEffect(() => {
    const now = waitingInfo?.type ?? null;
    if (now && !prevWaitingRef.current && notifyEnabled) {
      alertAgentNeedsYou(waitingInfo?.description || "", soundEnabled);
    }
    prevWaitingRef.current = now;
  }, [waitingInfo, notifyEnabled, soundEnabled]);

  const enableNotifications = useCallback(async () => {
    if (!("Notification" in window)) {
      setNotifyEnabled(true); // sound-only fallback
      return;
    }
    if (Notification.permission === "granted") {
      setNotifyEnabled(true);
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifyEnabled(perm === "granted" || true); // keep sound even if denied
  }, []);
  const [artifacts, setArtifacts] = useState<Record<string, string>>({});
  const [discoveries, setDiscoveries] = useState<DiscoveredRequirement[]>(
    []
  );
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [showUpgrade, setShowUpgrade] = useState<"checklist" | "auto_submission" | null>(null);
  const [stepAttachments, setStepAttachments] = useState<StepAttachment[]>([]);
  const [uploadingFor, setUploadingFor] = useState<{ step: number; artifact: string } | null>(null);
  const [stepsReady, setStepsReady] = useState<Record<number, boolean>>({});
  // Agent notes per step (blockers/required/optional discovered during a run),
  // persisted in the plan artifacts so they survive after the run ends.
  const [persistedStepNotes, setPersistedStepNotes] = useState<
    Record<string, { text: string; kind: string }[]>
  >({});
  // Live agent view: most recent screenshot + which step it belongs to.
  const [liveScreenshot, setLiveScreenshot] = useState<string | null>(null);
  const [liveStep, setLiveStep] = useState<number | null>(null);
  const [attachingApp, setAttachingApp] = useState(false);
  // User-initiated pause (distinct from the input pauses in waitingInfo).
  const [userPaused, setUserPaused] = useState(false);
  const [pausePending, setPausePending] = useState(false);
  // Take-control (interactive browser): forward clicks/keys to the live page.
  const [takeControl, setTakeControl] = useState(false);
  const [typeText, setTypeText] = useState("");
  const [sendingInteraction, setSendingInteraction] = useState(false);
  const [dismissedDiscoveries, setDismissedDiscoveries] = useState<Set<string>>(
    new Set()
  );

  const sendInteraction = useCallback(
    async (interaction: Record<string, unknown>) => {
      if (!planId) return;
      setSendingInteraction(true);
      try {
        await fetch("/api/app/submission-agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "interact",
            plan_id: planId,
            interaction,
          }),
        });
        // The worker streams a fresh screenshot back over SSE automatically.
      } catch {
        // non-fatal
      }
      setSendingInteraction(false);
    },
    [planId]
  );

  const handleLiveClick = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (!takeControl) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const xPct = (e.clientX - rect.left) / rect.width;
      const yPct = (e.clientY - rect.top) / rect.height;
      sendInteraction({ kind: "click", xPct, yPct });
    },
    [takeControl, sendInteraction]
  );

  // Native wheel scroll inside the live view (debounced so we don't flood the
  // worker with one round-trip per wheel tick).
  const wheelAccum = useRef(0);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLiveWheel = useCallback(
    (e: React.WheelEvent<HTMLImageElement>) => {
      if (!takeControl) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      wheelAccum.current += e.deltaY / Math.max(rect.height, 1);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        const dyPct = Math.max(-1, Math.min(1, wheelAccum.current));
        wheelAccum.current = 0;
        if (dyPct !== 0) sendInteraction({ kind: "scroll", dyPct });
      }, 200);
    },
    [takeControl, sendInteraction]
  );

  // Native typing inside the live view: printable chars → type, control keys →
  // key. Lets the user type directly into the agent's browser when in control.
  const handleLiveKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLImageElement>) => {
      if (!takeControl) return;
      const controlKeys: Record<string, string> = {
        Enter: "Enter",
        Tab: "Tab",
        Backspace: "Backspace",
        Escape: "Escape",
        ArrowUp: "ArrowUp",
        ArrowDown: "ArrowDown",
        ArrowLeft: "ArrowLeft",
        ArrowRight: "ArrowRight",
        Delete: "Delete",
      };
      if (controlKeys[e.key]) {
        e.preventDefault();
        sendInteraction({ kind: "key", key: controlKeys[e.key] });
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        sendInteraction({ kind: "type", text: e.key });
      }
    },
    [takeControl, sendInteraction]
  );

  // Ref to the live agent panel so we can snap to it when the agent starts.
  const livePanelRef = useRef<HTMLDivElement | null>(null);

  // Has the generated application been registered as an agent-uploadable doc?
  const generatedAppAttached = stepAttachments.some(
    (a) => a.source === "ai_generated" && a.artifactName === "Full Application"
  );

  async function handleAttachGeneratedApp() {
    setAttachingApp(true);
    try {
      const res = await fetch("/api/app/attach-generated-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: applicationId }),
      });
      const data = await res.json();
      if (data.document) {
        setStepAttachments((prev) => [...prev, data.document]);
      }
    } catch {
      // non-fatal — user can retry
    }
    setAttachingApp(false);
  }

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
        if (data.plan.artifacts?._step_notes) {
          try {
            setPersistedStepNotes(
              JSON.parse(data.plan.artifacts._step_notes)
            );
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

  // Snap the live agent panel into view when the agent starts running or pauses
  // for the user — so they don't have to hunt/scroll for it.
  useEffect(() => {
    if (planStatus === "running" || waitingInfo) {
      livePanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [planStatus, waitingInfo]);

  // Persist discoveries as per-step notes so they survive after the run.
  // Merges live discoveries into the persisted map (dedup by text) and writes
  // back to the plan artifacts.
  useEffect(() => {
    if (discoveries.length === 0 || !planId) return;
    setPersistedStepNotes((prev) => {
      const next: Record<string, { text: string; kind: string }[]> = {
        ...prev,
      };
      let changed = false;
      for (const d of discoveries) {
        const key = String(d.step_discovered_at);
        const list = next[key] ? [...next[key]] : [];
        if (!list.some((n) => n.text === d.description)) {
          list.push({ text: d.description, kind: d.priority });
          next[key] = list;
          changed = true;
        }
      }
      if (changed) {
        // Best-effort persist; ignore failures.
        fetch("/api/app/submission-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            application_id: applicationId,
            update_artifacts: { _step_notes: JSON.stringify(next) },
          }),
        }).catch(() => {});
      }
      return changed ? next : prev;
    });
  }, [discoveries, planId, applicationId]);

  // All notes for a step — persisted plus any live discoveries not yet saved.
  const notesForStep = (stepNum: number): { text: string; kind: string }[] => {
    const out = [...(persistedStepNotes[String(stepNum)] || [])];
    for (const d of discoveries) {
      if (
        d.step_discovered_at === stepNum &&
        !out.some((n) => n.text === d.description)
      ) {
        out.push({ text: d.description, kind: d.priority });
      }
    }
    return out;
  };

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
    trackAction("create_checklist", { applicationId });
    setGenerating(true);
    setPlanError(null);
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
        setPlanError(data.error);
      } else {
        setPlanData(data.plan);
        setPlanId(data.plan_id);
        setPlanStatus("pending");
      }
    } catch {
      setPlanError(
        "We couldn't build the submission plan this time. Please try again in a moment."
      );
    }
    setGenerating(false);
  };

  const handleStartAgent = async () => {
    if (!planId) return;
    trackAction("start_auto_submit", { planId, applicationId });
    setPlanStatus("running");
    setStepStatuses({});
    setStepMessages({});
    setAgentLogs([]);
    setWaitingInfo(null);
    setDiscoveries([]);
    setLiveScreenshot(null);
    setLiveStep(null);
    setTakeControl(false);
    setTypeText("");
    setUserPaused(false);
    setPausePending(false);

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
            setLiveStep(data.progress.step_number);
          }
          break;
        case "screenshot":
          if (data.data) {
            setLiveScreenshot(data.data);
            if (typeof data.step_number === "number") {
              setLiveStep(data.step_number);
            }
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
        case "waiting_step_failed":
          setWaitingInfo({
            type: "step_failed",
            description: data.error,
          });
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
        case "waiting_interaction":
          if (data.step) {
            setStepStatuses((prev) => ({
              ...prev,
              [data.step!.step_number]: "waiting_approval",
            }));
          }
          setWaitingInfo({
            type: "interaction",
            description: data.description,
          });
          // Auto-enable take-control so the user can act immediately.
          setTakeControl(true);
          break;
        case "waiting_paused":
          // User-requested pause took effect at a checkpoint.
          setUserPaused(true);
          setPausePending(false);
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
    setUserPaused(false);
    setPausePending(false);
    setTakeControl(false);
    setTypeText("");
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

  const handlePause = async () => {
    if (!planId) return;
    setPausePending(true);
    await fetch("/api/app/submission-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause", plan_id: planId }),
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
            Pre-Submission Checklist
          </h3>
          <p className="text-sm text-muted max-w-md mb-6">
            The AI will research the requirements for this opportunity and
            build a step-by-step checklist of everything you need to submit —
            documents, registrations, eligibility checks, and the portals
            involved. You&apos;ll review the full list before any automation
            begins.
          </p>
          <button
            onClick={handleGeneratePlan}
            disabled={generating}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all duration-150 disabled:opacity-50"
          >
            <Sparkles size={16} />
            {planError ? "Try Again" : "Create Pre-Submission Checklist"}
          </button>
          {planError && (
            <div className="mt-4 max-w-md flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 border border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20 rounded-lg px-3 py-2.5">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{planError}</span>
            </div>
          )}
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
              Building your pre-submission checklist…
            </p>
            <p className="text-xs text-muted mt-1">
              Claude is analyzing the opportunity, eligibility rules, and
              every portal involved. This usually takes 30 seconds to 5
              minutes depending on opportunity complexity.
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
  const visibleDiscoveries = discoveries.filter(
    (d) => !dismissedDiscoveries.has(d.id)
  );
  const submissionMethod = planData.submission_method || "portal";
  const isOnlineSubmission =
    submissionMethod === "portal" || submissionMethod === "mixed";
  // The agent can be (re)started whenever it isn't actively running or already
  // finished — i.e. pending, failed, or cancelled all allow a start/retry.
  const canStartAgent = !isRunning && !isComplete && isOnlineSubmission;
  const isRetry = isFailed || planStatus === "cancelled";

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
          {canStartAgent && (
            <button
              onClick={handleStartAgent}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow-md hover:brightness-105 transition-all duration-150"
              title="Runs in the background on our servers — no visible browser window will open on your computer"
            >
              <Play size={14} />
              {isRetry ? "Retry Auto-Submission" : "Start Auto-Submission"}
            </button>
          )}
          {!isRunning && !isComplete && !isOnlineSubmission && (
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all duration-150"
            >
              <ArrowRight size={14} />
              Back to Workspace to Download
            </button>
          )}
          {/* Run controls (Pause / Resume / Cancel) now live below the live
              browser window — see the control bar in the agent panel. */}
          {(isComplete || isFailed || planStatus === "cancelled") && (
            <button
              onClick={handleGeneratePlan}
              className="flex items-center gap-2 px-4 py-2 border border-border text-sm font-medium text-muted hover:text-foreground rounded-lg hover:bg-surface transition-all duration-150"
              title="Re-run the AI research to rebuild the checklist from scratch"
            >
              <RotateCcw size={14} />
              Regenerate Plan
            </button>
          )}
        </div>
      </div>

      {/* Submission method banner — only show when not portal-only */}
      {(submissionMethod === "email" ||
        submissionMethod === "mail" ||
        submissionMethod === "mixed") && (
        <div
          className={`rounded-xl p-4 border flex items-start gap-3 ${
            submissionMethod === "mixed"
              ? "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20"
              : "bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/20"
          }`}
        >
          <FileText
            size={18}
            className={
              submissionMethod === "mixed"
                ? "text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                : "text-blue-600 dark:text-blue-400 shrink-0 mt-0.5"
            }
          />
          <div className="space-y-1 text-sm">
            <h4
              className={`font-semibold ${
                submissionMethod === "mixed"
                  ? "text-amber-900 dark:text-amber-200"
                  : "text-blue-900 dark:text-blue-200"
              }`}
            >
              {submissionMethod === "email" && "This grant is submitted by email"}
              {submissionMethod === "mail" && "This grant is submitted by mail"}
              {submissionMethod === "mixed" &&
                "This grant has online + email/mail components"}
            </h4>
            <p
              className={
                submissionMethod === "mixed"
                  ? "text-amber-900/80 dark:text-amber-200/80"
                  : "text-blue-900/80 dark:text-blue-200/80"
              }
            >
              {planData.submission_notes ||
                (submissionMethod === "email"
                  ? "Download a formatted DOCX of your application from the workspace, then email it to the recipient below."
                  : submissionMethod === "mail"
                    ? "Download a formatted DOCX of your application, print it, and mail it to the address below."
                    : "Some parts are online (auto-submission can help); other parts must be emailed or mailed manually.")}
            </p>
            {planData.submission_email && (
              <p className="text-xs">
                <span className="text-muted">Send to:</span>{" "}
                <a
                  href={`mailto:${planData.submission_email}`}
                  className="font-mono text-accent hover:underline"
                >
                  {planData.submission_email}
                </a>
              </p>
            )}
            {planData.submission_mailing_address && (
              <p className="text-xs">
                <span className="text-muted">Mail to:</span>{" "}
                <span className="font-mono">
                  {planData.submission_mailing_address}
                </span>
              </p>
            )}
            <p className="text-xs text-muted mt-1">
              Use the &ldquo;Download DOCX&rdquo; button on your application
              workspace to generate the formatted file.
            </p>
          </div>
        </div>
      )}

      {/* Email compose — draft a cover email and send it from the user's own
          inbox (Option B). Only when this grant takes an email submission and
          we know the recipient. */}
      {(submissionMethod === "email" || submissionMethod === "mixed") &&
        planData.submission_email && (
          <EmailSubmissionPanel
            recipient={planData.submission_email}
            subject={
              planData.submission_email_draft?.subject ||
              `Application: ${planData.opportunity_title}`
            }
            body={
              planData.submission_email_draft?.body ||
              `Dear Program Officer,\n\nPlease find our completed application for "${planData.opportunity_title}" attached.\n\nThank you for your consideration.\n\nBest regards,`
            }
            onGoToWorkspace={onBack}
          />
        )}

      {/* Eligibility verdict — surfaced upfront so the user knows before
          spending time submitting (e.g. a small biz vs an academic-only grant). */}
      {planData.eligibility_assessment &&
        planData.eligibility_assessment.status !== "likely_eligible" && (
          <div
            className={`rounded-xl p-4 border flex items-start gap-3 ${
              planData.eligibility_assessment.status === "likely_ineligible"
                ? "bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/20"
                : "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20"
            }`}
          >
            <AlertTriangle
              size={18}
              className={`shrink-0 mt-0.5 ${
                planData.eligibility_assessment.status === "likely_ineligible"
                  ? "text-red-600 dark:text-red-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            />
            <div>
              <h4
                className={`text-sm font-semibold ${
                  planData.eligibility_assessment.status === "likely_ineligible"
                    ? "text-red-900 dark:text-red-200"
                    : "text-amber-900 dark:text-amber-200"
                }`}
              >
                {planData.eligibility_assessment.status === "likely_ineligible"
                  ? "Eligibility concern — review before submitting"
                  : "Eligibility — please verify"}
              </h4>
              <p
                className={`text-sm mt-0.5 ${
                  planData.eligibility_assessment.status === "likely_ineligible"
                    ? "text-red-900/80 dark:text-red-200/80"
                    : "text-amber-900/80 dark:text-amber-200/80"
                }`}
              >
                {planData.eligibility_assessment.summary}
              </p>
            </div>
          </div>
        )}

      {/* Stage progress — makes the 3-step sequence explicit */}
      <StageStepper
        checklistDone={true}
        applicationDone={hasSections}
        submitDone={isComplete}
        submitActive={isRunning}
        isOnlineSubmission={isOnlineSubmission}
      />

      {/* DO THIS FIRST — generate application content. Surfaced right under the
          stepper so it's the obvious next action before anything else. */}
      {!hasSections && !isRunning && !isComplete && (
        <div className="bg-gradient-to-br from-accent/10 to-purple-500/5 border-2 border-accent/30 rounded-xl p-5 space-y-3 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent text-white">
              Do this first
            </span>
            <h4 className="text-sm font-semibold">
              Generate your application content
            </h4>
          </div>
          <p className="text-sm text-foreground/70">
            Start here — generate your application content before auto-submission.
            The agent uses these sections to fill out portal forms. (You can
            still edit everything in the workspace afterward.)
          </p>
          <button
            onClick={() => {
              trackAction("generate_application", { applicationId });
              onGenerateSections();
            }}
            disabled={generatingSections}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-semibold rounded-lg shadow-sm hover:shadow-md hover:brightness-105 transition-all duration-150 disabled:opacity-50"
          >
            {generatingSections ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Generating
                sections…
              </>
            ) : (
              <>
                <Sparkles size={14} /> Generate Application with AI
              </>
            )}
          </button>
        </div>
      )}

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

      {hasSections && canStartAgent && (
        <div className="bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 rounded-xl px-4 py-4">
          <div className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">
                {isRetry
                  ? "Ready to try again."
                  : "Everything's ready — let the agent take it from here."}
              </p>
              <p className="text-xs mt-1 text-emerald-700/80 dark:text-emerald-300/80">
                {isRetry
                  ? "Your last run didn't finish. You can restart the agent without rebuilding the checklist. "
                  : ""}
                The browser runs in the background on our servers — you
                don&apos;t need to keep this tab open or watch for any popup.
                You&apos;ll see live progress here, and we&apos;ll pause for
                your approval before anything is submitted.
              </p>

              {/* Make the generated proposal a file the agent can upload */}
              <div className="mt-3 pt-3 border-t border-emerald-200/60 dark:border-emerald-500/20">
                {generatedAppAttached ? (
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <FileText size={13} className="shrink-0" />
                    Generated application attached — the agent will upload it
                    where a proposal is required.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleAttachGeneratedApp}
                      disabled={attachingApp}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      {attachingApp ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Paperclip size={13} />
                      )}
                      {attachingApp
                        ? "Attaching…"
                        : "Attach application for the agent to upload"}
                    </button>
                    <span className="text-[11px] text-emerald-700/70 dark:text-emerald-300/70">
                      Adds your generated proposal as a DOCX the agent can submit.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Prominent primary CTA so it's never missed */}
          <button
            onClick={handleStartAgent}
            className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-semibold rounded-lg shadow-sm hover:shadow-md hover:brightness-105 transition-all duration-150"
          >
            <Play size={16} />
            {isRetry ? "Retry Auto-Submission" : "Start Auto-Submission"}
          </button>
        </div>
      )}

      {/* Live agent activity — what the agent sees + where it needs you.
          Persists after the run ends (while logs exist) so all browser
          activity stays in this single panel. */}
      {(isRunning || waitingInfo || agentLogs.length > 0) && (
        <div
          ref={livePanelRef}
          className="bg-card border-2 border-accent/30 rounded-xl overflow-hidden shadow-sm scroll-mt-4"
        >
          <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-accent/5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    waitingInfo || userPaused
                      ? "bg-amber-400 animate-ping"
                      : isRunning
                        ? "bg-emerald-400 animate-ping"
                        : "bg-transparent"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    waitingInfo || userPaused
                      ? "bg-amber-500"
                      : isRunning
                        ? "bg-emerald-500"
                        : "bg-muted"
                  }`}
                />
              </span>
              <h4 className="text-sm font-semibold">
                {waitingInfo
                  ? "Agent needs you"
                  : userPaused
                    ? "Agent paused"
                    : isRunning
                      ? "Agent working…"
                      : "Agent activity"}
              </h4>
            </div>
            <div className="flex items-center gap-3">
              {/* Notify-me toggle (desktop notification + sound) */}
              <button
                onClick={() =>
                  notifyEnabled ? setNotifyEnabled(false) : enableNotifications()
                }
                title={
                  notifyEnabled
                    ? "Alerts on — you'll be notified when the agent needs you"
                    : "Get a desktop notification + sound when the agent needs you"
                }
                className={`flex items-center gap-1 text-xs transition-colors ${
                  notifyEnabled
                    ? "text-accent"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {notifyEnabled ? <Bell size={13} /> : <BellOff size={13} />}
                <span className="hidden sm:inline">
                  {notifyEnabled ? "Alerts on" : "Alert me"}
                </span>
              </button>
              {notifyEnabled && (
                <button
                  onClick={() => setSoundEnabled((s) => !s)}
                  title={soundEnabled ? "Sound on" : "Sound off"}
                  className="text-muted hover:text-foreground transition-colors"
                >
                  {soundEnabled ? (
                    <Volume2 size={13} />
                  ) : (
                    <VolumeX size={13} />
                  )}
                </button>
              )}
              {liveStep !== null && (
                <button
                  onClick={() => {
                    toggleStep(liveStep);
                    document
                      .getElementById(`step-${liveStep}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  className="text-xs text-accent hover:underline"
                >
                  Jump to Step {liveStep} →
                </button>
              )}
            </div>
          </div>

          {/* Latest screenshot — what the headless browser currently sees.
              In take-control mode it becomes an interactive surface: clicks +
              keystrokes are forwarded to the live page. */}
          {liveScreenshot ? (
            <div
              className={`relative bg-black/5 dark:bg-black/20 overflow-auto ${
                takeControl ? "max-h-[70vh]" : "max-h-[460px]"
              }`}
            >
              {/* Image is rendered at natural aspect (w-full, h-auto) — NOT
                  object-contain — so the element box exactly matches the
                  screenshot pixels. That makes click→percentage mapping
                  accurate (object-contain letterboxing would offset clicks). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/jpeg;base64,${liveScreenshot}`}
                alt="What the agent currently sees"
                tabIndex={takeControl ? 0 : -1}
                onClick={handleLiveClick}
                onWheel={handleLiveWheel}
                onKeyDown={handleLiveKeyDown}
                className={`w-full h-auto block outline-none ${
                  takeControl
                    ? "cursor-crosshair ring-2 ring-inset ring-accent focus:ring-4"
                    : ""
                }`}
              />
              <span className="sticky bottom-2 float-right mr-2 text-[10px] font-medium px-2 py-1 rounded bg-black/60 text-white">
                {takeControl ? "You're in control · click the page" : "Live view"}
                {liveStep !== null ? ` · Step ${liveStep}` : ""}
              </span>
              {sendingInteraction && (
                <span className="sticky top-2 float-left ml-2 flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded bg-black/60 text-white">
                  <Loader2 size={10} className="animate-spin" /> working…
                </span>
              )}
            </div>
          ) : (
            <div className="px-4 py-8 flex flex-col items-center justify-center text-center text-muted">
              <Loader2 size={22} className="animate-spin mb-2 text-accent" />
              <p className="text-xs">
                Starting the browser… the agent runs on our servers, so
                there&apos;s no window to watch — its view will appear here.
              </p>
            </div>
          )}

          {/* Run controls — Pause / Resume / Cancel, right under the browser
              window for easy reach during a run. */}
          {(isRunning || userPaused) && (
            <div className="px-4 py-2.5 border-t border-border flex items-center gap-2 bg-surface/30">
              {userPaused ? (
                <>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Paused
                  </span>
                  <button
                    onClick={() => handleResume()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
                  >
                    <Play size={13} /> Resume
                  </button>
                </>
              ) : (
                !waitingInfo && (
                  <button
                    onClick={handlePause}
                    disabled={pausePending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-card transition-colors disabled:opacity-60"
                  >
                    {pausePending ? (
                      <>
                        <Loader2 size={13} className="animate-spin" /> Pausing…
                      </>
                    ) : (
                      <>
                        <Pause size={13} /> Pause
                      </>
                    )}
                  </button>
                )
              )}
              <button
                onClick={handleCancel}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-danger hover:bg-danger/10 transition-colors"
              >
                <XCircle size={13} /> Cancel
              </button>
            </div>
          )}

          {/* Take-control bar — available whenever the agent is paused (input
              pause OR user pause). Lets a human solve captchas / drive the page. */}
          {(waitingInfo || userPaused) && liveScreenshot && (
            <div className="px-4 py-3 border-t border-border space-y-2 bg-surface/40">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={takeControl}
                    onChange={(e) => setTakeControl(e.target.checked)}
                    className="accent-accent"
                  />
                  Take control of the browser
                </label>
                {takeControl && (
                  <span className="text-[10px] text-muted">
                    Click, scroll &amp; type right on the page (click it first to
                    focus)
                  </span>
                )}
              </div>
              {takeControl && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={typeText}
                      onChange={(e) => setTypeText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (typeText) {
                            sendInteraction({ kind: "type", text: typeText });
                            setTypeText("");
                          }
                        }
                      }}
                      placeholder="Type into the focused field, then Enter…"
                      className="flex-1 px-3 py-1.5 text-xs bg-card border border-border rounded-md focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => {
                        if (typeText) {
                          sendInteraction({ kind: "type", text: typeText });
                          setTypeText("");
                        }
                      }}
                      disabled={!typeText || sendingInteraction}
                      className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
                    >
                      Type
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { label: "Enter", key: "Enter" },
                      { label: "Tab", key: "Tab" },
                      { label: "Backspace", key: "Backspace" },
                      { label: "Esc", key: "Escape" },
                    ].map((k) => (
                      <button
                        key={k.key}
                        onClick={() =>
                          sendInteraction({ kind: "key", key: k.key })
                        }
                        disabled={sendingInteraction}
                        className="px-2 py-1 text-[11px] font-medium rounded border border-border hover:bg-card disabled:opacity-50"
                      >
                        {k.label}
                      </button>
                    ))}
                    <button
                      onClick={() =>
                        sendInteraction({ kind: "scroll", dyPct: 0.6 })
                      }
                      disabled={sendingInteraction}
                      className="px-2 py-1 text-[11px] font-medium rounded border border-border hover:bg-card disabled:opacity-50"
                    >
                      Scroll ↓
                    </button>
                    <button
                      onClick={() =>
                        sendInteraction({ kind: "scroll", dyPct: -0.6 })
                      }
                      disabled={sendingInteraction}
                      className="px-2 py-1 text-[11px] font-medium rounded border border-border hover:bg-card disabled:opacity-50"
                    >
                      Scroll ↑
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Current activity line */}
          {!waitingInfo && isRunning && agentLogs.length > 0 && (
            <div className="px-4 py-2.5 border-t border-border flex items-center gap-2 text-xs text-foreground/70">
              <Loader2 size={12} className="animate-spin text-accent shrink-0" />
              <span className="truncate">
                {agentLogs[agentLogs.length - 1]}
              </span>
            </div>
          )}

          {/* The pause/interaction prompt lives right here so the user never
              has to hunt for where to respond (credentials, MFA, approval). */}
          {waitingInfo && (
            <div className="p-4 border-t border-border">
              <WaitingBlock
                waitingInfo={waitingInfo}
                onResume={handleResume}
                onCancel={handleCancel}
              />
            </div>
          )}

          {/* Full activity log — kept inside this panel so everything the
              browser agent does lives in one place. */}
          {agentLogs.length > 0 && (
            <details className="border-t border-border" open={!isRunning}>
              <summary className="px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wider cursor-pointer hover:text-foreground select-none">
                Activity log ({agentLogs.length})
              </summary>
              <div className="px-4 pb-3 max-h-48 overflow-y-auto font-mono text-xs space-y-1">
                {agentLogs.map((log, i) => (
                  <div
                    key={i}
                    className={
                      log.startsWith("FAILED")
                        ? "text-red-600 dark:text-red-400"
                        : "text-foreground/60"
                    }
                  >
                    {log}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </details>
          )}
        </div>
      )}

      {/* Discovered requirements */}
      {visibleDiscoveries.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileSearch size={14} className="text-amber-500" />
              <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">
                Discovered Requirements ({visibleDiscoveries.length})
              </h4>
            </div>
            <span className="text-[10px] text-muted">
              Notes from the agent — dismiss once handled
            </span>
          </div>
          <div className="p-3 space-y-2">
            {visibleDiscoveries.map((d) => (
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
                <button
                  onClick={() =>
                    setDismissedDiscoveries((prev) =>
                      new Set(prev).add(d.id)
                    )
                  }
                  className={`shrink-0 -mr-1 -mt-0.5 p-1 rounded transition-colors ${
                    d.priority === "blocker"
                      ? "text-red-500/70 hover:text-red-600 hover:bg-red-200/50 dark:hover:bg-red-500/20"
                      : d.priority === "required"
                        ? "text-amber-600/70 hover:text-amber-700 hover:bg-amber-200/50 dark:hover:bg-amber-500/20"
                        : "text-muted hover:text-foreground hover:bg-surface"
                  }`}
                  title="Dismiss this note"
                >
                  <X size={13} />
                </button>
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
          const stepNotes = notesForStep(step.step_number);
          const hasBlockerNote = stepNotes.some((n) => n.kind === "blocker");

          return (
            <div
              key={step.step_number}
              id={`step-${step.step_number}`}
              className={`bg-card border rounded-xl overflow-hidden hover:border-accent/15 transition-all duration-200 scroll-mt-4 ${
                liveStep === step.step_number && (isRunning || waitingInfo)
                  ? "border-accent/50 ring-1 ring-accent/20"
                  : isReady
                    ? "border-emerald-200 dark:border-emerald-500/20"
                    : "border-border"
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
                    {stepNotes.length > 0 && (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          hasBlockerNote
                            ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                        }`}
                        title="The agent left notes on this step"
                      >
                        <AlertTriangle size={10} />
                        {stepNotes.length} note
                        {stepNotes.length > 1 ? "s" : ""}
                      </span>
                    )}
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

                  {/* Agent notes for this step (persisted across runs) */}
                  {stepNotes.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted uppercase tracking-wide flex items-center gap-1.5">
                        <AlertTriangle size={11} className="text-amber-500" />
                        Agent notes
                      </p>
                      {stepNotes.map((n, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-2 text-xs rounded-lg px-2.5 py-2 border ${
                            n.kind === "blocker"
                              ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-200"
                              : n.kind === "required"
                                ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-200"
                                : "bg-surface border-border text-foreground/70"
                          }`}
                        >
                          <span className="font-semibold uppercase text-[9px] mt-0.5 shrink-0">
                            {n.kind}
                          </span>
                          <span>{n.text}</span>
                        </div>
                      ))}
                    </div>
                  )}

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
 * Email-submission panel (Option B): the agent drafts a cover email, the user
 * reviews/edits it, then opens it pre-filled in their OWN email client (Gmail
 * compose or the system mail app) and sends it from their own address. We never
 * send on the user's behalf here — they review and hit send themselves.
 *
 * Compose URLs can't carry attachments, so the panel makes attaching the DOCX
 * an explicit step. (A future "Send via FundFly" option will attach + send the
 * file automatically from a fundfly.app address.)
 */
function EmailSubmissionPanel({
  recipient,
  subject: initialSubject,
  body: initialBody,
  onGoToWorkspace,
}: {
  recipient: string;
  subject: string;
  body: string;
  onGoToWorkspace: () => void;
}) {
  const [to, setTo] = useState(recipient);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [copied, setCopied] = useState(false);
  const [attachConfirmed, setAttachConfirmed] = useState(false);

  const gmailUrl =
    `https://mail.google.com/mail/?view=cm&fs=1` +
    `&to=${encodeURIComponent(to)}` +
    `&su=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;
  const mailtoUrl =
    `mailto:${encodeURIComponent(to)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;

  const copyBody = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may be blocked — non-fatal
    }
  };

  const inputCls =
    "w-full px-3 py-2 text-sm bg-card border border-border rounded-md focus:outline-none focus:border-accent";

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-accent/5">
        <Mail size={15} className="text-accent" />
        <h4 className="text-sm font-semibold">Email this application</h4>
        <span className="ml-auto text-[11px] text-muted">
          Sends from your own inbox
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Step 1 — attach the proposal (compose links can't pre-attach files) */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <Paperclip
              size={14}
              className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
            />
            <div className="text-xs text-amber-900/90 dark:text-amber-200/90">
              <span className="font-semibold">First, attach your proposal.</span>{" "}
              Email drafts can&apos;t carry a file automatically, so download the
              DOCX from your workspace and attach it after the draft opens.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-6">
            <button
              onClick={onGoToWorkspace}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:border-accent/40 transition-colors"
            >
              <FileText size={13} /> Go to workspace to download DOCX
            </button>
            <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer text-amber-900/80 dark:text-amber-200/80">
              <input
                type="checkbox"
                checked={attachConfirmed}
                onChange={(e) => setAttachConfirmed(e.target.checked)}
                className="accent-accent"
              />
              I&apos;ve downloaded it
            </label>
          </div>
        </div>

        {/* Step 2 — review the draft */}
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted">
            To
          </label>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`${inputCls} font-mono`}
          />
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted pt-1">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={inputCls}
          />
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted pt-1">
            Message
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className={`${inputCls} resize-y leading-relaxed`}
          />
          <p className="text-[11px] text-muted">
            Drafted by AI from your application — review and edit before sending.
            The full proposal goes as the attached file, so this is just the
            cover note.
          </p>
        </div>

        {/* Step 3 — open in the user's own email client */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <a
            href={gmailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-accent to-purple-500 text-white shadow-sm hover:brightness-105 transition-all"
          >
            <Send size={14} /> Open in Gmail
            <ExternalLink size={12} className="opacity-80" />
          </a>
          <a
            href={mailtoUrl}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-surface transition-colors"
          >
            <Mail size={14} /> Open in email app
          </a>
          <button
            onClick={copyBody}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-surface transition-colors"
          >
            {copied ? (
              <>
                <Check size={14} className="text-emerald-500" /> Copied
              </>
            ) : (
              <>
                <Copy size={14} /> Copy text
              </>
            )}
          </button>
        </div>
        <p className="text-[11px] text-muted">
          Opens a pre-filled draft in your own email — nothing is sent until you
          review it and click send yourself.
        </p>
      </div>
    </div>
  );
}

/**
 * Three-stage progress indicator that makes the submission sequence explicit:
 *   1. Pre-Submission Checklist  → 2. Generate Application  → 3. Auto-Submit
 * Stage 2 is positioned after the checklist so the proposal can incorporate
 * anything discovered during research.
 */
function StageStepper({
  checklistDone,
  applicationDone,
  submitDone,
  submitActive,
  isOnlineSubmission,
}: {
  checklistDone: boolean;
  applicationDone: boolean;
  submitDone: boolean;
  submitActive: boolean;
  isOnlineSubmission: boolean;
}) {
  const stages = [
    {
      label: "Checklist",
      sub: "Requirements researched",
      done: checklistDone,
      active: false,
    },
    {
      label: "Application",
      sub: applicationDone ? "Content generated" : "Generate your content",
      done: applicationDone,
      active: checklistDone && !applicationDone,
    },
    {
      label: isOnlineSubmission ? "Auto-Submit" : "Download & Send",
      sub: isOnlineSubmission
        ? submitDone
          ? "Submitted"
          : "Agent files for you"
        : "Export the package",
      done: submitDone,
      active: applicationDone && !submitDone,
    },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center">
        {stages.map((s, i) => (
          <div key={s.label} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold border-2 transition-colors ${
                  s.done
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : s.active
                      ? "border-accent text-accent"
                      : "border-border text-muted"
                }`}
              >
                {s.done ? <CheckCircle size={15} /> : i + 1}
              </div>
              <div className="min-w-0">
                <p
                  className={`text-xs font-semibold leading-tight truncate ${
                    s.done || s.active ? "text-foreground" : "text-muted"
                  }`}
                >
                  {s.label}
                </p>
                <p className="text-[10px] text-muted leading-tight truncate hidden sm:block">
                  {s.sub}
                </p>
              </div>
            </div>
            {i < stages.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 sm:mx-3 rounded ${
                  stages[i].done ? "bg-emerald-400/60" : "bg-border"
                }`}
              />
            )}
          </div>
        ))}
      </div>
      {submitActive && (
        <p className="text-[11px] text-accent mt-2.5 text-center sm:text-left">
          Auto-submission in progress…
        </p>
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

  if (waitingInfo.type === "step_failed") {
    return (
      <div className="bg-red-50 border border-red-200 dark:bg-red-500/10 dark:border-red-500/20 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
          <h4 className="text-sm font-semibold text-red-900 dark:text-red-200">
            This step didn&apos;t complete
          </h4>
        </div>
        <p className="text-sm text-red-900/80 dark:text-red-200/80">
          {waitingInfo.description || "The agent couldn't finish this step."}
        </p>
        <p className="text-xs text-red-900/70 dark:text-red-200/70">
          Turn on <strong>Take control of the browser</strong> above to fix it
          by hand if needed, then <strong>Retry</strong> — or{" "}
          <strong>Skip</strong> to move on to the next step.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onResume({ step_action: "retry" })}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent to-purple-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all"
          >
            <RotateCcw size={14} />
            Retry step
          </button>
          <button
            onClick={() => onResume({ step_action: "skip" })}
            className="px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-surface transition-colors"
          >
            Skip step
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
          >
            Stop
          </button>
        </div>
      </div>
    );
  }

  // Fall through to legacy login, interaction, or approval blocks
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
      ) : waitingInfo.type === "interaction" ? (
        <>
          <div className="flex items-center gap-2">
            <AlertTriangle
              size={18}
              className="text-amber-600 dark:text-amber-400"
            />
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Your help needed
            </h4>
          </div>
          <p className="text-sm text-amber-900/80 dark:text-amber-200/80">
            {waitingInfo.description ||
              "The agent hit something it can't solve on its own (like a CAPTCHA)."}{" "}
            Turn on <strong>Take control of the browser</strong> above, solve
            it directly in the live view, then click{" "}
            <strong>I&apos;ve solved it — Resume</strong>.
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
          {waitingInfo.type === "interaction"
            ? "I've solved it — Resume"
            : "Continue"}
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
