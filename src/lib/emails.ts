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

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
