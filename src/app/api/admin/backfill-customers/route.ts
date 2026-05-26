import { auth, clerkClient } from "@clerk/nextjs/server";
import { db, customers } from "@/lib/db";
import { inArray } from "drizzle-orm";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .filter(Boolean);

/**
 * One-shot backfill: pull every Clerk user and create a `customers` row for
 * anyone we don't already have. Useful after deploying the user.created
 * webhook to catch users who signed up before the webhook existed.
 *
 * Safe to re-run — uses getOrCreateCustomer semantics (insert-if-missing).
 *
 * Admin only.
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId || !ADMIN_USER_IDS.includes(userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const clerk = await clerkClient();

  // Page through all Clerk users. Clerk's API caps page size at 500.
  const PAGE = 500;
  let offset = 0;
  let totalClerk = 0;
  let inserted = 0;
  const skipped: { id: string; reason: string }[] = [];

  while (true) {
    const page = await clerk.users.getUserList({
      limit: PAGE,
      offset,
    });
    const list = page.data;
    if (!list || list.length === 0) break;
    totalClerk += list.length;

    // Which of these are already in our DB?
    const ids = list.map((u) => u.id);
    const existing = await db
      .select({ clerkUserId: customers.clerkUserId })
      .from(customers)
      .where(inArray(customers.clerkUserId, ids));
    const existingSet = new Set(existing.map((r) => r.clerkUserId));

    for (const u of list) {
      if (existingSet.has(u.id)) continue;

      const primary =
        u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ||
        u.emailAddresses[0];
      const email = primary?.emailAddress;
      if (!email) {
        skipped.push({ id: u.id, reason: "no email" });
        continue;
      }

      const name =
        [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || null;

      try {
        await db
          .insert(customers)
          .values({ clerkUserId: u.id, email, name })
          .onConflictDoNothing();
        inserted++;
      } catch (err) {
        skipped.push({
          id: u.id,
          reason: err instanceof Error ? err.message : "insert failed",
        });
      }
    }

    if (list.length < PAGE) break;
    offset += PAGE;
  }

  return Response.json({
    success: true,
    totalClerk,
    inserted,
    skipped,
  });
}
