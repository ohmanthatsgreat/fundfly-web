import Anthropic from "@anthropic-ai/sdk";
import crypto from "node:crypto";
import { db, opportunities } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * AI-classify the audience of an opportunity as "business" | "personal" | "both".
 *
 * Used for sources where the original data doesn't give us a clean audience
 * signal — primarily Zeffy, which lumps nonprofit grants and individual grants
 * together. Results are cached by content hash to avoid re-classification.
 *
 * Model: cheap Haiku tier. Batched 10 per call to amortize HTTP overhead.
 */

const BATCH_SIZE = 10;
const HAIKU_MODEL = "claude-haiku-4-6";

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey });
}

/** Stable hash of the inputs we feed to the classifier. */
export function audienceHash(input: {
  title: string;
  description: string | null;
  categories: string | null;
}): string {
  const payload = [
    input.title || "",
    input.description || "",
    input.categories || "",
  ].join("\n---\n");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

type ClassifyInput = {
  id: string;
  title: string;
  description: string | null;
  categories: string | null;
};

type ClassifyResult = {
  id: string;
  audience: "business" | "personal" | "both";
};

/**
 * Classify a single batch. Returns one result per input; on parse failure
 * we default to "both" (safe — UI still works, user picks via profile).
 */
async function classifyBatch(
  batch: ClassifyInput[]
): Promise<ClassifyResult[]> {
  if (batch.length === 0) return [];

  const numbered = batch
    .map((b, i) => {
      const cats = b.categories ? ` [${b.categories}]` : "";
      const desc = (b.description || "").slice(0, 800);
      return `${i + 1}. "${b.title}"${cats}\n${desc}`;
    })
    .join("\n\n---\n\n");

  const prompt = `Classify each grant opportunity's intended audience.

Definitions:
- "business":   for nonprofits, businesses, schools, churches, government agencies, or other organizations. Eligibility usually requires an EIN or 501(c) status.
- "personal":   for individuals — artists, students, researchers, people in hardship, demographic-specific aid. Eligibility is the applicant themselves.
- "both":       eligibility is genuinely open to both organizations AND individuals, or unclear from the description.

Opportunities:

${numbered}

Return ONLY a JSON array with one element per opportunity (in order), each like:
[{"n": 1, "audience": "business"}, {"n": 2, "audience": "personal"}, ...]

No prose, just JSON.`;

  const response = await getClient().messages.create({
    model: HAIKU_MODEL,
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text += block.text;
  }

  let parsed: { n: number; audience: string }[] = [];
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) parsed = JSON.parse(match[0]);
  } catch {
    // fall through — return "both" for all on failure
  }

  return batch.map((item, idx) => {
    const r = parsed.find((p) => p.n === idx + 1);
    const aud = r?.audience?.toLowerCase();
    const audience: "business" | "personal" | "both" =
      aud === "business" || aud === "personal" ? aud : "both";
    return { id: item.id, audience };
  });
}

/**
 * Classify every opportunity in `source` whose audienceClassifiedHash is
 * stale or missing. Updates rows in place with new audience + hash.
 *
 * Returns the number of rows classified.
 */
export async function classifyAudienceForSource(
  source: string,
  options: { limit?: number } = {}
): Promise<{ classified: number; skipped: number }> {
  // Find candidates: rows in this source that haven't been classified yet,
  // OR whose content has changed since last classification.
  // We compute the hash in JS and compare client-side — cheaper than a SQL
  // expression that hashes columns.
  const rows = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      description: opportunities.description,
      categories: opportunities.categories,
      hash: opportunities.audienceClassifiedHash,
    })
    .from(opportunities)
    .where(eq(opportunities.source, source))
    .limit(options.limit ?? 1000);

  const stale: ClassifyInput[] = [];
  const staleHashes = new Map<string, string>();
  let skipped = 0;

  for (const r of rows) {
    const h = audienceHash({
      title: r.title,
      description: r.description,
      categories: r.categories,
    });
    if (r.hash === h) {
      skipped++;
      continue;
    }
    stale.push({
      id: r.id,
      title: r.title,
      description: r.description,
      categories: r.categories,
    });
    staleHashes.set(r.id, h);
  }

  if (stale.length === 0) {
    return { classified: 0, skipped };
  }

  let classified = 0;
  for (let i = 0; i < stale.length; i += BATCH_SIZE) {
    const batch = stale.slice(i, i + BATCH_SIZE);
    let results: ClassifyResult[] = [];
    try {
      results = await classifyBatch(batch);
    } catch {
      // On Haiku failure, leave the rows alone (no hash update — will retry
      // next time). Better than mass-tagging as "both" with a fresh hash.
      continue;
    }
    for (const r of results) {
      await db
        .update(opportunities)
        .set({
          audience: r.audience,
          audienceClassifiedHash: staleHashes.get(r.id) || null,
        })
        .where(eq(opportunities.id, r.id));
      classified++;
    }
  }

  return { classified, skipped };
}
