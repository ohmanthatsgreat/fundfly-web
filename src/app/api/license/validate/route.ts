import { NextRequest } from "next/server";
import { db, licenseKeys, subscriptions } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const { key, machineId } = await request.json();

  if (!key) {
    return Response.json({ valid: false, error: "Missing license key" });
  }

  const trimmedKey = key.trim().toUpperCase();

  const [license] = await db
    .select()
    .from(licenseKeys)
    .where(eq(licenseKeys.key, trimmedKey))
    .limit(1);

  if (!license) {
    return Response.json({ valid: false, error: "Invalid license key" });
  }

  if (!license.active) {
    return Response.json({
      valid: false,
      error: "License key has been deactivated",
    });
  }

  // Check active subscription
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.customerId, license.customerId),
        inArray(subscriptions.status, ["active", "trialing"])
      )
    )
    .limit(1);

  if (!sub) {
    return Response.json({
      valid: false,
      error: "Subscription is not active",
    });
  }

  // Machine binding
  if (machineId) {
    if (!license.machineId) {
      // First activation — bind to this machine
      await db
        .update(licenseKeys)
        .set({ machineId, lastValidatedAt: new Date() })
        .where(eq(licenseKeys.id, license.id));
    } else if (license.machineId !== machineId) {
      return Response.json({
        valid: false,
        error:
          "License is activated on another machine. Deactivate it first from your dashboard.",
      });
    } else {
      await db
        .update(licenseKeys)
        .set({ lastValidatedAt: new Date() })
        .where(eq(licenseKeys.id, license.id));
    }
  }

  const plan = license.plan;
  return Response.json({
    valid: true,
    plan,
    entitlements: {
      matching: plan === "matching" || plan === "submissions",
      submissions: plan === "submissions",
    },
    expiresAt: sub.currentPeriodEnd.toISOString(),
  });
}
