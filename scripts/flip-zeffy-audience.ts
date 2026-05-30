/**
 * ONE-TIME repair (user-approved write). The Zeffy catalog was ingested with a
 * default audience of "both", so ~80k org/nonprofit grants leaked into the
 * personal matching pool. This flips every UNCLASSIFIED Zeffy row to "business"
 * (the catalog is overwhelmingly org-facing) while leaving
 * audience_classified_hash NULL, so the AI classifier can still promote the
 * genuinely-personal ones to "personal"/"both" over time.
 *
 * Already-classified rows (hash IS NOT NULL) are left untouched.
 *
 * Pairs with the BUG A fix in src/lib/ingest-zeffy.ts (audience removed from the
 * upsert conflict set) so this repair sticks across future re-syncs.
 *
 * Idempotent: re-running only touches rows that are not already "business".
 *
 * Usage: npx tsx --env-file=.env.local scripts/flip-zeffy-audience.ts
 */

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function poolCounts(label: string) {
  const [{ personal_pool }] = await sql`
    SELECT count(*)::int AS personal_pool FROM opportunities
    WHERE status='open' AND audience IN ('personal','both')`;
  const [{ business_pool }] = await sql`
    SELECT count(*)::int AS business_pool FROM opportunities
    WHERE status='open' AND audience IN ('business','both')`;
  const [{ zeffy_unclassified }] = await sql`
    SELECT count(*)::int AS zeffy_unclassified FROM opportunities
    WHERE source='zeffy' AND audience_classified_hash IS NULL`;
  console.log(`\n[${label}]`);
  console.log(`  personal-eligible pool (status=open):  ${personal_pool}`);
  console.log(`  business-eligible pool (status=open):  ${business_pool}`);
  console.log(`  zeffy rows still unclassified:         ${zeffy_unclassified}`);
}

async function main() {
  console.log("Heuristic audience flip for unclassified Zeffy rows\n");

  await poolCounts("BEFORE");

  const [{ to_flip }] = await sql`
    SELECT count(*)::int AS to_flip FROM opportunities
    WHERE source='zeffy'
      AND audience_classified_hash IS NULL
      AND audience IS DISTINCT FROM 'business'`;

  console.log(`\nRows that will flip to 'business': ${to_flip}`);

  if (to_flip === 0) {
    console.log("Nothing to do — already repaired.");
    await poolCounts("AFTER (no change)");
    return;
  }

  const flipped = await sql`
    UPDATE opportunities
    SET audience='business', updated_at=now()
    WHERE source='zeffy'
      AND audience_classified_hash IS NULL
      AND audience IS DISTINCT FROM 'business'
    RETURNING id`;

  console.log(`Flipped ${flipped.length} rows.`);

  await poolCounts("AFTER");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
