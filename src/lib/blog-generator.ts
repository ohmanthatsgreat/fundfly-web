import Anthropic from "@anthropic-ai/sdk";
import { db, blogPosts } from "@/lib/db";
import { eq, desc, sql } from "drizzle-orm";
import { recordCallCost } from "@/lib/ai-cost";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "sk-ant-placeholder") {
    throw new Error("ANTHROPIC_API_KEY is required for blog generation.");
  }
  return new Anthropic({ apiKey });
}

const BLOG_CATEGORIES = ["grants", "sbir", "tips", "news", "personal"] as const;
type BlogCategory = (typeof BLOG_CATEGORIES)[number];

const CATEGORY_LABELS: Record<BlogCategory, string> = {
  grants: "Government & Business Grants",
  sbir: "SBIR & STTR Programs",
  tips: "Application Tips & Strategies",
  news: "Funding Industry News",
  personal: "Personal Grants & Scholarships",
};

/** Topic themes per category to keep content diverse */
const TOPIC_POOLS: Record<BlogCategory, string[]> = {
  grants: [
    "How to find federal grants for small businesses",
    "Common mistakes in grant applications and how to avoid them",
    "Understanding indirect cost rates in federal grants",
    "How to read a Notice of Funding Opportunity (NOFO)",
    "Grant writing best practices for first-time applicants",
    "How to use SAM.gov to find contracting opportunities",
    "Grants for minority-owned and women-owned businesses",
    "How nonprofits can diversify their grant funding sources",
    "State vs federal grants: what's the difference",
    "How to build a grant calendar and never miss a deadline",
    "Understanding matching funds requirements in grant programs",
    "How to write a compelling needs statement for grant proposals",
    "The role of logic models in successful grant applications",
    "How to leverage Grants.gov for maximum funding opportunities",
    "Building organizational capacity for grant readiness",
  ],
  sbir: [
    "What is the SBIR program and how to get started",
    "SBIR vs STTR: which program is right for your company",
    "How to write a winning SBIR Phase I proposal",
    "Transitioning from SBIR Phase I to Phase II",
    "Technology Readiness Levels explained for SBIR applicants",
    "DOD SBIR topics: how to find and respond to them",
    "NIH SBIR funding: what biotech startups need to know",
    "Commercialization planning for SBIR awardees",
    "How to build a competitive SBIR budget",
    "Common SBIR proposal mistakes and how to fix them",
    "NSF SBIR program: opportunities for deep tech startups",
    "SBIR Phase III: commercializing your innovation",
    "How small businesses can use SBIR to fund R&D",
    "Understanding the SBIR solicitation timeline",
    "Building past performance for future SBIR proposals",
  ],
  tips: [
    "How to write a project abstract that gets noticed",
    "Building a strong organizational capability statement",
    "How to create realistic project timelines for grants",
    "Budget justification writing guide for grant proposals",
    "How to demonstrate sustainability in grant applications",
    "Writing measurable outcomes and evaluation plans",
    "How to respond to reviewer feedback on grant resubmissions",
    "Tips for collaborating with partners on grant applications",
    "How AI tools can streamline your grant application process",
    "Creating a grant tracking system for your organization",
    "How to write letters of support that strengthen your proposal",
    "Understanding and meeting eligibility requirements",
    "How to use data effectively in grant narratives",
    "Preparing financial statements for grant applications",
    "How to structure a multi-year grant budget",
  ],
  news: [
    "Recent changes to federal grant application processes",
    "How AI is transforming grant discovery and application",
    "Trends in government funding for small businesses",
    "New foundation funding opportunities for startups",
    "How inflation is affecting grant funding amounts",
    "Digital transformation in the grants management ecosystem",
    "The future of automated grant applications",
    "How open data initiatives are improving grant transparency",
    "Changes to SAM.gov and what they mean for applicants",
    "Emerging funding sources for climate and sustainability projects",
    "How technology startups are accessing non-dilutive funding",
    "The growing role of public-private partnerships in grants",
    "Federal budget impacts on grant funding availability",
    "How states are modernizing their grant programs",
    "The rise of micro-grants and quick-turnaround funding",
  ],
  personal: [
    "Top personal grants and scholarships for education",
    "How individuals can access emergency assistance grants",
    "Veterans grants and benefits: a comprehensive guide",
    "Grants for first-time homebuyers and housing assistance",
    "Scholarships and grants for adult learners and career changers",
    "How to find grants for medical expenses and healthcare",
    "Disability grants and funding resources",
    "Grants for artists, writers, and creative professionals",
    "Financial assistance programs for single parents",
    "How to find and apply for community development grants",
    "Grants for women in STEM fields",
    "Agricultural grants for small farmers and rural communities",
    "Grants for energy efficiency and home improvements",
    "How to find grants based on your demographic background",
    "Fellowship and research grants for graduate students",
  ],
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/** Pick a category, rotating evenly across categories */
async function pickCategory(): Promise<BlogCategory> {
  const counts = await db
    .select({
      category: blogPosts.category,
      count: sql<number>`count(*)`,
    })
    .from(blogPosts)
    .groupBy(blogPosts.category);

  const countMap: Record<string, number> = {};
  for (const c of counts) countMap[c.category] = c.count;

  // Pick the category with fewest posts
  let minCount = Infinity;
  let pick: BlogCategory = "grants";
  for (const cat of BLOG_CATEGORIES) {
    const c = countMap[cat] || 0;
    if (c < minCount) {
      minCount = c;
      pick = cat;
    }
  }

  return pick;
}

/** Pick a topic that hasn't been written about recently */
async function pickTopic(category: BlogCategory): Promise<string> {
  const recentPosts = await db
    .select({ title: blogPosts.title })
    .from(blogPosts)
    .where(eq(blogPosts.category, category))
    .orderBy(desc(blogPosts.createdAt))
    .limit(10);

  const recentTitles = recentPosts.map((p) => p.title.toLowerCase());
  const pool = TOPIC_POOLS[category];

  // Find a topic that doesn't overlap with recent posts
  for (const topic of pool) {
    const topicWords = topic.toLowerCase().split(/\s+/);
    const isRecent = recentTitles.some((title) =>
      topicWords.filter((w) => w.length > 4).every((w) => title.includes(w))
    );
    if (!isRecent) return topic;
  }

  // All used — pick random
  return pool[Math.floor(Math.random() * pool.length)];
}

export type GeneratedPost = {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  metaDescription: string;
  metaKeywords: string;
  category: BlogCategory;
  tags: string;
};

/** Generate a single blog post with AI */
export async function generateBlogPost(
  categoryOverride?: string,
  topicOverride?: string
): Promise<GeneratedPost> {
  const category = (categoryOverride as BlogCategory) || (await pickCategory());
  const topic = topicOverride || (await pickTopic(category));
  const categoryLabel = CATEGORY_LABELS[category];

  const today = new Date();
  const currentDate = today.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const currentYear = today.getFullYear();

  const model = "claude-sonnet-4-6";
  const response = await getClient().messages.create({
    model,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are an expert content writer for FundFly, an AI-powered grant discovery and application platform that helps businesses and individuals find and apply for government grants, SBIR/STTR programs, foundation funding, and personal grants/scholarships. FundFly aggregates over 1 million live funding opportunities.

Today's date is ${currentDate}. The current year is ${currentYear}. Always reference the current year when discussing timelines, deadlines, or recent developments. Never reference past years as current.

Write a blog post about: "${topic}"
Category: ${categoryLabel}

Requirements:
1. Write in a professional but approachable tone. Be helpful and actionable.
2. Include specific, practical advice that readers can act on immediately.
3. Structure with clear headings using ## for H2 and ### for H3.
4. Include 3-5 key sections with detailed content.
5. Total length: 800-1200 words.
6. Naturally incorporate relevant keywords for SEO without keyword stuffing.
7. End with a call-to-action encouraging readers to try FundFly for finding and applying to grants. Mention that FundFly uses AI to match opportunities to your profile.
8. Do NOT include the title in the content body — it will be rendered separately.

CRITICAL formatting rules:
- Do NOT use bold text markers (**text**). Write clean prose without emphasis markers. If something is important, convey it through strong word choice and sentence structure, not formatting.
- Do NOT use italic markers (*text*).
- Headings (## and ###) are the ONLY markdown formatting allowed.
- Use plain numbered lists (1. 2. 3.) or bullet lists (- item) when listing items.
- Do NOT use subheadings that are just bold text like "**Key Takeaway:**" — use proper ### headings or integrate the point into the prose.
- Write like a skilled human journalist or industry expert. Avoid formulaic structures, excessive bullet points, and overly enthusiastic language.
- No emojis. No exclamation marks in headings.

Respond with a JSON object containing:
- "title": compelling, SEO-friendly title (50-70 characters). Must reference ${currentYear} if the topic is time-sensitive.
- "excerpt": engaging 1-2 sentence summary (120-160 characters)
- "content": full content using only ## and ### headings, plain lists, and clean prose. No bold, no italic, no other markdown formatting.
- "metaDescription": SEO meta description (150-160 characters)
- "metaKeywords": comma-separated keywords (8-12 keywords)
- "tags": comma-separated relevant tags (4-6 tags)

Respond with ONLY the JSON object, no other text.`,
      },
    ],
  });
  await recordCallCost(null, model, response);

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }

  // Parse JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse blog generation response");

  const parsed = JSON.parse(jsonMatch[0]) as {
    title: string;
    excerpt: string;
    content: string;
    metaDescription: string;
    metaKeywords: string;
    tags: string;
  };

  // Generate unique slug
  const baseSlug = slugify(parsed.title);
  const datePrefix = new Date().toISOString().split("T")[0];
  const slug = `${datePrefix}-${baseSlug}`;

  return {
    slug,
    title: parsed.title,
    excerpt: parsed.excerpt,
    content: parsed.content,
    metaDescription: parsed.metaDescription,
    metaKeywords: parsed.metaKeywords,
    category,
    tags: parsed.tags,
  };
}

/** Save a generated post to the database */
export async function saveBlogPost(
  post: GeneratedPost,
  autoPublish = true
): Promise<{ id: number; slug: string }> {
  const [inserted] = await db
    .insert(blogPosts)
    .values({
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      metaDescription: post.metaDescription,
      metaKeywords: post.metaKeywords,
      category: post.category,
      tags: post.tags,
      author: "FundFly Team",
      status: autoPublish ? "published" : "draft",
      publishedAt: autoPublish ? new Date() : null,
    })
    .returning({ id: blogPosts.id, slug: blogPosts.slug });

  return inserted;
}

/** Generate and save multiple blog posts */
export async function generateDailyBlogPosts(
  count = 2
): Promise<{ generated: number; posts: { id: number; slug: string; title: string; category: string }[] }> {
  const posts: { id: number; slug: string; title: string; category: string }[] = [];

  for (let i = 0; i < count; i++) {
    try {
      const generated = await generateBlogPost();
      const saved = await saveBlogPost(generated, true);
      posts.push({
        id: saved.id,
        slug: saved.slug,
        title: generated.title,
        category: generated.category,
      });
    } catch (err) {
      console.error(`[blog-generator] Failed to generate post ${i + 1}:`, err);
    }
  }

  return { generated: posts.length, posts };
}
