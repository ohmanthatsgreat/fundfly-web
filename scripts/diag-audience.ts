/**
 * READ-ONLY diagnostic. Runs only SELECTs against prod to understand the
 * current audience/classification state. No writes.
 *
 * Usage: npx tsx --env-file=.env.local scripts/diag-audience.ts
 */

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

function table(rows: Record<string, unknown>[]) {
  console.table(rows);
}

async function main() {
  const [{ total }] = await sql`SELECT count(*)::int AS total FROM opportunities`;
  console.log(`\nTOTAL opportunities: ${total}\n`);

  console.log("By source:");
  table(await sql`SELECT source, count(*)::int AS n FROM opportunities GROUP BY source ORDER BY n DESC`);

  console.log("By status:");
  table(await sql`SELECT status, count(*)::int AS n FROM opportunities GROUP BY status ORDER BY n DESC`);

  console.log("OPEN opportunities by audience:");
  table(await sql`
    SELECT coalesce(audience,'(null)') AS audience, count(*)::int AS n
    FROM opportunities WHERE status='open'
    GROUP BY audience ORDER BY n DESC`);

  console.log("OPEN opportunities by source x audience:");
  table(await sql`
    SELECT source, coalesce(audience,'(null)') AS audience, count(*)::int AS n
    FROM opportunities WHERE status='open'
    GROUP BY source, audience ORDER BY source, n DESC`);

  console.log("Zeffy classification backlog (all statuses):");
  table(await sql`
    SELECT
      count(*)::int AS zeffy_total,
      count(*) FILTER (WHERE audience_classified_hash IS NULL)::int AS unclassified,
      count(*) FILTER (WHERE audience_classified_hash IS NOT NULL)::int AS classified
    FROM opportunities WHERE source='zeffy'`);

  console.log("Eligible POOLS for the matcher (status=open):");
  const [{ personal_pool }] = await sql`
    SELECT count(*)::int AS personal_pool FROM opportunities
    WHERE status='open' AND audience IN ('personal','both')`;
  const [{ business_pool }] = await sql`
    SELECT count(*)::int AS business_pool FROM opportunities
    WHERE status='open' AND audience IN ('business','both')`;
  const [{ personal_only }] = await sql`
    SELECT count(*)::int AS personal_only FROM opportunities
    WHERE status='open' AND audience='personal'`;
  console.log(`  personal-eligible (personal+both): ${personal_pool}`);
  console.log(`  business-eligible (business+both): ${business_pool}`);
  console.log(`  strictly personal:                 ${personal_only}`);

  console.log("\nAI matches per user x mode (top 10):");
  table(await sql`
    SELECT user_id, match_mode, count(*)::int AS matches
    FROM ai_matches GROUP BY user_id, match_mode ORDER BY matches DESC LIMIT 10`);

  console.log("Scan cursors (match_scan_state):");
  table(await sql`
    SELECT user_id, mode, scan_offset, scanned_count, updated_at
    FROM match_scan_state ORDER BY updated_at DESC LIMIT 10`);

  console.log("Trials (count + recent):");
  table(await sql`
    SELECT plan, count(*)::int AS n,
      count(*) FILTER (WHERE ends_at > now())::int AS active
    FROM trials GROUP BY plan ORDER BY n DESC`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
