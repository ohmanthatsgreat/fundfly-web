import { requireAuth } from "@/lib/auth";
import { db, userSettings } from "@/lib/db";
import { and, eq } from "drizzle-orm";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .filter(Boolean);

/**
 * Admin endpoint to grant or revoke "stripe bypass" for any user.
 * When enabled, that user gets free access to all paid AI features
 * (matching, checklist, auto-submission) without an active Stripe sub.
 *
 * - GET (no params)              → admin's own bypass status (legacy)
 * - GET ?userId=<clerk_user_id>  → that user's bypass status
 * - POST { enabled }             → toggle admin's own bypass (legacy)
 * - POST { userId, enabled }     → toggle target user's bypass
 *
 * Only callers in ADMIN_USER_IDS are allowed.
 */

async function readBypass(userId: string): Promise<boolean> {
  const row = await db
    .select()
    .from(userSettings)
    .where(
      and(
        eq(userSettings.userId, userId),
        eq(userSettings.key, "stripe_bypass")
      )
    )
    .limit(1);
  return row.length > 0 && row[0].value === "true";
}

async function writeBypass(userId: string, enabled: boolean): Promise<void> {
  await db
    .insert(userSettings)
    .values({
      userId,
      key: "stripe_bypass",
      value: enabled ? "true" : "false",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userSettings.userId, userSettings.key],
      set: { value: enabled ? "true" : "false", updatedAt: new Date() },
    });
}

export async function GET(request: Request) {
  const userId = await requireAuth();
  if (!ADMIN_USER_IDS.includes(userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId") || userId;

  const enabled = await readBypass(targetUserId);
  return Response.json({ userId: targetUserId, enabled });
}

export async function POST(request: Request) {
  const userId = await requireAuth();
  if (!ADMIN_USER_IDS.includes(userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    enabled: boolean;
    userId?: string;
  };
  const targetUserId = body.userId || userId;

  await writeBypass(targetUserId, body.enabled);

  return Response.json({ userId: targetUserId, enabled: body.enabled });
}
