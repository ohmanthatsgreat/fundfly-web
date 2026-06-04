import { sendOnce, renderEmail, APP_URL } from "@/lib/email";

/**
 * Concrete product emails. Each builds its content with renderEmail() and sends
 * idempotently via sendOnce(). Keep one exported function per email so callers
 * (webhooks, crons) stay one-liners.
 */

/** Welcome — sent once when a new account is created (Clerk user.created). */
export async function sendWelcomeEmail(opts: {
  clerkUserId: string;
  to: string;
  name?: string | null;
}) {
  const firstName = (opts.name || "").trim().split(/\s+/)[0] || "there";
  const html = renderEmail({
    preheader: "Welcome to FundFly — let's find your funding.",
    heading: `Welcome to FundFly, ${escapeText(firstName)}!`,
    bodyHtml: `
      <p style="margin:0 0 14px;">Thanks for joining FundFly. We help you <strong>find the right grants</strong>, <strong>write the application</strong>, and <strong>submit it</strong> — with AI doing the heavy lifting.</p>
      <p style="margin:0 0 8px;">Here's the fastest way to get value today:</p>
      <ol style="margin:0 0 14px;padding-left:20px;color:#334155;">
        <li style="margin-bottom:6px;">Finish your <strong>profile</strong> so matches are accurate.</li>
        <li style="margin-bottom:6px;">Review your <strong>AI grant matches</strong>.</li>
        <li>Open one and let FundFly build the <strong>application</strong>.</li>
      </ol>`,
    cta: { label: "Go to my dashboard", url: `${APP_URL}/app` },
    footnote: `Questions? Just reply to this email.`,
  });

  return sendOnce({
    kind: "welcome",
    dedupKey: opts.clerkUserId,
    clerkUserId: opts.clerkUserId,
    to: opts.to,
    subject: "Welcome to FundFly 👋",
    html,
    replyTo: "support@fundfly.app",
  });
}

/**
 * Submission confirmation — sent once when an auto-submission completes
 * successfully. dedupKey is the plan id so a re-run / retry never double-sends.
 */
export async function sendSubmissionConfirmationEmail(opts: {
  clerkUserId: string;
  to: string;
  name?: string | null;
  planId: number;
  opportunityTitle: string;
  agency?: string | null;
  /** Any confirmation/tracking values the agent collected (e.g. tracking #). */
  artifacts?: Record<string, string>;
}) {
  const firstName = (opts.name || "").trim().split(/\s+/)[0] || "there";

  // Surface a few useful artifacts (confirmation/tracking numbers) if present.
  const interesting = Object.entries(opts.artifacts || {}).filter(([k]) =>
    /confirm|tracking|submission|grant|award|number|id/i.test(k)
  );
  const artifactsHtml =
    interesting.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 14px;border-collapse:collapse;">${interesting
          .map(
            ([k, v]) =>
              `<tr><td style="padding:3px 14px 3px 0;color:#64748b;font-size:13px;">${escapeText(
                k
              )}</td><td style="padding:3px 0;font-size:13px;font-weight:600;">${escapeText(
                String(v)
              )}</td></tr>`
          )
          .join("")}</table>`
      : "";

  const html = renderEmail({
    preheader: `Your application for "${opts.opportunityTitle}" was submitted.`,
    heading: "Your application was submitted ✅",
    bodyHtml: `
      <p style="margin:0 0 14px;">Nice work, ${escapeText(firstName)} — FundFly finished submitting your application for:</p>
      <p style="margin:0 0 14px;padding:12px 14px;background:#f6f7fb;border-radius:10px;font-weight:600;">${escapeText(
        opts.opportunityTitle
      )}${opts.agency ? `<br><span style="font-weight:400;color:#64748b;font-size:13px;">${escapeText(opts.agency)}</span>` : ""}</p>
      ${artifactsHtml ? `<p style="margin:0 0 4px;font-size:13px;color:#64748b;">For your records:</p>${artifactsHtml}` : ""}
      <p style="margin:0;">You can review the full submission and its activity log in your dashboard. We'll keep the application tracked there.</p>`,
    cta: { label: "View submission", url: `${APP_URL}/app` },
    footnote: "Keep any confirmation numbers above for your records.",
  });

  return sendOnce({
    kind: "submission_confirmation",
    dedupKey: `plan:${opts.planId}`,
    clerkUserId: opts.clerkUserId,
    to: opts.to,
    subject: `Submitted: ${opts.opportunityTitle}`.slice(0, 120),
    html,
    replyTo: "support@fundfly.app",
  });
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
