import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sendEmail, renderEmail, APP_URL } from "@/lib/email";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .filter(Boolean);

/**
 * Admin-only: fire a real sample email through Postmark to verify the pipeline
 * (token, sender domain, template). Uses sendEmail directly (not sendOnce) so it
 * always sends and never pollutes the dedup ledger.
 *
 *   GET /api/admin/send-test-email?to=you@example.com
 *
 * Only callers in ADMIN_USER_IDS are allowed.
 */
export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ADMIN_USER_IDS.includes(userId)) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const to = request.nextUrl.searchParams.get("to");
  if (!to) {
    return Response.json(
      { error: "Pass ?to=<email>" },
      { status: 400 }
    );
  }

  const html = renderEmail({
    preheader: "This is a FundFly email pipeline test.",
    heading: "Your email pipeline works ✅",
    bodyHtml: `
      <p style="margin:0 0 12px;">If you're reading this, Postmark is sending from your verified <strong>fundfly.app</strong> domain and the branded template renders correctly.</p>
      <p style="margin:0;">You're clear to ship welcome, submission, billing, and lifecycle emails.</p>`,
    cta: { label: "Open FundFly", url: `${APP_URL}/app` },
    footnote: "Sent via the admin test route — safe to ignore.",
  });

  const res = await sendEmail({
    to,
    subject: "FundFly email test ✅",
    html,
    replyTo: "support@fundfly.app",
    tag: "test",
  });

  return Response.json({ ok: res.ok, result: res });
}
