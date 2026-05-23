import { requireAuth } from "@/lib/auth";
import { db, userSettings } from "@/lib/db";
import { and, eq } from "drizzle-orm";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .filter(Boolean);

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
        eq(userSettings.userId, userId),
        eq(userSettings.key, "stripe_bypass")
      )
    )
    .limit(1);

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
      userId,
      key: "stripe_bypass",
      value: enabled ? "true" : "false",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userSettings.userId, userSettings.key],
      set: { value: enabled ? "true" : "false", updatedAt: new Date() },
    });

  return Response.json({ enabled });
}
