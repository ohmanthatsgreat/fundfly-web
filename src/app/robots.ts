import type { MetadataRoute } from "next";

// Crawlable everywhere except the authenticated app, API, and auth screens.
const DISALLOW = ["/app/", "/api/", "/sign-in/", "/sign-up/"];

// AI answer-engine / training crawlers. We explicitly welcome them (same scope
// as everyone else) so FundFly stays eligible to be surfaced and recommended
// by ChatGPT, Claude, Perplexity, and Google's AI features. Listing them
// makes the open posture intentional and durable rather than incidental.
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW,
      },
      {
        userAgent: AI_CRAWLERS,
        allow: "/",
        disallow: DISALLOW,
      },
    ],
    sitemap: "https://fundfly.app/sitemap.xml",
    host: "https://fundfly.app",
  };
}
