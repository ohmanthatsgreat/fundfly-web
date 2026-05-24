import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, blogPosts } from "@/lib/db";
import { eq, and, desc, ne } from "drizzle-orm";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import BlogContent from "./BlogContent";

type Props = {
  params: Promise<{ slug: string }>;
};

async function getPost(slug: string) {
  const posts = await db
    .select()
    .from(blogPosts)
    .where(and(eq(blogPosts.slug, slug), eq(blogPosts.status, "published")))
    .limit(1);

  return posts[0] || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) {
    return { title: "Post Not Found" };
  }

  return {
    title: post.title,
    description: post.metaDescription || post.excerpt,
    keywords: post.metaKeywords || undefined,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.metaDescription || post.excerpt,
      url: `https://fundfly.app/blog/${post.slug}`,
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt?.toISOString(),
      authors: [post.author || "FundFly Team"],
      section: post.category,
      tags: post.tags?.split(",").map((t) => t.trim()),
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.metaDescription || post.excerpt,
    },
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  grants: "Grants",
  sbir: "SBIR/STTR",
  tips: "Tips",
  news: "News",
  personal: "Personal",
};

const CATEGORY_COLORS: Record<string, string> = {
  grants: "bg-blue-100 text-blue-700",
  sbir: "bg-purple-100 text-purple-700",
  tips: "bg-green-100 text-green-700",
  news: "bg-amber-100 text-amber-700",
  personal: "bg-pink-100 text-pink-700",
};

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);

  if (!post) notFound();

  // Fetch related posts (same category, excluding current)
  const relatedPosts = await db
    .select({
      slug: blogPosts.slug,
      title: blogPosts.title,
      excerpt: blogPosts.excerpt,
      category: blogPosts.category,
      publishedAt: blogPosts.publishedAt,
    })
    .from(blogPosts)
    .where(
      and(
        eq(blogPosts.status, "published"),
        eq(blogPosts.category, post.category),
        ne(blogPosts.id, post.id)
      )
    )
    .orderBy(desc(blogPosts.publishedAt))
    .limit(3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription || post.excerpt,
    datePublished: post.publishedAt?.toISOString(),
    dateModified: post.updatedAt?.toISOString(),
    author: {
      "@type": "Organization",
      name: post.author || "FundFly Team",
      url: "https://fundfly.app",
    },
    publisher: {
      "@type": "Organization",
      name: "FundFly",
      url: "https://fundfly.app",
      logo: {
        "@type": "ImageObject",
        url: "https://fundfly.app/icon.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://fundfly.app/blog/${post.slug}`,
    },
    keywords: post.metaKeywords || undefined,
    articleSection: post.category,
  };

  return (
    <>
      <MarketingHeader />
      <main className="min-h-screen bg-background">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        <article className="max-w-3xl mx-auto px-6 py-12">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-muted mb-8">
            <Link href="/blog" className="hover:text-foreground transition-colors">
              Blog
            </Link>
            <span>/</span>
            <Link
              href={`/blog?category=${post.category}`}
              className="hover:text-foreground transition-colors"
            >
              {CATEGORY_LABELS[post.category] || post.category}
            </Link>
          </nav>

          {/* Header */}
          <header className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <span
                className={`text-[10px] font-semibold uppercase px-2.5 py-1 rounded-md ${
                  CATEGORY_COLORS[post.category] || "bg-gray-100 text-gray-600"
                }`}
              >
                {CATEGORY_LABELS[post.category] || post.category}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 leading-tight">
              {post.title}
            </h1>
            <div className="flex items-center gap-4 text-sm text-muted">
              <span>{post.author || "FundFly Team"}</span>
              {post.publishedAt && (
                <>
                  <span className="w-1 h-1 rounded-full bg-muted" />
                  <time dateTime={post.publishedAt.toISOString()}>
                    {new Date(post.publishedAt).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </time>
                </>
              )}
            </div>
          </header>

          {/* Content */}
          <BlogContent content={post.content} />

          {/* Tags */}
          {post.tags && (
            <div className="mt-10 pt-6 border-t border-border">
              <div className="flex flex-wrap gap-2">
                {post.tags.split(",").map((tag) => (
                  <span
                    key={tag}
                    className="text-xs text-muted bg-surface border border-border px-3 py-1 rounded-full"
                  >
                    {tag.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </article>

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
          <section className="border-t border-border bg-surface">
            <div className="max-w-5xl mx-auto px-6 py-12">
              <h2 className="text-xl font-bold mb-6">Related Articles</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {relatedPosts.map((rp) => (
                  <Link
                    key={rp.slug}
                    href={`/blog/${rp.slug}`}
                    className="group bg-card border border-border rounded-xl p-5 hover:border-accent/30 transition-colors"
                  >
                    <span
                      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md inline-block mb-2 ${
                        CATEGORY_COLORS[rp.category] ||
                        "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {CATEGORY_LABELS[rp.category] || rp.category}
                    </span>
                    <h3 className="font-semibold text-sm mb-1 group-hover:text-accent transition-colors line-clamp-2">
                      {rp.title}
                    </h3>
                    <p className="text-xs text-muted line-clamp-2">
                      {rp.excerpt}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="bg-accent/5 border-t border-border">
          <div className="max-w-3xl mx-auto px-6 py-16 text-center">
            <h2 className="text-2xl font-bold mb-3">
              Start Finding Grants Today
            </h2>
            <p className="text-muted mb-6 max-w-lg mx-auto">
              FundFly matches over 1 million funding opportunities to your
              profile using AI. No credit card required.
            </p>
            <Link
              href="/sign-up"
              className="inline-flex bg-accent text-white px-6 py-3 rounded-lg font-medium hover:bg-accent/90 transition-colors"
            >
              Get Started Free
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
