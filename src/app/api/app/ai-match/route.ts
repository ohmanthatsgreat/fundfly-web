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
import { eq, notInArray } from "drizzle-orm";
import { matchOpportunities, matchPersonalOpportunities } from "@/lib/ai";

export async function POST(request: NextRequest) {
  const userId = await requireAuth();
  const { mode = "org" } = await request.json();

  // Check subscription
  const sub = await checkSubscription(userId, "matching");
  if (!sub.allowed) {
    return Response.json(
      { error: "subscription_required", feature: "matching" },
      { status: 403 }
    );
  }

  // Load profile
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

  // Load opportunities to score
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
    .where(
      dismissedIds.length > 0
        ? notInArray(opportunities.id, dismissedIds)
        : undefined
    )
    .limit(500);

  // Run AI matching using the library
  try {
    const matches =
      mode === "personal"
        ? await matchPersonalOpportunities(profile, allOpps)
        : await matchOpportunities(profile, allOpps);

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

    return Response.json({ success: true, matchesProcessed: totalMatches });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "AI matching failed";
    console.error("AI matching error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}
