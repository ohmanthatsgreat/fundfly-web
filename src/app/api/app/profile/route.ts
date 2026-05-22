import { NextRequest } from "next/server";
import { db, userProfiles } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function GET() {
  const userId = await requireAuth();
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return Response.json({ profile: profile || null });
}

export async function PUT(request: NextRequest) {
  const userId = await requireAuth();
  const data = await request.json();

  // Remove non-schema fields
  const { id, userId: _, updatedAt, ...profileData } = data;

  const existing = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(userProfiles)
      .set({ ...profileData, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId));
  } else {
    await db.insert(userProfiles).values({ ...profileData, userId });
  }

  return Response.json({ success: true });
}
