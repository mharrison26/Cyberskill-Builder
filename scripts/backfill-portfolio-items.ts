/**
 * Idempotent backfill: oscal_findings → portfolio_items (item_kind=oscal_finding).
 *
 * Prefer running via migration 0024 (source of truth for deploy). This script
 * re-runs the same mapping for environments that already applied an older
 * portfolio_items shape, or after restoring findings data.
 *
 * Connection (first match wins):
 *   - DATABASE_URL
 *   - SUPABASE_DB_URL
 *
 * Usage:
 *   export PATH="/Users/Lion/.local/node/bin:$PATH"
 *   npx tsx scripts/backfill-portfolio-items.ts
 */

import { Client } from 'pg';

function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
}

const BACKFILL_SQL = `
INSERT INTO public.portfolio_items (
  tenant_id,
  student_id,
  track_id,
  tier,
  item_kind,
  title,
  dcwf_code,
  structured_result,
  narrative,
  is_public,
  created_at,
  lesson_id,
  oscal_finding_id
)
SELECT
  f.tenant_id,
  f.student_id,
  f.track_id,
  COALESCE(l.tier, '1'),
  'oscal_finding',
  'Finding: ' || f.control_id,
  f.dcwf_code,
  COALESCE(f.observation, '{}'::jsonb)
    || jsonb_build_object(
      'control_id', f.control_id,
      'finding_state', f.finding_state
    ),
  f.student_narrative,
  COALESCE(f.is_public, false),
  f.created_at,
  f.lesson_id,
  f.id
FROM public.oscal_findings f
LEFT JOIN public.lessons l ON l.id = f.lesson_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.portfolio_items pi
  WHERE pi.oscal_finding_id = f.id
)
`;

async function main(): Promise<void> {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    console.error(
      [
        'Missing database connection. Set DATABASE_URL or SUPABASE_DB_URL.',
        '',
        'Supabase: Dashboard → Settings → Database → Connection string (URI).',
      ].join('\n')
    );
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const result = await client.query(BACKFILL_SQL);
    console.log(
      `Backfill complete: inserted ${result.rowCount ?? 0} portfolio_items from oscal_findings.`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
