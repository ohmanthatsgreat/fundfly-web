import { NextRequest } from "next/server";
import { requireAuth, checkSubscription } from "@/lib/auth";
import {
  db,
  opportunities,
  aiMatches,
  userProfiles,
  personalProfiles,
  dismissedOpportunities,
  matchScanState,
} from "@/lib/db";
import { eq, and, notInArray, inArray, sql } from "drizzle-orm";
import {
  matchOpportunities,
  matchPersonalOpportunities,
} from "@/lib/ai";

export async function POST(request: NextRequest) {
  const userId = await requireAuth();
  // NOTE: the scan cursor is owned server-side (match_scan_state). We ignore
  // any client-supplied offset so navigating away and back can't lose our
  // place or replay the same first batch forever.
  const { mode = "org", reset = false } = await request.json();
  const BATCH_LIMIT = 500;

  // Check subscription. A user can be blocked for two distinct reasons:
  //   - no active plan/trial         → subscription_required
  //   - plan present but AI cap hit  → ai_limit_reached (margin guard)
  const sub = await checkSubscription(userId, "matching");
  if (!sub.allowed) {
    if (sub.usage?.atLimit) {
      return Response.json(
        {
          error: "ai_limit_reached",
          feature: "matching",
          plan: sub.plan,
          usage: sub.usage,
        },
        { status: 403 }
      );
    }
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

  // Load (or default) this mode's persisted scan cursor.
  const [scanState] = await db
    .select()
    .from(matchScanState)
    .where(
      and(eq(matchScanState.userId, userId), eq(matchScanState.mode, mode))
    )
    .limit(1);

  // "Re-scan from Start" → clear this mode's existing matches AND reset the
  // persisted cursor so the scan genuinely begins from a clean slate.
  if (reset) {
    await db
      .delete(aiMatches)
      .where(and(eq(aiMatches.userId, userId), eq(aiMatches.matchMode, mode)));
  }

  // Forward-only cursor: where this batch starts in the stable ID ordering.
  const startOffset = reset ? 0 : scanState?.scanOffset ?? 0;
  const priorScanned = reset ? 0 : scanState?.scannedCount ?? 0;

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
    .offset(startOffset)
    .limit(BATCH_LIMIT);

  const hasMore = allOpps.length === BATCH_LIMIT;

  // Helper: write the persisted cursor for this (userId, mode).
  async function persistCursor(scanOffset: number, scannedCount: number) {
    await db
      .insert(matchScanState)
      .values({ userId, mode, scanOffset, scannedCount, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [matchScanState.userId, matchScanState.mode],
        set: { scanOffset, scannedCount, updatedAt: new Date() },
      });
  }

  if (allOpps.length === 0) {
    // Nothing left to scan. Persist the (possibly reset) cursor so the UI
    // reflects an accurate "X of Y scanned" on reload.
    await persistCursor(startOffset, priorScanned);
    return Response.json({
      success: true,
      matchesProcessed: 0,
      scanned: 0,
      totalScanned: priorScanned,
      totalAvailable,
      hasMore: false,
      scanCostCents: 0,
      message:
        reset && totalAvailable === 0
          ? "No opportunities to scan."
          : "No more opportunities to scan.",
    });
  }

  // Run AI matching using the library
  try {
    const { matches, costCents: scanCostCents } =
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

    // Advance and persist the cursor so the next scan (even after navigating
    // away) resumes exactly where this one stopped.
    const newOffset = startOffset + allOpps.length;
    const totalScanned = priorScanned + allOpps.length;
    await persistCursor(newOffset, totalScanned);

    return Response.json({
      success: true,
      matchesProcessed: totalMatches,
      scanned: allOpps.length,
      totalScanned,
      totalAvailable,
      hasMore,
      scanCostCents,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI matching failed";
    console.error("AI matching error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
