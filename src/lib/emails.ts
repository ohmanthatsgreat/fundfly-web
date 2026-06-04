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

// ─── Billing emails (Stripe-triggered) ──────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  matching: "Matching",
  checklist: "Checklist",
  auto_submission: "Auto-Submission",
  bundle: "Bundle",
};
const planLabel = (p?: string | null) =>
  (p && PLAN_LABELS[p]) || "your plan";

const usd = (cents: number) =>
  `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/** Subscription started — receipt + what they unlocked. dedupKey = subscription id. */
export async function sendSubscriptionReceiptEmail(opts: {
  clerkUserId: string;
  to: string;
  name?: string | null;
  plan: string;
  subscriptionId: string;
}) {
  const html = renderEmail({
    preheader: `Your ${planLabel(opts.plan)} plan is active.`,
    heading: `You're on ${planLabel(opts.plan)} 🎉`,
    bodyHtml: `
      <p style="margin:0 0 12px;">Thanks for subscribing — your <strong>${escapeText(
        planLabel(opts.plan)
      )}</strong> plan is active and ready to use.</p>
      <p style="margin:0;">Jump back in and put it to work on your next grant.</p>`,
    cta: { label: "Open FundFly", url: `${APP_URL}/app` },
    footnote: "Manage your plan anytime in Settings.",
  });
  return sendOnce({
    kind: "subscription_receipt",
    dedupKey: `sub:${opts.subscriptionId}`,
    clerkUserId: opts.clerkUserId,
    to: opts.to,
    subject: `Your FundFly ${planLabel(opts.plan)} plan is active`,
    html,
    replyTo: "support@fundfly.app",
  });
}

/** AI credit top-up receipt. dedupKey = checkout session id. */
export async function sendCreditReceiptEmail(opts: {
  clerkUserId: string;
  to: string;
  name?: string | null;
  displayCents: number;
  sessionId: string;
}) {
  const html = renderEmail({
    preheader: `${usd(opts.displayCents)} in credits added.`,
    heading: "Credits added ✅",
    bodyHtml: `
      <p style="margin:0 0 12px;">We've added <strong>${usd(
        opts.displayCents
      )}</strong> in AI credits to your account.</p>
      <p style="margin:0;">They're ready to use on matching, checklists, and auto-submission.</p>`,
    cta: { label: "Go to FundFly", url: `${APP_URL}/app` },
    footnote: "Your balance is shown in Settings.",
  });
  return sendOnce({
    kind: "credit_receipt",
    dedupKey: `topup:${opts.sessionId}`,
    clerkUserId: opts.clerkUserId,
    to: opts.to,
    subject: `Receipt: ${usd(opts.displayCents)} in FundFly credits`,
    html,
    replyTo: "support@fundfly.app",
  });
}

/** Payment failed — prompt to update card. dedupKey = invoice id. */
export async function sendPaymentFailedEmail(opts: {
  clerkUserId: string;
  to: string;
  name?: string | null;
  invoiceId: string;
}) {
  const html = renderEmail({
    preheader: "We couldn't process your latest payment.",
    heading: "Payment issue — action needed",
    bodyHtml: `
      <p style="margin:0 0 12px;">We weren't able to process your most recent FundFly payment, usually a card that expired or was declined.</p>
      <p style="margin:0;">Update your payment method to keep your access uninterrupted.</p>`,
    cta: { label: "Update payment method", url: `${APP_URL}/app/settings` },
    footnote: "If you've already fixed this, you can ignore this email.",
  });
  return sendOnce({
    kind: "payment_failed",
    dedupKey: `invoice:${opts.invoiceId}`,
    clerkUserId: opts.clerkUserId,
    to: opts.to,
    subject: "Action needed: your FundFly payment didn't go through",
    html,
    replyTo: "support@fundfly.app",
  });
}

/** Trial ending soon. dedupKey = subscription id (one per trial). */
export async function sendTrialEndingEmail(opts: {
  clerkUserId: string;
  to: string;
  name?: string | null;
  plan: string;
  endsAt: Date;
  subscriptionId: string;
}) {
  const when = opts.endsAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  const html = renderEmail({
    preheader: `Your free trial ends ${when}.`,
    heading: "Your free trial ends soon",
    bodyHtml: `
      <p style="margin:0 0 12px;">Your FundFly <strong>${escapeText(
        planLabel(opts.plan)
      )}</strong> free trial ends on <strong>${escapeText(when)}</strong>. After that your plan continues and your card is charged.</p>
      <p style="margin:0;">Loving it? No action needed. Need to change anything? Manage it in Settings.</p>`,
    cta: { label: "Manage my plan", url: `${APP_URL}/app/settings` },
    footnote: "You can cancel anytime before the trial ends.",
  });
  return sendOnce({
    kind: "trial_ending",
    dedupKey: `trial:${opts.subscriptionId}`,
    clerkUserId: opts.clerkUserId,
    to: opts.to,
    subject: `Your FundFly trial ends ${when}`,
    html,
    replyTo: "support@fundfly.app",
  });
}

// ─── Lifecycle / re-engagement emails (broadcast stream) ────────────────────

/** Nudge an account that signed up but never started an application. Once ever. */
export async function sendInactiveNudgeEmail(opts: {
  clerkUserId: string;
  to: string;
  name?: string | null;
}) {
  const firstName = (opts.name || "").trim().split(/\s+/)[0] || "there";
  const html = renderEmail({
    preheader: "Your funding matches are waiting.",
    heading: `Still looking for funding, ${escapeText(firstName)}?`,
    bodyHtml: `
      <p style="margin:0 0 12px;">You created a FundFly account but haven't started an application yet — and there may already be grants matched to you.</p>
      <p style="margin:0;">It takes about a minute: open your matches, pick one, and let FundFly draft the application for you.</p>`,
    cta: { label: "See my matches", url: `${APP_URL}/app` },
    footnote: "Not the right time? You can ignore this — we won't nudge again.",
  });
  return sendOnce({
    kind: "inactive_nudge",
    dedupKey: opts.clerkUserId,
    clerkUserId: opts.clerkUserId,
    to: opts.to,
    subject: "Your grant matches are waiting on FundFly",
    html,
    replyTo: "support@fundfly.app",
    stream: "broadcast",
  });
}

/** Recover an abandoned checkout (started but not completed). Once per session. */
export async function sendAbandonedCheckoutEmail(opts: {
  clerkUserId: string;
  to: string;
  name?: string | null;
  sessionId: string;
  /** "subscription" | "credits" — tailors the copy. */
  kind: "subscription" | "credits";
}) {
  const isSub = opts.kind === "subscription";
  const html = renderEmail({
    preheader: "You're one step away — finish when you're ready.",
    heading: "Finish setting up your FundFly access",
    bodyHtml: `
      <p style="margin:0 0 12px;">Looks like you started ${
        isSub ? "subscribing to a plan" : "adding credits"
      } but didn't finish. No worries — your spot's still here.</p>
      <p style="margin:0;">Pick up right where you left off whenever you're ready.</p>`,
    cta: {
      label: isSub ? "Finish subscribing" : "Finish adding credits",
      url: `${APP_URL}/app/settings`,
    },
    footnote: "Questions about plans? Just reply — happy to help.",
  });
  return sendOnce({
    kind: "abandoned_checkout",
    dedupKey: `abandoned:${opts.sessionId}`,
    clerkUserId: opts.clerkUserId,
    to: opts.to,
    subject: "You're one step away on FundFly",
    html,
    replyTo: "support@fundfly.app",
    stream: "broadcast",
  });
}

/** Weekly digest of new matches. dedupKey includes the ISO week → once/week. */
export async function sendMatchDigestEmail(opts: {
  clerkUserId: string;
  to: string;
  name?: string | null;
  count: number;
  samples: { title: string; agency?: string | null }[];
  weekKey: string;
}) {
  const list = opts.samples
    .slice(0, 5)
    .map(
      (s) =>
        `<li style="margin-bottom:8px;"><strong>${escapeText(
          s.title
        )}</strong>${s.agency ? `<br><span style="color:#64748b;font-size:13px;">${escapeText(s.agency)}</span>` : ""}</li>`
    )
    .join("");
  const html = renderEmail({
    preheader: `${opts.count} new grant match${opts.count === 1 ? "" : "es"} this week.`,
    heading: `${opts.count} new match${opts.count === 1 ? "" : "es"} for you`,
    bodyHtml: `
      <p style="margin:0 0 12px;">FundFly found new grants that fit your profile this week:</p>
      <ul style="margin:0 0 8px;padding-left:20px;">${list}</ul>`,
    cta: { label: "View all matches", url: `${APP_URL}/app` },
    footnote: "We send this at most once a week.",
  });
  return sendOnce({
    kind: "match_digest",
    dedupKey: `digest:${opts.clerkUserId}:${opts.weekKey}`,
    clerkUserId: opts.clerkUserId,
    to: opts.to,
    subject: `${opts.count} new grant match${opts.count === 1 ? "" : "es"} on FundFly`,
    html,
    replyTo: "support@fundfly.app",
    stream: "broadcast",
  });
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
