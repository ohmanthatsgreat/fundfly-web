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
import { eq, notInArray, sql } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

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
  let profileText = "";
  if (mode === "org") {
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    if (!profile) {
      return Response.json(
        { error: "Please fill out your organization profile first." },
        { status: 400 }
      );
    }
    profileText = JSON.stringify(profile);
  } else {
    const [profile] = await db
      .select()
      .from(personalProfiles)
      .where(eq(personalProfiles.userId, userId))
      .limit(1);
    if (!profile) {
      return Response.json(
        { error: "Please fill out your personal profile first." },
        { status: 400 }
      );
    }
    profileText = JSON.stringify(profile);
  }

  // Get dismissed IDs
  const dismissed = await db
    .select({ id: dismissedOpportunities.opportunityId })
    .from(dismissedOpportunities)
    .where(eq(dismissedOpportunities.userId, userId));
  const dismissedIds = dismissed.map((d) => d.id);

  // Get opportunities in batches
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
    })
    .from(opportunities)
    .where(
      dismissedIds.length > 0
        ? notInArray(opportunities.id, dismissedIds)
        : undefined
    )
    .limit(500); // Process top 500 at a time

  // Batch in groups of 25 for AI
  const batchSize = 25;
  let totalMatches = 0;

  for (let i = 0; i < allOpps.length; i += batchSize) {
    const batch = allOpps.slice(i, i + batchSize);

    const oppSummaries = batch
      .map(
        (o) =>
          `ID: ${o.id}\nTitle: ${o.title}\nAgency: ${o.agency || "N/A"}\nType: ${o.type}\nFunding: $${o.fundingMin || 0} - $${o.fundingMax || 0}\nDeadline: ${o.deadline || "Rolling"}\nDescription: ${(o.description || "").slice(0, 300)}`
      )
      .join("\n---\n");

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 4096,
        system:
          "You are a grant matching expert. Score each opportunity 0-100 against the applicant profile. Return ONLY a JSON array of objects with: opportunity_id, score (integer 0-100), summary (1 sentence why it matches or doesn't). No other text.",
        messages: [
          {
            role: "user",
            content: `Applicant Profile:\n${profileText}\n\nOpportunities:\n${oppSummaries}\n\nScore each opportunity 0-100. Return JSON array only.`,
          },
        ],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Parse JSON from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const scores = JSON.parse(jsonMatch[0]);
        for (const s of scores) {
          if (s.opportunity_id && typeof s.score === "number") {
            await db
              .insert(aiMatches)
              .values({
                userId,
                opportunityId: s.opportunity_id,
                matchMode: mode,
                score: s.score,
                summary: s.summary || null,
              })
              .onConflictDoUpdate({
                target: [aiMatches.userId, aiMatches.opportunityId, aiMatches.matchMode],
                set: {
                  score: s.score,
                  summary: s.summary || null,
                  createdAt: new Date(),
                },
              });
            totalMatches++;
          }
        }
      }
    } catch (err) {
      console.error("AI matching error:", err);
    }
  }

  return Response.json({ success: true, matchesProcessed: totalMatches });
}
