import { NextRequest } from "next/server";
import { generateDailyBlogPosts } from "@/lib/blog-generator";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const result = await generateDailyBlogPosts(2);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(
      `[cron/blog] Generated ${result.generated} posts in ${duration}s — ${result.posts
        .map((p) => `"${p.title}" (${p.category})`)
        .join(", ")}`
    );

    return Response.json({
      ok: true,
      ...result,
      durationSeconds: duration,
    });
  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[cron/blog] Failed after ${duration}s:`, err);

    return Response.json(
      {
        ok: false,
        error: String(err),
        durationSeconds: duration,
      },
      { status: 500 }
    );
  }
}
