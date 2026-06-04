import { db, emailEvents } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * Product / lifecycle email sending via Postmark.
 *
 * Two layers:
 *  - sendEmail():  low-level send through the Postmark HTTP API. Fire-and-check.
 *  - sendOnce():   idempotent wrapper — claims a row in `email_events` keyed by
 *                  (kind, dedupKey) BEFORE sending, so webhook retries / races /
 *                  re-runs never double-send. A failed send releases the claim
 *                  so a later retry can succeed.
 *
 * Auth/identity emails (sign-up codes, password reset) are handled by Clerk and
 * do NOT go through here. This is only for our own product emails.
 *
 * Env:
 *   POSTMARK_SERVER_TOKEN  — FundFly server token (required to actually send)
 *   EMAIL_FROM             — default From, e.g. "FundFly <hello@fundfly.app>"
 *   NEXT_PUBLIC_APP_URL    — base URL for links (defaults to https://fundfly.app)
 */

const POSTMARK_TOKEN = process.env.POSTMARK_SERVER_TOKEN || "";
const DEFAULT_FROM = process.env.EMAIL_FROM || "FundFly <hello@fundfly.app>";
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://fundfly.app";

/** Postmark message streams. Transactional = outbound; bulk/marketing = broadcast. */
export type MessageStream = "outbound" | "broadcast";

type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  stream?: MessageStream;
  /** Postmark tag for analytics/segmentation (e.g. "welcome"). */
  tag?: string;
  /** Extra RFC headers, e.g. In-Reply-To / References for threading. */
  headers?: { Name: string; Value: string }[];
};

type SendResult =
  | { ok: true; providerId: string | null }
  | { ok: false; skipped?: boolean; error: string };

/**
 * Send a single email through Postmark. Returns ok:false (never throws) so
 * callers can decide whether a failure matters. No-ops gracefully when the
 * server token is absent (local dev / preview) so builds and flows don't break.
 */
export async function sendEmail(args: SendEmailArgs): Promise<SendResult> {
  if (!POSTMARK_TOKEN) {
    console.warn(
      `[email] POSTMARK_SERVER_TOKEN not set — skipping send "${args.subject}" → ${args.to}`
    );
    return { ok: false, skipped: true, error: "no_token" };
  }

  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": POSTMARK_TOKEN,
      },
      body: JSON.stringify({
        From: args.from || DEFAULT_FROM,
        To: args.to,
        Subject: args.subject,
        HtmlBody: args.html,
        TextBody: args.text || htmlToText(args.html),
        MessageStream: args.stream || "outbound",
        ...(args.replyTo ? { ReplyTo: args.replyTo } : {}),
        ...(args.tag ? { Tag: args.tag } : {}),
        ...(args.headers && args.headers.length
          ? { Headers: args.headers }
          : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Postmark ${res.status}: ${body}`);
      return { ok: false, error: `postmark_${res.status}` };
    }

    const data = (await res.json().catch(() => ({}))) as {
      MessageID?: string;
    };
    return { ok: true, providerId: data.MessageID ?? null };
  } catch (err) {
    console.error("[email] send failed:", err);
    return { ok: false, error: String(err) };
  }
}

type SendOnceArgs = SendEmailArgs & {
  /** Logical email type, e.g. "welcome", "submission_confirmation". */
  kind: string;
  /** Uniqueness scope within that kind (clerk user id, application id, etc.). */
  dedupKey: string;
  clerkUserId?: string | null;
};

/**
 * Idempotent send: at most one email per (kind, dedupKey). Safe against webhook
 * retries, double-clicks, and concurrent cron runs. Returns what happened so
 * callers can log it.
 */
export async function sendOnce(
  args: SendOnceArgs
): Promise<{ sent: boolean; skipped?: boolean; reason?: string; providerId?: string | null }> {
  const { kind, dedupKey, clerkUserId, ...emailArgs } = args;

  if (!POSTMARK_TOKEN) {
    console.warn(`[email] skip "${kind}" (${dedupKey}) — no token`);
    return { sent: false, skipped: true, reason: "no_token" };
  }

  // Claim the slot first. A unique violation on (kind, dedupKey) means it was
  // already sent (or is being sent right now) — bail without sending again.
  let claimId: number;
  try {
    const claimed = await db
      .insert(emailEvents)
      .values({
        kind,
        dedupKey,
        clerkUserId: clerkUserId ?? null,
        toEmail: emailArgs.to,
        status: "sent",
      })
      .onConflictDoNothing({
        target: [emailEvents.kind, emailEvents.dedupKey],
      })
      .returning({ id: emailEvents.id });

    if (claimed.length === 0) {
      return { sent: false, skipped: true, reason: "already_sent" };
    }
    claimId = claimed[0].id;
  } catch (err) {
    console.error(`[email] claim failed for "${kind}" (${dedupKey}):`, err);
    return { sent: false, skipped: true, reason: "claim_error" };
  }

  const res = await sendEmail({ ...emailArgs, tag: emailArgs.tag || kind });

  if (res.ok) {
    await db
      .update(emailEvents)
      .set({ providerId: res.providerId })
      .where(eq(emailEvents.id, claimId))
      .catch(() => {});
    return { sent: true, providerId: res.providerId };
  }

  // Send failed — release the claim so a future run can retry.
  await db.delete(emailEvents).where(eq(emailEvents.id, claimId)).catch(() => {});
  return { sent: false, reason: res.error };
}

// ─── Branded HTML template ──────────────────────────────────────────────────

const BRAND = {
  accent: "#7c5cff",
  accent2: "#a855f7",
  ink: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  bg: "#f6f7fb",
};

/**
 * Wrap email body content in the FundFly branded shell. All styling is inline
 * (email clients strip <style>). Pass a single optional CTA button.
 */
export function renderEmail(opts: {
  preheader?: string;
  heading: string;
  /** Body HTML — use <p> tags. Keep it simple/inline for client compatibility. */
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** Small print under the CTA (e.g. a fallback link, secondary note). */
  footnote?: string;
}): string {
  const { preheader, heading, bodyHtml, cta, footnote } = opts;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
${
  preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(
        preheader
      )}</div>`
    : ""
}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
      <tr>
        <td style="background:linear-gradient(135deg,${BRAND.accent},${BRAND.accent2});padding:22px 28px;">
          <span style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">FundFly</span>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 28px 8px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:${BRAND.ink};">${escapeHtml(
            heading
          )}</h1>
          <div style="font-size:15px;line-height:1.6;color:#334155;">${bodyHtml}</div>
        </td>
      </tr>
      ${
        cta
          ? `<tr><td style="padding:8px 28px 28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <a href="${escapeAttr(cta.url)}" style="display:inline-block;background:linear-gradient(135deg,${BRAND.accent},${BRAND.accent2});color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:10px;">${escapeHtml(
              cta.label
            )}</a>
        ${
          footnote
            ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted};">${footnote}</p>`
            : ""
        }
      </td></tr>`
          : footnote
            ? `<tr><td style="padding:0 28px 28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;"><p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">${footnote}</p></td></tr>`
            : ""
      }
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="padding:18px 28px;text-align:center;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${BRAND.muted};">
        FundFly — grant discovery &amp; application, on autopilot.<br>
        <a href="${APP_URL}" style="color:${BRAND.muted};text-decoration:underline;">fundfly.app</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** Crude HTML→text fallback for the plain-text part of multipart emails. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
