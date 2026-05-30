export type StartApplicationResult =
  | { ok: true; appId: number; view: "workspace" | "submission" }
  | { ok: false; error: string; profilePath: string | null };

/**
 * Create (or reuse) an application for an opportunity and decide where to send
 * the user next. Centralizes the failure handling that both the matches page
 * and the opportunity list previously dropped on the floor: a non-2xx POST used
 * to return silently, so "Start Application" looked dead on mobile — most often
 * because a brand-new user hadn't set up the profile the server requires.
 */
export async function startApplication(
  opportunityId: string,
  userPlan: string | null
): Promise<StartApplicationResult> {
  let res: Response;
  try {
    res = await fetch("/api/app/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId }),
    });
  } catch {
    return {
      ok: false,
      error: "Network error — please check your connection and try again.",
      profilePath: null,
    };
  }

  const data: { application?: { id?: number }; error?: string } = await res
    .json()
    .catch(() => ({}));
  const appId = data.application?.id;

  if (!res.ok || !appId) {
    const error =
      data.error || "Could not start this application. Please try again.";
    // The only 400 this endpoint returns means a profile is required first.
    // Deep-link to the exact profile the server's message points at.
    let profilePath: string | null = null;
    if (res.status === 400) {
      profilePath =
        /personal/i.test(error) && !/organization/i.test(error)
          ? "/app/personal-profile"
          : "/app/organization";
    }
    return { ok: false, error, profilePath };
  }

  const hasAutoSub =
    !!userPlan && ["auto_submission", "bundle"].includes(userPlan);
  return { ok: true, appId, view: hasAutoSub ? "submission" : "workspace" };
}
