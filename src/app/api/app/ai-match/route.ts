import { NextRequest } from "next/server";
import { requireAuth, checkSubscription } from "@/lib/auth";
import {
  db,
  opportunities,
  aiMatches,
  userProfiles,
  personalProfiles,
  dismissedOpportunities,
} from "@/lib/db";
import { eq, and, notInArray, inArray, sql } from "drizzle-orm";
import {
  matchOpportunities,
  matchPersonalOpportunities,
} from "@/lib/ai";

export async function POST(request: NextRequest) {
  const userId = await requireAuth();
  const { mode = "org", offset = 0, reset = false } = await request.json();
  const BATCH_LIMIT = 500;

  // Check subscription
  const sub = await checkSubscription(userId, "matching");
  if (!sub.allowed) {
    return Response.json(
      { error: "subscription_required", feature: "matching" },
      { status: 403 }
    );
  }

  // Load profile.
  let profile: Record<string, unknown> | null = null;
  if (mode === "org") {
    const [row] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    if (!row) {
      return Response.json(
        { error: "Please fill out your organization profile first." },
        { status: 400 }
      );
    }
    profile = row as unknown as Record<string, unknown>;
  } else {
    const [row] = await db
      .select()
      .from(personalProfiles)
      .where(eq(personalProfiles.userId, userId))
      .limit(1);
    if (!row) {
      return Response.json(
        { error: "Please fill out your personal profile first." },
        { status: 400 }
      );
    }
    profile = row as unknown as Record<string, unknown>;
  }

  // Get dismissed IDs to exclude
  const dismissed = await db
    .select({ id: dismissedOpportunities.opportunityId })
    .from(dismissedOpportunities)
    .where(eq(dismissedOpportunities.userId, userId));
  const dismissedIds = dismissed.map((d) => d.id);

  // "Re-scan from Start" → actually clear this mode's existing matches so the
  // scan begins from a clean slate (the offset also resets to 0 below).
  if (reset) {
    await db
      .delete(aiMatches)
      .where(and(eq(aiMatches.userId, userId), eq(aiMatches.matchMode, mode)));
  }

  // Exclude only dismissed opportunities. We deliberately do NOT exclude
  // already-matched rows here: the scan walks the eligible set with a stable
  // ORDER BY + OFFSET, so excluding matched rows would shrink/shift the window
  // and cause batches to skip or overlap. Forward-only offset never revisits a
  // matched row, so there's no wasted re-scoring.
  const excludeIds = dismissedIds;

  // Eligibility filter by mode:
  //   personal mode → audience personal + both
  //   org mode      → audience business + both
  // "both" is included in both modes to handle Zeffy grants that fit either.
  const eligibilityClause = inArray(
    opportunities.audience,
    mode === "personal" ? ["personal", "both"] : ["business", "both"]
  );

  // Compose WHERE: status open + eligibility + not-excluded
  const whereClause = and(
    eq(opportunities.status, "open"),
    eligibilityClause,
    excludeIds.length > 0
      ? notInArray(opportunities.id, excludeIds)
      : undefined
  );

  // Total available opportunities in this audience/status (for "X of Y" display)
  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunities)
    .where(whereClause);
  const totalAvailable = totalRow?.count ?? 0;

  // Load opportunities to score (paginated batch)
  const allOpps = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      agency: opportunities.agency,
      description: opportunities.description,
      type: opportunities.type,
      fundingMin: opportunities.fundingMin,
      fundingMax: opportunities.fundingMax,
      deadline: opportunities.deadline,
      eligibilityTypes: opportunities.eligibilityTypes,
      cfdaNumber: opportunities.cfdaNumber,
    })
    .from(opportunities)
    .where(whereClause)
    // Stable ordering is required for OFFSET pagination to be gap-free and
    // non-overlapping across successive "Keep Searching" batches.
    .orderBy(opportunities.id)
    .offset(reset ? 0 : offset)
    .limit(BATCH_LIMIT);

  const hasMore = allOpps.length === BATCH_LIMIT;

  if (allOpps.length === 0) {
    return Response.json({
      success: true,
      matchesProcessed: 0,
      scanned: 0,
      totalAvailable,
      hasMore: false,
      nextOffset: 0,
      message: "No more opportunities to scan.",
    });
  }

  // Run AI matching using the library
  try {
    const matches =
      mode === "personal"
        ? await matchPersonalOpportunities(profile, allOpps, 20, userId)
        : await matchOpportunities(profile, allOpps, 20, userId);

    // Save results to DB
    let totalMatches = 0;
    for (const m of matches) {
      if (m.opportunity_id && typeof m.score === "number") {
        await db
          .insert(aiMatches)
          .values({
            userId,
            opportunityId: m.opportunity_id,
            matchMode: mode,
            score: m.score,
            summary: m.summary || null,
            matchReasoning: m.match_reasoning || null,
          })
          .onConflictDoUpdate({
            target: [aiMatches.userId, aiMatches.opportunityId, aiMatches.matchMode],
            set: {
              score: m.score,
              summary: m.summary || null,
              matchReasoning: m.match_reasoning || null,
              createdAt: new Date(),
            },
          });
        totalMatches++;
      }
    }

    return Response.json({
      success: true,
      matchesProcessed: totalMatches,
      scanned: allOpps.length,
      totalAvailable,
      hasMore,
      nextOffset: (reset ? 0 : offset) + BATCH_LIMIT,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI matching failed";
    console.error("AI matching error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
