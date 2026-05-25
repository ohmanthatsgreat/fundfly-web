import { NextRequest } from "next/server";
import {
  db,
  applications,
  applicationSections,
  opportunities,
  userProfiles,
  personalProfiles,
} from "@/lib/db";
import { requireAuth, checkSubscription } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import {
  generateApplicationSections,
  generateSection,
  APPLICATION_SECTIONS,
  PERSONAL_APPLICATION_SECTIONS,
} from "@/lib/ai";

export async function GET(request: NextRequest) {
  const userId = await requireAuth();
  const appId = request.nextUrl.searchParams.get("application_id");

  if (!appId) {
    return Response.json({ error: "application_id required" }, { status: 400 });
  }

  // Verify ownership
  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, parseInt(appId)), eq(applications.userId, userId)))
    .limit(1);

  if (!app) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const sections = await db
    .select()
    .from(applicationSections)
    .where(eq(applicationSections.applicationId, parseInt(appId)));

  return Response.json({ sections });
}

export async function POST(request: NextRequest) {
  const userId = await requireAuth();
  const { application_id, action, section_key } = await request.json();

  // Check subscription — AI generation requires "checklist" feature
  const sub = await checkSubscription(userId, "checklist");
  if (!sub.allowed) {
    return Response.json(
      { error: "subscription_required", feature: "checklist" },
      { status: 403 }
    );
  }

  // Verify ownership
  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, application_id), eq(applications.userId, userId)))
    .limit(1);

  if (!app) {
    return Response.json({ error: "Application not found" }, { status: 404 });
  }

  // Get the opportunity
  const [opp] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, app.opportunityId))
    .limit(1);

  if (!opp) {
    return Response.json({ error: "Opportunity not found" }, { status: 404 });
  }

  // Mode is decided once at application creation and stored on the application
  // row. Read it directly here — no per-action inference.
  const storedMode = (app.mode || "business").toLowerCase();
  const mode: "org" | "personal" = storedMode === "personal" ? "personal" : "org";

  let profile: Record<string, unknown> | undefined;
  if (mode === "personal") {
    const [personalProfile] = await db
      .select()
      .from(personalProfiles)
      .where(eq(personalProfiles.userId, userId))
      .limit(1);
    if (!personalProfile) {
      return Response.json(
        {
          error:
            "This is a personal application but no personal profile was found. Please set one up.",
        },
        { status: 400 }
      );
    }
    profile = personalProfile as unknown as Record<string, unknown>;
  } else {
    const [orgProfile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    if (!orgProfile) {
      return Response.json(
        {
          error:
            "This is a business application but no organization profile was found. Please set one up.",
        },
        { status: 400 }
      );
    }
    profile = orgProfile as unknown as Record<string, unknown>;
  }

  const sectionsTemplate =
    mode === "personal" ? PERSONAL_APPLICATION_SECTIONS : APPLICATION_SECTIONS;

  try {
    if (action === "generate_all") {
      const sections = await generateApplicationSections(profile, opp, mode);

      // Upsert all sections
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i];
        await db
          .insert(applicationSections)
          .values({
            applicationId: application_id,
            sectionKey: s.key,
            sectionTitle: s.title,
            content: s.content,
            sortOrder: i,
            completed: false,
          })
          .onConflictDoUpdate({
            target: [applicationSections.applicationId, applicationSections.sectionKey],
            set: {
              content: s.content,
              sectionTitle: s.title,
              sortOrder: i,
              updatedAt: new Date(),
            },
          });
      }

      // Create empty sections for any missing standard sections
      for (let i = 0; i < sectionsTemplate.length; i++) {
        const def = sectionsTemplate[i];
        const exists = sections.find((s) => s.key === def.key);
        if (!exists) {
          await db
            .insert(applicationSections)
            .values({
              applicationId: application_id,
              sectionKey: def.key,
              sectionTitle: def.title,
              content: "",
              sortOrder: i,
              completed: false,
            })
            .onConflictDoNothing();
        }
      }

      // Update application status
      await db
        .update(applications)
        .set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(applications.id, application_id));

      const allSections = await db
        .select()
        .from(applicationSections)
        .where(eq(applicationSections.applicationId, application_id));

      return Response.json({ success: true, sections: allSections });
    }

    if (action === "regenerate_section" && section_key) {
      const sectionDef = sectionsTemplate.find((s) => s.key === section_key);
      if (!sectionDef) {
        return Response.json({ error: "Unknown section" }, { status: 400 });
      }

      const [existing] = await db
        .select()
        .from(applicationSections)
        .where(
          and(
            eq(applicationSections.applicationId, application_id),
            eq(applicationSections.sectionKey, section_key)
          )
        )
        .limit(1);

      const content = await generateSection(
        profile,
        opp,
        sectionDef.prompt,
        existing?.content || undefined,
        mode
      );

      await db
        .update(applicationSections)
        .set({ content, updatedAt: new Date() })
        .where(
          and(
            eq(applicationSections.applicationId, application_id),
            eq(applicationSections.sectionKey, section_key)
          )
        );

      return Response.json({ success: true, content });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Generation failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const userId = await requireAuth();
  const { section_id, content, completed } = await request.json();

  if (!section_id) {
    return Response.json({ error: "section_id required" }, { status: 400 });
  }

  // Verify ownership through application
  const [section] = await db
    .select()
    .from(applicationSections)
    .where(eq(applicationSections.id, section_id))
    .limit(1);

  if (!section) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, section.applicationId), eq(applications.userId, userId)))
    .limit(1);

  if (!app) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (content !== undefined) updates.content = content;
  if (completed !== undefined) updates.completed = completed;

  await db
    .update(applicationSections)
    .set(updates)
    .where(eq(applicationSections.id, section_id));

  return Response.json({ success: true });
}
