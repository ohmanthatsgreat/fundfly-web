import { NextRequest } from "next/server";
import { recordCallCost } from "@/lib/ai-cost";

const WORKER_SECRET = process.env.WORKER_SECRET || "dev-secret";

/**
 * Internal route — only the worker calls this.
 * Records a single AI call's cost against the user's billing period.
 * Auth: Bearer WORKER_SECRET.
 *
 * Body: {
 *   userId: string,
 *   model: string,
 *   usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }
 * }
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${WORKER_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    userId?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!body.model || !body.usage) {
    return Response.json(
      { error: "model and usage are required" },
      { status: 400 }
    );
  }

  // recordCallCost handles its own errors. Run it without awaiting on the
  // critical path — worker doesn't need to block on persistence.
  await recordCallCost(body.userId ?? null, body.model, {
    usage: body.usage as never,
  });

  return Response.json({ success: true });
}
