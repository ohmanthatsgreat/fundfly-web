import { db, blogPosts } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { FEATURES } from "@/app/features/featureData";

const baseUrl = "https://fundfly.app";

/**
 * /llms.txt — a curated, markdown map of FundFly for large language models
 * (the https://llmstxt.org convention). LLM crawlers and answer engines read
 * this to understand what FundFly is and where the authoritative content
 * lives, so we surface accurately in AI search results.
 *
 * Mirrors the blog RSS feed: published posts are pulled live and CDN-cached
 * for an hour, so new posts appear without a redeploy.
 */
export async function GET() {
  const posts = await db
    .select({
      slug: blogPosts.slug,
      title: blogPosts.title,
      excerpt: blogPosts.excerpt,
    })
    .from(blogPosts)
    .where(eq(blogPosts.status, "published"))
    .orderBy(desc(blogPosts.publishedAt))
    .limit(50);

  const featureLines = FEATURES.map(
    (f) => `- [${f.title}](${baseUrl}/features/${f.slug}): ${f.tagline}`
  ).join("\n");

  const postLines = posts.length
    ? posts
        .map((p) => `- [${p.title}](${baseUrl}/blog/${p.slug}): ${p.excerpt}`)
        .join("\n")
    : "- No posts published yet.";

  const body = `# FundFly

> AI-powered grant discovery and application platform. FundFly indexes over a million grants, SBIR/STTR programs, and foundation opportunities, scores each one against your profile with AI, and helps you apply — for businesses, nonprofits, researchers, and individuals.

FundFly solves the access problem in funding: opportunities are scattered across dozens of government and foundation databases behind long, opaque applications. FundFly unifies them into one searchable index, uses AI to score every opportunity 0–100 against your organization or personal profile with plain-language reasoning, and (on higher tiers) drafts and submits applications with human-in-the-loop oversight.

Browsing and searching are free with no credit card. Paid tiers add AI match scoring, step-by-step pre-submission checklists with application drafting, and automated portal submission. All paid plans include a 3-day free trial (no card required) and a 14-day money-back guarantee.

## Pricing
- [Free](${baseUrl}/pricing): $0 forever — browse 1M+ opportunities, search and filter, save, and track applications.
- [AI Matching](${baseUrl}/pricing): $29/mo — AI scores every opportunity against your org and personal profiles with reasoning.
- [Pre-Submission Checklist](${baseUrl}/pricing): $129/mo — step-by-step submission plans, eligibility checks, and AI application drafting. Includes everything in AI Matching.
- [Auto-Submission](${baseUrl}/pricing): $399/mo — an AI agent navigates portals, fills forms, and submits on your behalf with human review. Includes everything in Checklist.

## Key pages
- [Home](${baseUrl}): What FundFly is and who it's for.
- [Pricing](${baseUrl}/pricing): Full plan details and feature comparison.
- [Blog](${baseUrl}/blog): Guides on finding grants, writing winning proposals, and SBIR/STTR programs.

## Features
${featureLines}

## Blog posts
${postLines}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "s-maxage=3600, stale-while-revalidate",
    },
  });
}
