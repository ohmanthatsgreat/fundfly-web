import { NextRequest } from "next/server";
import { db, mailboxMessages } from "@/lib/db";
import { eq } from "drizzle-orm";
import { threadKeyFor, isOurAddress } from "@/lib/mailbox";

/**
 * Postmark Inbound webhook. Configure the FundFly server's inbound webhook URL
 * (Postmark → Server → Settings) as:
 *
 *   https://fundfly.app/api/postmark/inbound?token=<POSTMARK_INBOUND_TOKEN>
 *
 * and point fundfly.app's MX at Postmark inbound so mail to any @fundfly.app
 * address is parsed and POSTed here. We store each message in mailbox_messages;
 * the admin panel renders the shared inbox.
 *
 * Secured by a shared secret in the query string (Postmark doesn't sign inbound
 * payloads). Without POSTMARK_INBOUND_TOKEN set, the endpoint refuses all
 * traffic so it can't be left open by accident.
 */

type InboundPayload = {
  FromFull?: { Email?: string; Name?: string };
  From?: string;
  ToFull?: { Email?: string; Name?: string }[];
  To?: string;
  Subject?: string;
  MessageID?: string;
  TextBody?: string;
  HtmlBody?: string;
  StrippedTextReply?: string;
  Headers?: { Name?: string; Value?: string }[];
  Attachments?: unknown[];
};

function header(payload: InboundPayload, name: string): string | undefined {
  return payload.Headers?.find(
    (h) => h.Name?.toLowerCase() === name.toLowerCase()
  )?.Value;
}

export async function POST(request: NextRequest) {
  const secret = process.env.POSTMARK_INBOUND_TOKEN;
  const token = request.nextUrl.searchParams.get("token");
  if (!secret || token !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: InboundPayload;
  try {
    payload = (await request.json()) as InboundPayload;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const fromEmail = (payload.FromFull?.Email || payload.From || "").trim();
  if (!fromEmail) {
    return Response.json({ ok: true, skipped: "no from" });
  }
  const fromName = payload.FromFull?.Name || null;

  // Recipient: prefer the @fundfly.app address it was sent to.
  const recipients = payload.ToFull || [];
  const ours = recipients.find((r) => r.Email && isOurAddress(r.Email));
  const toEmail = (
    ours?.Email ||
    recipients[0]?.Email ||
    payload.To ||
    "hello@fundfly.app"
  ).trim();

  const subject = payload.Subject || "";
  const messageId = payload.MessageID || null;
  const inReplyTo = header(payload, "In-Reply-To") || null;

  // Thread: if this is a reply to a message we know, reuse its thread. Else
  // group by normalized subject + the external sender.
  let threadKey = threadKeyFor(subject, fromEmail);
  if (inReplyTo) {
    const parent = await db
      .select({ threadKey: mailboxMessages.threadKey })
      .from(mailboxMessages)
      .where(eq(mailboxMessages.messageId, inReplyTo))
      .limit(1);
    if (parent.length > 0) threadKey = parent[0].threadKey;
  }

  try {
    await db
      .insert(mailboxMessages)
      .values({
        direction: "in",
        threadKey,
        fromEmail,
        fromName,
        toEmail,
        subject,
        textBody: payload.TextBody || null,
        htmlBody: payload.HtmlBody || null,
        strippedReply: payload.StrippedTextReply || null,
        messageId,
        inReplyTo,
        isRead: false,
        attachmentsCount: Array.isArray(payload.Attachments)
          ? payload.Attachments.length
          : 0,
      })
      .onConflictDoNothing({ target: mailboxMessages.messageId });
  } catch (err) {
    console.error("[inbound] store failed:", err);
    // Return 500 so Postmark retries.
    return new Response("Store error", { status: 500 });
  }

  return Response.json({ ok: true });
}
