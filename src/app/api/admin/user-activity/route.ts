import { requireAuth } from "@/lib/auth";
import {
  db,
  customers,
  userProfiles,
  personalProfiles,
  savedOpportunities,
  aiMatches,
  applications,
  applicationSections,
  submissionPlans,
  aiUsageEvents,
  subscriptions,
  trials,
  creditTopups,
  userEvents,
} from "@/lib/db";
import { eq, sql, desc } from "drizzle-orm";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .filter(Boolean);

/**
 * Admin-only: a derived user-activity / funnel report. No event tracking needed
 * — every milestone is already timestamped in our tables, so we stitch them
 * into a per-user journey + an aggregate funnel that shows where people drop off.
 *
 * Funnel (ordered): signed_up → profile → matches → application → content →
 * checklist → auto_submit → submitted.
 */

export const FUNNEL: { key: string; label: string }[] = [
  { key: "signed_up", label: "Signed up" },
  { key: "profile", label: "Built profile" },
  { key: "matches", label: "Got AI matches" },
  { key: "application", label: "Started application" },
  { key: "content", label: "Generated content" },
  { key: "checklist", label: "Built checklist" },
  { key: "auto_submit", label: "Ran auto-submit" },
  { key: "submitted", label: "Submitted" },
];

const ms = (d: unknown): number =>
  d ? new Date(d as string).getTime() : 0;
const iso = (d: unknown): string | null =>
  d ? new Date(d as string).toISOString() : null;

export async function GET() {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ADMIN_USER_IDS.includes(userId)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  // ── Pull the raw signals (small data; aggregate in JS) ──────────────────────
  const [
    custs,
    orgProf,
    persProf,
    saved,
    matchAgg,
    apps,
    sectionAgg,
    plansRaw,
    aiAgg,
    aiRecent,
    subs,
    trialRows,
    topups,
    engAgg,
    pathAgg,
    pvRecent,
  ] = await Promise.all([
    db
      .select({
        clerkUserId: customers.clerkUserId,
        email: customers.email,
        name: customers.name,
        createdAt: customers.createdAt,
      })
      .from(customers),
    db
      .select({ userId: userProfiles.userId, at: userProfiles.updatedAt })
      .from(userProfiles),
    db
      .select({ userId: personalProfiles.userId, at: personalProfiles.updatedAt })
      .from(personalProfiles),
    db
      .select({
        userId: savedOpportunities.userId,
        n: sql<number>`count(*)::int`,
        first: sql<string>`min(${savedOpportunities.savedAt})`,
      })
      .from(savedOpportunities)
      .groupBy(savedOpportunities.userId),
    db
      .select({
        userId: aiMatches.userId,
        n: sql<number>`count(*)::int`,
        first: sql<string>`min(${aiMatches.createdAt})`,
        last: sql<string>`max(${aiMatches.createdAt})`,
      })
      .from(aiMatches)
      .groupBy(aiMatches.userId),
    db
      .select({
        userId: applications.userId,
        id: applications.id,
        status: applications.status,
        submittedAt: applications.submittedAt,
        createdAt: applications.createdAt,
        updatedAt: applications.updatedAt,
      })
      .from(applications),
    db
      .select({
        userId: applications.userId,
        n: sql<number>`count(*)::int`,
        first: sql<string>`min(${applicationSections.updatedAt})`,
        last: sql<string>`max(${applicationSections.updatedAt})`,
      })
      .from(applicationSections)
      .innerJoin(applications, eq(applicationSections.applicationId, applications.id))
      .groupBy(applications.userId),
    db
      .select({
        userId: applications.userId,
        status: submissionPlans.status,
        createdAt: submissionPlans.createdAt,
        updatedAt: submissionPlans.updatedAt,
      })
      .from(submissionPlans)
      .innerJoin(applications, eq(submissionPlans.applicationId, applications.id)),
    db
      .select({
        userId: aiUsageEvents.userId,
        n: sql<number>`count(*)::int`,
        last: sql<string>`max(${aiUsageEvents.createdAt})`,
      })
      .from(aiUsageEvents)
      .groupBy(aiUsageEvents.userId),
    db
      .select({
        userId: aiUsageEvents.userId,
        feature: aiUsageEvents.feature,
        at: aiUsageEvents.createdAt,
      })
      .from(aiUsageEvents)
      .orderBy(desc(aiUsageEvents.createdAt))
      .limit(400),
    db
      .select({
        clerkUserId: customers.clerkUserId,
        plan: subscriptions.plan,
        status: subscriptions.status,
      })
      .from(subscriptions)
      .innerJoin(customers, eq(subscriptions.customerId, customers.id)),
    db
      .select({ userId: trials.userId, plan: trials.plan, startedAt: trials.startedAt })
      .from(trials),
    db
      .select({
        userId: creditTopups.userId,
        n: sql<number>`count(*)::int`,
      })
      .from(creditTopups)
      .groupBy(creditTopups.userId),
    // Engagement (first-party beacon): sessions, page views, first/last seen.
    db
      .select({
        userId: userEvents.userId,
        sessions: sql<number>`count(distinct ${userEvents.sessionId})::int`,
        pageViews: sql<number>`count(*) filter (where ${userEvents.type} = 'page_view')::int`,
        events: sql<number>`count(*)::int`,
        firstSeen: sql<string>`min(${userEvents.createdAt})`,
        lastSeen: sql<string>`max(${userEvents.createdAt})`,
      })
      .from(userEvents)
      .groupBy(userEvents.userId),
    // Most-visited pages per user.
    db
      .select({
        userId: userEvents.userId,
        path: userEvents.path,
        n: sql<number>`count(*)::int`,
      })
      .from(userEvents)
      .where(eq(userEvents.type, "page_view"))
      .groupBy(userEvents.userId, userEvents.path),
    // Recent page views (for the per-user activity stream).
    db
      .select({
        userId: userEvents.userId,
        path: userEvents.path,
        at: userEvents.createdAt,
      })
      .from(userEvents)
      .where(eq(userEvents.type, "page_view"))
      .orderBy(desc(userEvents.createdAt))
      .limit(500),
  ]);

  // ── Index the aggregates by user id ─────────────────────────────────────────
  const byUser = <T extends { userId: string }>(rows: T[]) => {
    const m = new Map<string, T>();
    for (const r of rows) m.set(r.userId, r);
    return m;
  };
  const profM = byUser(orgProf);
  const persM = byUser(persProf);
  const savedM = byUser(saved);
  const matchM = byUser(matchAgg);
  const sectionM = byUser(sectionAgg);
  const aiM = byUser(aiAgg);
  const topupM = byUser(topups);
  const trialM = byUser(trialRows);

  const appsByUser = new Map<string, typeof apps>();
  for (const a of apps) {
    const arr = appsByUser.get(a.userId) || [];
    arr.push(a);
    appsByUser.set(a.userId, arr);
  }
  const plansByUser = new Map<string, typeof plansRaw>();
  for (const p of plansRaw) {
    const arr = plansByUser.get(p.userId) || [];
    arr.push(p);
    plansByUser.set(p.userId, arr);
  }
  const aiEventsByUser = new Map<string, typeof aiRecent>();
  for (const e of aiRecent) {
    const arr = aiEventsByUser.get(e.userId) || [];
    arr.push(e);
    aiEventsByUser.set(e.userId, arr);
  }
  const subsByUser = new Map<string, { plan: string; status: string }[]>();
  for (const s of subs) {
    const arr = subsByUser.get(s.clerkUserId) || [];
    arr.push({ plan: s.plan, status: s.status });
    subsByUser.set(s.clerkUserId, arr);
  }
  const engM = byUser(engAgg);
  const pathsByUser = new Map<string, { path: string; n: number }[]>();
  for (const p of pathAgg) {
    if (!p.path) continue;
    const arr = pathsByUser.get(p.userId) || [];
    arr.push({ path: p.path, n: p.n });
    pathsByUser.set(p.userId, arr);
  }
  const pvByUser = new Map<string, typeof pvRecent>();
  for (const e of pvRecent) {
    const arr = pvByUser.get(e.userId) || [];
    arr.push(e);
    pvByUser.set(e.userId, arr);
  }

  const RAN = new Set(["running", "completed", "failed", "cancelled"]);

  const users = custs.map((c) => {
    const uid = c.clerkUserId;
    const userApps = appsByUser.get(uid) || [];
    const userPlans = plansByUser.get(uid) || [];

    const profAt = profM.get(uid)?.at || persM.get(uid)?.at || null;
    const firstAppAt = userApps.length
      ? userApps.reduce((min, a) => (ms(a.createdAt) < ms(min) ? a.createdAt : min), userApps[0].createdAt)
      : null;
    const firstChecklistAt = userPlans.length
      ? userPlans.reduce((min, p) => (ms(p.createdAt) < ms(min) ? p.createdAt : min), userPlans[0].createdAt)
      : null;
    const ranPlan = userPlans.find((p) => RAN.has(p.status || ""));
    const submittedAt =
      userApps.find((a) => a.submittedAt)?.submittedAt ||
      (userPlans.find((p) => p.status === "completed")?.updatedAt ?? null);

    // Stage timestamps (null = not reached).
    const stages: Record<string, string | null> = {
      signed_up: iso(c.createdAt),
      profile: iso(profAt),
      matches: iso(matchM.get(uid)?.first),
      application: iso(firstAppAt),
      content: iso(sectionM.get(uid)?.first),
      checklist: iso(firstChecklistAt),
      auto_submit: iso(ranPlan?.updatedAt),
      submitted: iso(submittedAt),
    };

    // Furthest stage reached (highest index with a timestamp).
    let furthestIdx = 0;
    FUNNEL.forEach((s, i) => {
      if (stages[s.key]) furthestIdx = i;
    });

    const eng = engM.get(uid);

    // Last activity = newest timestamp across every signal we have, including
    // the engagement beacon's last-seen (the most precise signal once tracking
    // is collecting data).
    const lastActiveMs = Math.max(
      ms(c.createdAt),
      ms(profAt),
      ms(savedM.get(uid)?.first),
      ms(matchM.get(uid)?.last),
      ...userApps.map((a) => ms(a.updatedAt)),
      ms(sectionM.get(uid)?.last),
      ...userPlans.map((p) => ms(p.updatedAt)),
      ms(aiM.get(uid)?.last),
      ms(eng?.lastSeen)
    );

    const topPaths = (pathsByUser.get(uid) || [])
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);
    const recentPageViews = (pvByUser.get(uid) || [])
      .slice(0, 15)
      .map((e) => ({ path: e.path, at: iso(e.at) }));

    return {
      clerkUserId: uid,
      email: c.email,
      name: c.name,
      signedUpAt: iso(c.createdAt),
      lastActiveAt: lastActiveMs ? new Date(lastActiveMs).toISOString() : null,
      furthestStage: FUNNEL[furthestIdx].key,
      furthestStageLabel: FUNNEL[furthestIdx].label,
      furthestIdx,
      stages,
      counts: {
        matches: matchM.get(uid)?.n || 0,
        saved: savedM.get(uid)?.n || 0,
        applications: userApps.length,
        plans: userPlans.length,
        aiActions: aiM.get(uid)?.n || 0,
        creditTopups: topupM.get(uid)?.n || 0,
      },
      subscriptions: subsByUser.get(uid) || [],
      trial: trialM.get(uid) ? { plan: trialM.get(uid)!.plan } : null,
      recentAiActions: (aiEventsByUser.get(uid) || [])
        .slice(0, 12)
        .map((e) => ({ feature: e.feature, at: iso(e.at) })),
      engagement: {
        sessions: eng?.sessions || 0,
        pageViews: eng?.pageViews || 0,
        events: eng?.events || 0,
        firstSeen: iso(eng?.firstSeen),
        lastSeen: iso(eng?.lastSeen),
        topPaths,
        recentPageViews,
      },
    };
  });

  // Sort: most recently active first.
  users.sort((a, b) => ms(b.lastActiveAt) - ms(a.lastActiveAt));

  // Aggregate funnel: how many users reached each stage.
  const funnel = FUNNEL.map((s, i) => ({
    key: s.key,
    label: s.label,
    count: users.filter((u) => u.furthestIdx >= i).length,
  }));

  return Response.json({ funnel, users, total: users.length });
}
