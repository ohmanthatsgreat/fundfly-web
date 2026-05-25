import { NextRequest } from "next/server";
import { db, portalCredentials } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import {
  encryptCred,
  normalizePortalDomain,
} from "@/lib/portal-creds";

/**
 * GET — list saved portal credentials for current user.
 * Never returns passwords. Used by the pre-flight UI to show
 * "✓ Saved" / "Add credentials" state per portal.
 */
export async function GET() {
  const userId = await requireAuth();

  const rows = await db
    .select({
      id: portalCredentials.id,
      portalDomain: portalCredentials.portalDomain,
      portalLabel: portalCredentials.portalLabel,
      lastUsedAt: portalCredentials.lastUsedAt,
      createdAt: portalCredentials.createdAt,
    })
    .from(portalCredentials)
    .where(eq(portalCredentials.userId, userId));

  return Response.json({ credentials: rows });
}

/**
 * POST — save or update credentials for a portal.
 * Body: { portalDomain, username, password, portalLabel? }
 */
export async function POST(request: NextRequest) {
  const userId = await requireAuth();
  const body = await request.json();
  const { username, password, portalLabel } = body;

  if (!body.portalDomain || !username || !password) {
    return Response.json(
      { error: "portalDomain, username, and password are required" },
      { status: 400 }
    );
  }

  const portalDomain = normalizePortalDomain(body.portalDomain);
  if (!portalDomain) {
    return Response.json({ error: "Invalid portalDomain" }, { status: 400 });
  }

  let usernameEnc: string;
  let passwordEnc: string;
  try {
    usernameEnc = encryptCred(username);
    passwordEnc = encryptCred(password);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Encryption failed";
    return Response.json({ error: msg }, { status: 500 });
  }

  // Upsert (unique on userId + portalDomain)
  const [existing] = await db
    .select()
    .from(portalCredentials)
    .where(
      and(
        eq(portalCredentials.userId, userId),
        eq(portalCredentials.portalDomain, portalDomain)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(portalCredentials)
      .set({
        usernameEnc,
        passwordEnc,
        portalLabel: portalLabel ?? existing.portalLabel,
        updatedAt: new Date(),
      })
      .where(eq(portalCredentials.id, existing.id));
    return Response.json({ success: true, id: existing.id });
  }

  const [inserted] = await db
    .insert(portalCredentials)
    .values({
      userId,
      portalDomain,
      portalLabel: portalLabel ?? null,
      usernameEnc,
      passwordEnc,
    })
    .returning();

  return Response.json({ success: true, id: inserted.id });
}

/**
 * DELETE — remove credentials for a portal.
 * Query: ?portalDomain=sam.gov
 */
export async function DELETE(request: NextRequest) {
  const userId = await requireAuth();
  const raw = request.nextUrl.searchParams.get("portalDomain");
  if (!raw) {
    return Response.json(
      { error: "portalDomain required" },
      { status: 400 }
    );
  }
  const portalDomain = normalizePortalDomain(raw);

  await db
    .delete(portalCredentials)
    .where(
      and(
        eq(portalCredentials.userId, userId),
        eq(portalCredentials.portalDomain, portalDomain)
      )
    );

  return Response.json({ success: true });
}
