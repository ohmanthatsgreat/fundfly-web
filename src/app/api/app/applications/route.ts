import { NextRequest } from "next/server";
import {
  db,
  applications,
  opportunities,
  userProfiles,
  personalProfiles,
} from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

/**
 * Decide which application mode to use based on opportunity audience and
 * which profiles the user has filled out.
 *
 * Returns { mode } on success, or { error, status } on conflict.
 *
 * Rules:
 *  - audience "personal"     → personal mode (needs personal profile)
 *  - audience "business"     → business mode (needs org profile)
 *  - audience "both" / null  → prefer business if org profile exists,
 *                               else personal if personal profile exists
 */
async function decideApplicationMode(
  userId: string,
  audience: string | null
): Promise<
  | { mode: "business" | "personal" }
  | { error: string; status: number }
> {
  const aud = (audience || "business").toLowerCase();

  const [orgProfile] = await db
    .select({ id: userProfiles.id })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  const [personalProfile] = await db
    .select({ id: personalProfiles.id })
    .from(personalProfiles)
    .where(eq(personalProfiles.userId, userId))
    .limit(1);

  if (aud === "personal") {
    if (!personalProfile) {
      return {
        error:
          "This is a personal grant. Please set up your personal profile first.",
        status: 400,
      };
    }
    return { mode: "personal" };
  }

  if (aud === "business") {
    if (!orgProfile) {
      return {
        error:
          "This is a business / organizational grant. Please set up your organization profile first.",
        status: 400,
      };
    }
    return { mode: "business" };
  }

  // "both" or unknown — pick whichever profile the user has, prefer business
  if (orgProfile) return { mode: "business" };
  if (personalProfile) return { mode: "personal" };
  return {
    error:
      "Please set up your organization or personal profile before starting an application.",
    status: 400,
  };
}

export async function GET(request: NextRequest) {
  const userId = await requireAuth();

  // Single application by id
  const idParam = request.nextUrl.searchParams.get("id");
  if (idParam) {
    const [app] = await db
      .select()
      .from(applications)
      .where(
        and(eq(applications.id, parseInt(idParam)), eq(applications.userId, userId))
      )
      .limit(1);

    if (!app) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ application: app });
  }

  const results = await db
    .select({
      id: applications.id,
      opportunityId: applications.opportunityId,
      status: applications.status,
      mode: applications.mode,
      notes: applications.notes,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
      submittedAt: applications.submittedAt,
      opportunityTitle: opportunities.title,
      opportunityAgency: opportunities.agency,
      opportunityDeadline: opportunities.deadline,
    })
    .from(applications)
    .leftJoin(opportunities, eq(applications.opportunityId, opportunities.id))
    .where(eq(applications.userId, userId));

  return Response.json({ applications: results });
}

export async function POST(request: NextRequest) {
  const userId = await requireAuth();
  const { opportunityId } = await request.json();

  // Return existing application if one already exists for this opportunity
  const [existing] = await db
    .select()
    .from(applications)
    .where(
      and(eq(applications.userId, userId), eq(applications.opportunityId, opportunityId))
    )
    .limit(1);

  if (existing) {
    return Response.json({ application: existing });
  }

  // Look up the opportunity to decide mode
  const [opp] = await db
    .select({ audience: opportunities.audience })
    .from(opportunities)
    .where(eq(opportunities.id, opportunityId))
    .limit(1);

  if (!opp) {
    return Response.json({ error: "Opportunity not found" }, { status: 404 });
  }

  const decision = await decideApplicationMode(userId, opp.audience);
  if ("error" in decision) {
    return Response.json(
      { error: decision.error },
      { status: decision.status }
    );
  }

  const [app] = await db
    .insert(applications)
    .values({
      userId,
      opportunityId,
      status: "draft",
      mode: decision.mode,
    })
    .returning();

  return Response.json({ application: app });
}

export async function PATCH(request: NextRequest) {
  const userId = await requireAuth();
  const { id, status, notes } = await request.json();

  if (!id) {
    return Response.json({ error: "Missing application id" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  const [updated] = await db
    .update(applications)
    .set(updates)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .returning();

  if (!updated) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ application: updated });
}

export async function DELETE(request: NextRequest) {
  const userId = await requireAuth();
  const { id } = await request.json();

  if (!id) {
    return Response.json({ error: "Missing application id" }, { status: 400 });
  }

  await db
    .delete(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)));

  return Response.json({ success: true });
}
