import { NextRequest } from "next/server";
import { db, portalCredentials } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { decryptCred, normalizePortalDomain } from "@/lib/portal-creds";

const WORKER_SECRET = process.env.WORKER_SECRET || "dev-secret";

/**
 * Internal route — only the worker calls this.
 * Returns decrypted credentials for a given user + portal domain.
 * Auth: Bearer WORKER_SECRET (shared secret with the worker).
 *
 * Query: ?userId=<clerkUserId>&portalDomain=sam.gov
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${WORKER_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = request.nextUrl.searchParams.get("userId");
  const rawDomain = request.nextUrl.searchParams.get("portalDomain");

  if (!userId || !rawDomain) {
    return Response.json(
      { error: "userId and portalDomain required" },
      { status: 400 }
    );
  }

  const portalDomain = normalizePortalDomain(rawDomain);

  const [row] = await db
    .select()
    .from(portalCredentials)
    .where(
      and(
        eq(portalCredentials.userId, userId),
        eq(portalCredentials.portalDomain, portalDomain)
      )
    )
    .limit(1);

  if (!row) {
    return Response.json({ found: false });
  }

  let username: string;
  let password: string;
  try {
    username = decryptCred(row.usernameEnc);
    password = decryptCred(row.passwordEnc);
  } catch {
    return Response.json(
      { error: "decryption failed — credentials may be from a rotated key" },
      { status: 500 }
    );
  }

  // Update last-used timestamp (fire and forget)
  db.update(portalCredentials)
    .set({ lastUsedAt: new Date() })
    .where(eq(portalCredentials.id, row.id))
    .catch(() => {});

  return Response.json({
    found: true,
    portalDomain: row.portalDomain,
    username,
    password,
  });
}
