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
    ServerLink?: string;
  };

  // Return only non-secret identifying fields.
  return Response.json({
    httpStatus: res.status,
    serverId: data.ID ?? null,
    serverName: data.Name ?? null,
    tokenLast4: token.slice(-4),
  });
}
