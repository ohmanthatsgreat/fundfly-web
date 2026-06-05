import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, userEvents } from "@/lib/db";

/**
 * First-party engagement beacon. The in-app tracker POSTs here (via
 * navigator.sendBeacon) on page views and named actions. Best-effort and
 * silent: anonymous or malformed requests are ignored with 204 so the beacon
 * never surfaces errors to users.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return new Response(null, { status: 204 });

  let body: {
    type?: string;
    path?: string;
    name?: string;
    meta?: unknown;
    sessionId?: string;
  };
  try {
    body = JSON.parse(await request.text());
  } catch {
    return new Response(null, { status: 204 });
  }

  const type = String(body.type || "").slice(0, 32);
  if (type !== "page_view" && type !== "action") {
    return new Response(null, { status: 204 });
  }

  await db
    .insert(userEvents)
    .values({
      userId,
      type,
      path: body.path ? String(body.path).slice(0, 512) : null,
      name: body.name ? String(body.name).slice(0, 128) : null,
      meta: body.meta ? JSON.stringify(body.meta).slice(0, 2000) : null,
      sessionId: body.sessionId ? String(body.sessionId).slice(0, 64) : null,
    })
    .catch(() => {});

  return new Response(null, { status: 204 });
}
