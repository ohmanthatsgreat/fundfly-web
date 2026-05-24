import { auth } from "@clerk/nextjs/server";
import { db, blogPosts } from "@/lib/db";
import { eq } from "drizzle-orm";

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

/** GET a single blog post by ID */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const postId = parseInt(id, 10);
  if (isNaN(postId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  const posts = await db
    .select()
    .from(blogPosts)
    .where(eq(blogPosts.id, postId))
    .limit(1);

  if (posts.length === 0) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(posts[0]);
}

/** PATCH — update a blog post */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const postId = parseInt(id, 10);
  if (isNaN(postId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await request.json();

  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (body.title !== undefined) updateData.title = body.title;
  if (body.slug !== undefined) updateData.slug = body.slug;
  if (body.excerpt !== undefined) updateData.excerpt = body.excerpt;
  if (body.content !== undefined) updateData.content = body.content;
  if (body.metaDescription !== undefined) updateData.metaDescription = body.metaDescription;
  if (body.metaKeywords !== undefined) updateData.metaKeywords = body.metaKeywords;
  if (body.category !== undefined) updateData.category = body.category;
  if (body.tags !== undefined) updateData.tags = body.tags;
  if (body.author !== undefined) updateData.author = body.author;

  // Handle status changes
  if (body.status !== undefined) {
    updateData.status = body.status;
    if (body.status === "published") {
      // Only set publishedAt if it hasn't been published before
      const existing = await db
        .select({ publishedAt: blogPosts.publishedAt })
        .from(blogPosts)
        .where(eq(blogPosts.id, postId))
        .limit(1);
      if (!existing[0]?.publishedAt) {
        updateData.publishedAt = new Date();
      }
    }
  }

  const [updated] = await db
    .update(blogPosts)
    .set(updateData)
    .where(eq(blogPosts.id, postId))
    .returning();

  if (!updated) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(updated);
}

/** DELETE a blog post */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const postId = parseInt(id, 10);
  if (isNaN(postId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(blogPosts)
    .where(eq(blogPosts.id, postId))
    .returning({ id: blogPosts.id });

  if (!deleted) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ ok: true, id: deleted.id });
}
