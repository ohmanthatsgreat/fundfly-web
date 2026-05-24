import type { Metadata } from "next";
import Link from "next/link";
import { db, blogPosts } from "@/lib/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Blog — Grant Tips, SBIR Guides & Funding News",
  description:
    "Expert insights on federal grants, SBIR/STTR programs, grant writing tips, and the latest in funding opportunities for businesses and individuals.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "FundFly Blog — Grant Tips, SBIR Guides & Funding News",
    description:
      "Expert insights on federal grants, SBIR/STTR programs, grant writing tips, and the latest in funding opportunities.",
    url: "https://fundfly.app/blog",
  },
};

export const dynamic = "force-dynamic";

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

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>;
}) {
  const params = await searchParams;
  const category = params.category;
  const currentPage = Math.max(1, parseInt(params.page || "1", 10));
  const perPage = 12;

  const conditions = [eq(blogPosts.status, "published")];
  if (category && category in CATEGORY_LABELS) {
    conditions.push(eq(blogPosts.category, category));
  }

  const posts = await db
    .select({
      slug: blogPosts.slug,
      title: blogPosts.title,
      excerpt: blogPosts.excerpt,
      category: blogPosts.category,
      tags: blogPosts.tags,
      publishedAt: blogPosts.publishedAt,
      author: blogPosts.author,
    })
    .from(blogPosts)
    .where(and(...conditions))
    .orderBy(desc(blogPosts.publishedAt))
    .limit(perPage + 1)
    .offset((currentPage - 1) * perPage);

  const hasMore = posts.length > perPage;
  const displayPosts = posts.slice(0, perPage);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "FundFly Blog",
    description:
      "Expert insights on federal grants, SBIR/STTR programs, and funding opportunities.",
    url: "https://fundfly.app/blog",
    publisher: {
      "@type": "Organization",
      name: "FundFly",
      url: "https://fundfly.app",
    },
  };

  return (
    <>
      <MarketingHeader />
      <main className="min-h-screen bg-background">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        {/* Hero */}
        <section className="border-b border-border bg-surface">
          <div className="max-w-5xl mx-auto px-6 py-16 text-center">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Grant Insights & Resources
            </h1>
            <p className="text-lg text-muted max-w-2xl mx-auto">
              Expert tips on finding funding, writing winning proposals, and
              navigating SBIR/STTR programs.
            </p>
          </div>
        </section>

        {/* Category Filters */}
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/blog"
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                !category
                  ? "bg-accent text-white"
                  : "bg-surface border border-border text-muted hover:text-foreground"
              }`}
            >
              All
            </Link>
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <Link
                key={key}
                href={`/blog?category=${key}`}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  category === key
                    ? "bg-accent text-white"
                    : "bg-surface border border-border text-muted hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        {/* Posts Grid */}
        <div className="max-w-5xl mx-auto px-6 pb-16">
          {displayPosts.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted text-lg">No posts yet. Check back soon!</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayPosts.map((post) => (
                  <Link
                    key={post.slug}
                    href={`/blog/${post.slug}`}
                    className="group bg-card border border-border rounded-xl overflow-hidden hover:border-accent/30 transition-colors"
                  >
                    <div className="p-6">
                      <div className="flex items-center gap-2 mb-3">
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md ${
                            CATEGORY_COLORS[post.category] ||
                            "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {CATEGORY_LABELS[post.category] || post.category}
                        </span>
                        {post.publishedAt && (
                          <span className="text-[11px] text-muted">
                            {new Date(post.publishedAt).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric", year: "numeric" }
                            )}
                          </span>
                        )}
                      </div>
                      <h2 className="font-semibold text-base mb-2 group-hover:text-accent transition-colors line-clamp-2">
                        {post.title}
                      </h2>
                      <p className="text-sm text-muted line-clamp-3">
                        {post.excerpt}
                      </p>
                      {post.tags && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {post.tags
                            .split(",")
                            .slice(0, 3)
                            .map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] text-muted bg-surface px-2 py-0.5 rounded"
                              >
                                {tag.trim()}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              <div className="flex justify-center gap-3 mt-10">
                {currentPage > 1 && (
                  <Link
                    href={`/blog?${category ? `category=${category}&` : ""}page=${currentPage - 1}`}
                    className="px-4 py-2 border border-border rounded-lg text-sm text-muted hover:text-foreground hover:border-accent/30 transition-colors"
                  >
                    Previous
                  </Link>
                )}
                {hasMore && (
                  <Link
                    href={`/blog?${category ? `category=${category}&` : ""}page=${currentPage + 1}`}
                    className="px-4 py-2 border border-border rounded-lg text-sm text-muted hover:text-foreground hover:border-accent/30 transition-colors"
                  >
                    Next
                  </Link>
                )}
              </div>
            </>
          )}
        </div>

        {/* CTA */}
        <section className="bg-accent/5 border-t border-border">
          <div className="max-w-3xl mx-auto px-6 py-16 text-center">
            <h2 className="text-2xl font-bold mb-3">
              Ready to Find Your Funding?
            </h2>
            <p className="text-muted mb-6 max-w-lg mx-auto">
              FundFly aggregates over 1 million grants and uses AI to match
              opportunities to your profile. Start for free.
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
