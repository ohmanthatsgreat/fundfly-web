import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db, mailboxMessages } from "@/lib/db";
import { and, desc, eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
import { threadKeyFor } from "@/lib/mailbox";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .filter(Boolean);

const DEFAULT_FROM_EMAIL = "hello@fundfly.app";

async function gate(): Promise<string | null> {
  try {
    const userId = await requireAuth();
    return ADMIN_USER_IDS.includes(userId) ? userId : null;
  } catch {
    return null;
  }
}

/**
 * GET                 → thread summaries (latest message + unread count each)
 * GET ?thread=<key>   → all messages in a thread (oldest→newest); marks read
 * POST                → send a new email or reply (logs an outbound row)
 */
export async function GET(request: NextRequest) {
  if (!(await gate())) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const threadKey = request.nextUrl.searchParams.get("thread");

  if (threadKey) {
    const messages = await db
      .select()
      .from(mailboxMessages)
      .where(eq(mailboxMessages.threadKey, threadKey))
      .orderBy(mailboxMessages.createdAt);

    // Mark inbound messages in this thread as read.
    await db
      .update(mailboxMessages)
      .set({ isRead: true })
      .where(
        and(
          eq(mailboxMessages.threadKey, threadKey),
          eq(mailboxMessages.direction, "in"),
          eq(mailboxMessages.isRead, false)
        )
      )
      .catch(() => {});

    return Response.json({ messages });
  }

  // Thread list — aggregate the most recent messages in JS (low volume).
  const recent = await db
    .select()
    .from(mailboxMessages)
    .orderBy(desc(mailboxMessages.createdAt))
    .limit(1000);

  type Thread = {
    threadKey: string;
    subject: string | null;
    participant: string;
    lastAt: Date;
    lastDirection: string;
    lastSnippet: string;
    unread: number;
    count: number;
  };
  const map = new Map<string, Thread>();
  for (const m of recent) {
    const ext = m.direction === "in" ? m.fromEmail : m.toEmail;
    let t = map.get(m.threadKey);
    if (!t) {
      t = {
        threadKey: m.threadKey,
        subject: m.subject,
        participant: ext,
        lastAt: m.createdAt,
        lastDirection: m.direction,
        lastSnippet: (m.strippedReply || m.textBody || "").slice(0, 140),
        unread: 0,
        count: 0,
      };
      map.set(m.threadKey, t);
    }
    t.count += 1;
    if (m.direction === "in" && !m.isRead) t.unread += 1;
  }

  const threads = Array.from(map.values()).sort(
    (a, b) => b.lastAt.getTime() - a.lastAt.getTime()
  );
  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

  return Response.json({ threads, totalUnread });
}

export async function POST(request: NextRequest) {
  if (!(await gate())) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  let body: {
    to?: string;
    subject?: string;
    text?: string;
    from?: string;
    threadKey?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const to = (body.to || "").trim();
  const subject = (body.subject || "").trim();
  const text = (body.text || "").trim();
  if (!to || !subject || !text) {
    return Response.json(
      { error: "to, subject, and text are required" },
      { status: 400 }
    );
  }

  const from = (body.from || DEFAULT_FROM_EMAIL).trim();
  const fromEmail = from.match(/<([^>]+)>/)?.[1] || from;
  const threadKey = body.threadKey || threadKeyFor(subject, to);

  // Threading: reply In-Reply-To / References the latest message in the thread.
  let headers: { Name: string; Value: string }[] | undefined;
  if (body.threadKey) {
    const last = await db
      .select({ messageId: mailboxMessages.messageId })
      .from(mailboxMessages)
      .where(eq(mailboxMessages.threadKey, threadKey))
      .orderBy(desc(mailboxMessages.createdAt))
      .limit(1);
    const ref = last[0]?.messageId;
    if (ref) {
      headers = [
        { Name: "In-Reply-To", Value: ref },
        { Name: "References", Value: ref },
      ];
    }
  }

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0f172a;white-space:pre-wrap;">${escapeHtml(
    text
  )}</div>`;

  const res = await sendEmail({
    to,
    subject,
    html,
    text,
    from,
    replyTo: fromEmail,
    headers,
    tag: "mailbox",
  });

  if (!res.ok) {
    return Response.json(
      { error: res.error || "send failed" },
      { status: 502 }
    );
  }

  // Generate a Message-ID we can thread future replies against.
  const outMsgId = `<${res.providerId || crypto.randomUUID()}@fundfly.app>`;
  const [row] = await db
    .insert(mailboxMessages)
    .values({
      direction: "out",
      threadKey,
      fromEmail,
      fromName: "FundFly",
      toEmail: to,
      subject,
      textBody: text,
      htmlBody: html,
      messageId: outMsgId,
      providerId: res.providerId,
      isRead: true,
    })
    .returning();

  return Response.json({ ok: true, message: row });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
