import { auth } from "@clerk/nextjs/server";
import { generateBlogPost, saveBlogPost } from "@/lib/blog-generator";

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || "")
  .split(",")
  .filter(Boolean);

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId || !ADMIN_USER_IDS.includes(userId)) {
    throw new Error("Forbidden");
  }
  return userId;
}

/** POST — manually generate a blog post */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { category, topic, autoPublish } = body as {
    category?: string;
    topic?: string;
    autoPublish?: boolean;
  };

  try {
    const generated = await generateBlogPost(category, topic);
    const saved = await saveBlogPost(generated, autoPublish ?? false);

    return Response.json({
      ok: true,
      post: {
        id: saved.id,
        slug: saved.slug,
        title: generated.title,
        category: generated.category,
        excerpt: generated.excerpt,
      },
    });
  } catch (err) {
    return Response.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
