import { NextRequest } from "next/server";
import {
  db,
  applications,
  submissionPlans,
  applicationSections,
  applicationDocuments,
  userProfiles,
  personalProfiles,
} from "@/lib/db";
import { requireAuth, checkSubscription } from "@/lib/auth";
import { eq, and, isNotNull } from "drizzle-orm";

/** Structured profile fields the agent uses to fill identity/registration
 *  form fields. Only non-empty values are sent. */
function buildAgentProfile(
  mode: string | null,
  org: Record<string, unknown> | undefined,
  personal: Record<string, unknown> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (label: string, val: unknown) => {
    if (val !== null && val !== undefined && String(val).trim() !== "") {
      out[label] = String(val);
    }
  };

  if (mode === "personal" && personal) {
    add("Full Name", personal.fullName);
    add("Email", personal.email);
    add("Phone", personal.phone);
    add("Date of Birth", personal.dateOfBirth);
    add("Citizenship", personal.citizenship);
    add("Address", personal.address);
    add("City", personal.city);
    add("State", personal.state);
    add("ZIP", personal.zip);
    add("Education Level", personal.educationLevel);
    add("Field of Study", personal.fieldOfStudy);
    add("Current School", personal.currentSchool);
    add("Employment Status", personal.employmentStatus);
    add("Veteran Status", personal.veteranStatus);
    return out;
  }

  if (org) {
    add("Organization Name", org.orgName);
    add("Organization Type", org.orgType);
    add("EIN", org.ein);
    add("UEI", org.uei);
    add("SAM.gov Registered", org.samRegistered ? "Yes" : "");
    add("Address", org.address);
    add("City", org.city);
    add("State", org.state);
    add("ZIP", org.zip);
    add("Contact Name", org.contactName);
    add("Contact Email", org.contactEmail);
    add("Contact Phone", org.contactPhone);
    add("Website", org.website);
    add("NAICS Codes", org.naicsCodes);
    add("Certifications", org.certifications);
    add("Annual Revenue", org.annualRevenue);
    add("Employee Count", org.employeeCount);
    add("Year Founded", org.yearFounded);
  }
  return out;
}

const WORKER_URL = process.env.WORKER_URL || "http://localhost:3001";
const WORKER_SECRET = process.env.WORKER_SECRET || "dev-secret";

async function workerFetch(path: string, options?: RequestInit) {
  return fetch(`${WORKER_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WORKER_SECRET}`,
      ...(options?.headers || {}),
    },
  });
}

export async function POST(request: NextRequest) {
  const userId = await requireAuth();
  const body = await request.json();
  const { action, plan_id } = body;

  // Check subscription — submission agent requires "auto_submission" feature
  const sub = await checkSubscription(userId, "auto_submission");
  if (!sub.allowed) {
    // Check if at usage limit vs not subscribed
    if (sub.usage?.atLimit) {
      return Response.json(
        {
          error: "usage_limit_reached",
          feature: "auto_submission",
          usage: sub.usage,
        },
        { status: 403 }
      );
    }
    return Response.json(
      { error: "subscription_required", feature: "auto_submission" },
      { status: 403 }
    );
  }

  if (!plan_id) {
    return Response.json({ error: "plan_id required" }, { status: 400 });
  }

  // Verify ownership through plan -> application chain
  const [planRow] = await db
    .select()
    .from(submissionPlans)
    .where(eq(submissionPlans.id, plan_id))
    .limit(1);

  if (!planRow) {
    return Response.json({ error: "Plan not found" }, { status: 404 });
  }

  const [app] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.id, planRow.applicationId),
        eq(applications.userId, userId)
      )
    )
    .limit(1);

  if (!app) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  try {
    if (action === "start") {
      // Get plan data and application sections
      const plan = JSON.parse(planRow.planJson);
      const sections = await db
        .select({
          sectionKey: applicationSections.sectionKey,
          content: applicationSections.content,
        })
        .from(applicationSections)
        .where(eq(applicationSections.applicationId, planRow.applicationId));

      const applicationContent: Record<string, string> = {};
      for (const s of sections) {
        if (s.content) applicationContent[s.sectionKey] = s.content;
      }

      // Get pre-attached documents for auto-upload
      const attachedDocs = await db
        .select()
        .from(applicationDocuments)
        .where(
          and(
            eq(applicationDocuments.applicationId, planRow.applicationId),
            isNotNull(applicationDocuments.stepNumber),
            isNotNull(applicationDocuments.artifactName)
          )
        );

      // Build a mapping of artifact_name -> file_url for the worker
      const preAttachedFiles: Record<string, string> = {};
      for (const doc of attachedDocs) {
        if (doc.artifactName && doc.fileUrl) {
          preAttachedFiles[doc.artifactName] = doc.fileUrl;
        }
      }

      // Steps the user already checked off — the agent should skip these.
      let readySteps: number[] = [];
      try {
        const artifacts = JSON.parse(planRow.artifactsJson || "{}");
        if (artifacts._steps_ready) {
          const ready = JSON.parse(artifacts._steps_ready) as Record<
            string,
            boolean
          >;
          readySteps = Object.entries(ready)
            .filter(([, v]) => v)
            .map(([k]) => parseInt(k, 10))
            .filter((n) => !Number.isNaN(n));
        }
      } catch {
        // no ready-state — agent runs every step
      }

      // Structured profile so the agent can fill identity/registration fields.
      const [orgProfile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);
      const [personalProfile] = await db
        .select()
        .from(personalProfiles)
        .where(eq(personalProfiles.userId, userId))
        .limit(1);
      const agentProfile = buildAgentProfile(
        app.mode,
        orgProfile as unknown as Record<string, unknown>,
        personalProfile as unknown as Record<string, unknown>
      );

      // Update plan status
      await db
        .update(submissionPlans)
        .set({ status: "running", currentStep: 0, updatedAt: new Date() })
        .where(eq(submissionPlans.id, plan_id));

      // Start agent on worker — pass userId so worker can fetch saved
      // portal credentials at runtime via the internal API.
      const res = await workerFetch("/agent/start", {
        method: "POST",
        body: JSON.stringify({
          plan_id,
          plan,
          application_content: applicationContent,
          pre_attached_files: preAttachedFiles,
          user_id: userId,
          ready_steps: readySteps,
          profile: agentProfile,
        }),
      });
      const data = await res.json();
      return Response.json(data);
    }

    if (action === "resume") {
      // resume_payload carries credentials/MFA codes from the runtime prompt
      // forms. Never logged on the web side; relayed directly to worker.
      const res = await workerFetch("/agent/resume", {
        method: "POST",
        body: JSON.stringify({
          plan_id,
          resume_payload: body.resume_payload,
        }),
      });
      const data = await res.json();
      return Response.json(data);
    }

    if (action === "interact") {
      // Human take-control interaction (click/type/key/scroll) forwarded to
      // the live browser. The worker replies + streams a fresh screenshot.
      const res = await workerFetch("/agent/interact", {
        method: "POST",
        body: JSON.stringify({ plan_id, action: body.interaction }),
      });
      const data = await res.json();
      return Response.json(data);
    }

    if (action === "provide_uploads") {
      const res = await workerFetch("/agent/uploads", {
        method: "POST",
        body: JSON.stringify({
          plan_id,
          file_paths: body.file_paths || {},
        }),
      });
      const data = await res.json();
      return Response.json(data);
    }

    if (action === "cancel") {
      await db
        .update(submissionPlans)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(submissionPlans.id, plan_id));

      const res = await workerFetch("/agent/cancel", {
        method: "POST",
        body: JSON.stringify({ plan_id }),
      });
      const data = await res.json();
      return Response.json(data);
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Worker request failed";
    return Response.json({ error: msg }, { status: 502 });
  }
}

// SSE proxy — streams events from the worker to the browser
export async function GET(request: NextRequest) {
  const userId = await requireAuth();
  const planId = request.nextUrl.searchParams.get("plan_id");

  if (!planId) {
    return Response.json({ error: "plan_id required" }, { status: 400 });
  }

  // Verify ownership
  const [planRow] = await db
    .select()
    .from(submissionPlans)
    .where(eq(submissionPlans.id, parseInt(planId)))
    .limit(1);

  if (!planRow) {
    return Response.json({ error: "Plan not found" }, { status: 404 });
  }

  const [app] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.id, planRow.applicationId),
        eq(applications.userId, userId)
      )
    )
    .limit(1);

  if (!app) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Proxy the SSE stream from the worker
  try {
    const workerRes = await workerFetch(`/agent/stream/${planId}`, {
      method: "GET",
    });

    if (!workerRes.ok || !workerRes.body) {
      return Response.json(
        { error: "Worker stream not available" },
        { status: 502 }
      );
    }

    // Forward the stream
    return new Response(workerRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch {
    return Response.json(
      { error: "Could not connect to worker" },
      { status: 502 }
    );
  }
}
