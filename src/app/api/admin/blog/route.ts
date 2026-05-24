import { auth } from "@clerk/nextjs/server";
import { db, blogPosts } from "@/lib/db";
import { desc, sql } from "drizzle-orm";

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

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const posts = await db
    .select({
      id: blogPosts.id,
      slug: blogPosts.slug,
      title: blogPosts.title,
      excerpt: blogPosts.excerpt,
      category: blogPosts.category,
      status: blogPosts.status,
      author: blogPosts.author,
      publishedAt: blogPosts.publishedAt,
      createdAt: blogPosts.createdAt,
      updatedAt: blogPosts.updatedAt,
    })
    .from(blogPosts)
    .orderBy(desc(blogPosts.createdAt));

  const [countResult] = await db
    .select({
      total: sql<number>`count(*)`,
      published: sql<number>`count(*) filter (where ${blogPosts.status} = 'published')`,
      draft: sql<number>`count(*) filter (where ${blogPosts.status} = 'draft')`,
    })
    .from(blogPosts);

  return Response.json({
    posts,
    counts: {
      total: countResult.total,
      published: countResult.published,
      draft: countResult.draft,
    },
  });
}
