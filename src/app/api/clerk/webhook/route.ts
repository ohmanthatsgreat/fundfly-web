import { NextRequest } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { getOrCreateCustomer } from "@/lib/auth";

/**
 * Clerk webhook receiver.
 *
 * Subscribe in the Clerk Dashboard to `user.created` (and optionally
 * `user.updated`) and point it at `https://fundfly.app/api/clerk/webhook`.
 * Signing secret goes into env as `CLERK_WEBHOOK_SIGNING_SECRET`.
 *
 * On `user.created` we mirror the new account into our local `customers`
 * table so they show up in admin even before they hit Stripe checkout.
 */
export async function POST(request: NextRequest) {
  let evt;
  try {
    evt = await verifyWebhook(request);
  } catch (err) {
    console.error("[clerk-webhook] Signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    if (evt.type === "user.created" || evt.type === "user.updated") {
      const userData = evt.data;
      const userId = userData.id;
      if (!userId) {
        return Response.json({ ok: true, skipped: "no user id" });
      }

      // Pick the primary email (Clerk users can have multiple)
      const primaryEmailId = userData.primary_email_address_id;
      const emails = userData.email_addresses || [];
      const primary =
        emails.find((e) => e.id === primaryEmailId) || emails[0];
      const email = primary?.email_address;
      if (!email) {
        console.warn("[clerk-webhook] User has no email:", userId);
        return Response.json({ ok: true, skipped: "no email" });
      }

      const name =
        [userData.first_name, userData.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() || null;

      await getOrCreateCustomer(userId, email, name || undefined);

      console.log(
        `[clerk-webhook] ${evt.type}: synced ${userId} (${email}) to customers table`
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[clerk-webhook] Handler failed:", err);
    // Return 500 so Clerk retries
    return new Response("Handler error", { status: 500 });
  }
}
