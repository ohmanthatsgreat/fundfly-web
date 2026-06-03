import { requireAuth } from "@/lib/auth";
import { db, userSettings } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { CLASSIFY_FLAG_KEY } from "@/lib/classify-audience";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .filter(Boolean);

const SYSTEM_USER = "__system__";

export async function GET() {
  const userId = await requireAuth();
  if (!ADMIN_USER_IDS.includes(userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await db
    .select()
    .from(userSettings)
    .where(
      and(
        eq(userSettings.userId, SYSTEM_USER),
        eq(userSettings.key, CLASSIFY_FLAG_KEY)
      )
    )
    .limit(1);

  // Default OFF (paused) when unset.
  return Response.json({ enabled: row.length > 0 && row[0].value === "true" });
}

export async function POST(request: Request) {
  const userId = await requireAuth();
  if (!ADMIN_USER_IDS.includes(userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { enabled } = (await request.json()) as { enabled: boolean };

  await db
    .insert(userSettings)
    .values({
      userId: SYSTEM_USER,
      key: CLASSIFY_FLAG_KEY,
      value: enabled ? "true" : "false",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userSettings.userId, userSettings.key],
      set: { value: enabled ? "true" : "false", updatedAt: new Date() },
    });

  return Response.json({ enabled });
}
