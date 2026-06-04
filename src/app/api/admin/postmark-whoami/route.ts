import { requireAuth } from "@/lib/auth";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .filter(Boolean);

/**
 * Admin-only diagnostic: asks Postmark which SERVER the configured
 * POSTMARK_SERVER_TOKEN belongs to (GET /server returns the server tied to the
 * token). Lets us confirm sending is wired to the FundFly server without ever
 * exposing the token value itself.
 */
export async function GET() {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ADMIN_USER_IDS.includes(userId)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const token = process.env.POSTMARK_SERVER_TOKEN || "";
  if (!token) {
    return Response.json({ ok: false, error: "POSTMARK_SERVER_TOKEN not set" });
  }

  const res = await fetch("https://api.postmarkapp.com/server", {
    headers: {
      Accept: "application/json",
      "X-Postmark-Server-Token": token,
    },
  });
  const data = (await res.json().catch(() => ({}))) as {
    ID?: number;
    Name?: string;
  };

  // Source of truth beneath the dashboard: list recent outbound messages for
  // the token's server. If our sends really land here, they'll show up.
  const msgsRes = await fetch(
    "https://api.postmarkapp.com/messages/outbound?count=8&offset=0",
    { headers: { Accept: "application/json", "X-Postmark-Server-Token": token } }
  );
  const msgs = (await msgsRes.json().catch(() => ({}))) as {
    TotalCount?: number;
    Messages?: {
      Recipients?: string[];
      Subject?: string;
      Status?: string;
      SubmittedAt?: string;
    }[];
  };

  // Also do a live send and capture Postmark's RAW response, so we can see
  // ErrorCode / Message / SubmittedAt exactly as Postmark reports them.
  const sendRes = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": token,
    },
    body: JSON.stringify({
      From: "hello@fundfly.app",
      To: "test@blackhole.postmarkapp.com",
      Subject: "FundFly diag send",
      TextBody: "diagnostic",
      MessageStream: "outbound",
    }),
  });
  const sendRaw = await sendRes.json().catch(() => ({}));

  return Response.json({
    serverId: data.ID ?? null,
    serverName: data.Name ?? null,
    tokenLast4: token.slice(-4),
    outboundTotalCount: msgs.TotalCount ?? null,
    recentMessages: (msgs.Messages ?? []).map((m) => ({
      to: m.Recipients,
      subject: m.Subject,
      status: m.Status,
      submittedAt: m.SubmittedAt,
    })),
    liveSend: { httpStatus: sendRes.status, raw: sendRaw },
  });
}
