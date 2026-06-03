import { NextRequest } from "next/server";
import { db, userSettings } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Per-user UI preferences, stored in user_settings (key/value).
 * Only whitelisted keys are readable/writable here so a user can't poke at
 * privileged settings like `stripe_bypass`.
 */
const ALLOWED_KEYS = ["show_closed_opps"] as const;
type AllowedKey = (typeof ALLOWED_KEYS)[number];

export async function GET() {
  const userId = await requireAuth();
  const rows = await db
    .select({ key: userSettings.key, value: userSettings.value })
    .from(userSettings)
    .where(
      and(
        eq(userSettings.userId, userId),
        inArray(userSettings.key, ALLOWED_KEYS as unknown as string[])
      )
    );

  const prefs: Record<string, string> = {};
  for (const r of rows) prefs[r.key] = r.value;
  return Response.json({ prefs });
}

export async function POST(request: NextRequest) {
  const userId = await requireAuth();
  const { key, value } = await request.json();

  if (!ALLOWED_KEYS.includes(key as AllowedKey)) {
    return Response.json({ error: "Unknown preference" }, { status: 400 });
  }

  await db
    .insert(userSettings)
    .values({ userId, key, value: String(value), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [userSettings.userId, userSettings.key],
      set: { value: String(value), updatedAt: new Date() },
    });

  return Response.json({ success: true });
}
