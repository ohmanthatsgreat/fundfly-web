import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, customers, licenseKeys } from "@/lib/db";
import { eq, and } from "drizzle-orm";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { keyId } = await request.json();

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.clerkUserId, userId))
    .limit(1);

  if (!customer) {
    return Response.json({ error: "Customer not found" }, { status: 404 });
  }

  await db
    .update(licenseKeys)
    .set({ machineId: null })
    .where(
      and(eq(licenseKeys.id, keyId), eq(licenseKeys.customerId, customer.id))
    );

  return Response.json({ success: true });
}
