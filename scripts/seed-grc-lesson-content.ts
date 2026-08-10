/**
 * Upsert all 13 rows from the GRC Lesson Content sheet into Supabase.
 *
 * Source of truth:
 *   data/grc/CyberSkillBuilder_GRC_Premium_MVP.xlsx → sheet "GRC Lesson Content"
 *   data/grc/grc-lesson-content.json (exported verbatim)
 *
 * Prefers DATABASE_URL / SUPABASE_DB_URL. Falls back to printing the SQL path
 * when no DB URL is set (apply via supabase/migrations/20260810340000_*.sql).
 *
 * Usage:
 *   npx tsx scripts/seed-grc-lesson-content.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Client } from 'pg';

type SheetRow = {
  _id: string;
  _title: string;
  'Learning Objective': string;
  'Ticket / Scenario (Student-Facing)': string;
  'Key Artifact / Data': string;
  'Grading Focus': string;
  'Cursor Prompt (Seed This Exact Content)': string;
};

const COMMERCIAL = '00000000-0000-4000-8000-000000000001';
const DOD = '00000000-0000-4000-8000-000000000003';

const LESSON_META: Record<
  string,
  { lesson_type: string; tier: string; sort_order: number; title: string }
> = {
  L01: {
    lesson_type: 'conceptual',
    tier: '1',
    sort_order: 1,
    title: 'Core Framework Differences',
  },
  L02: {
    lesson_type: 'catalog_lab',
    tier: '1',
    sort_order: 2,
    title: 'Navigating NIST SP 800-53',
  },
  L03: {
    lesson_type: 'tool_walkthrough',
    tier: '1',
    sort_order: 4,
    title: 'Open-Source Tracking Workflows',
  },
};

const TICKET_META: Record<
  string,
  {
    ticket_type: string;
    tier: number;
    sort_order: number;
    difficulty: string;
    sla: number;
    dcwf: string;
  }
> = {
  'GRC-01': {
    ticket_type: 'control_mapping',
    tier: 2,
    sort_order: 27,
    difficulty: 'medium',
    sla: 45,
    dcwf: '722',
  },
  'GRC-02': {
    ticket_type: 'tool_walkthrough',
    tier: 2,
    sort_order: 20,
    difficulty: 'medium',
    sla: 45,
    dcwf: '722',
  },
  'GRC-03': {
    ticket_type: 'oscal_ssp',
    tier: 2,
    sort_order: 22,
    difficulty: 'medium',
    sla: 60,
    dcwf: '612',
  },
  'GRC-04': {
    ticket_type: 'poam',
    tier: 2,
    sort_order: 25,
    difficulty: 'medium',
    sla: 45,
    dcwf: '612',
  },
  'GRC-05': {
    ticket_type: 'assessment_procedures',
    tier: 2,
    sort_order: 26,
    difficulty: 'medium',
    sla: 45,
    dcwf: '612',
  },
  'GRC-06': {
    ticket_type: 'conmon_strategy',
    tier: 3,
    sort_order: 30,
    difficulty: 'hard',
    sla: 60,
    dcwf: '722',
  },
  'GRC-07': {
    ticket_type: 'cmmc_gap_analysis',
    tier: 3,
    sort_order: 32,
    difficulty: 'hard',
    sla: 60,
    dcwf: '722',
  },
  'GRC-08': {
    ticket_type: 'sec_materiality',
    tier: 3,
    sort_order: 31,
    difficulty: 'hard',
    sla: 45,
    dcwf: '722',
  },
  'GRC-09': {
    ticket_type: 'oscal_generator',
    tier: 3,
    sort_order: 90,
    difficulty: 'hard',
    sla: 90,
    dcwf: '621',
  },
  'GRC-10': {
    ticket_type: 'ao_review',
    tier: 3,
    sort_order: 95,
    difficulty: 'hard',
    sla: 90,
    dcwf: '722',
  },
};

function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
}

function loadRows(): SheetRow[] {
  const path = resolve(process.cwd(), 'data/grc/grc-lesson-content.json');
  return JSON.parse(readFileSync(path, 'utf8')) as SheetRow[];
}

function contentPayload(row: SheetRow) {
  return {
    sheetId: row._id,
    scenarioBrief: row['Ticket / Scenario (Student-Facing)'],
    gradingFocus: row['Grading Focus'],
    keyArtifact: row['Key Artifact / Data'],
    cursorPrompt: row['Cursor Prompt (Seed This Exact Content)'],
    source: 'GRC Lesson Content',
  };
}

function ticketInitialMerge(row: SheetRow): Record<string, unknown> {
  const scenario = row['Ticket / Scenario (Student-Facing)'];
  const merge: Record<string, unknown> = {
    sheetId: row._id,
    ticketCode: row._id,
    title: row._title,
    prompt: scenario,
    scenarioBrief: scenario,
    keyArtifact: row['Key Artifact / Data'],
    learningObjective: row['Learning Objective'],
  };

  if (row._id === 'GRC-01') {
    merge.source_framework = 'nist_800_53';
    merge.source_control_id = 'ac-2';
    merge.source_label = 'AC-2 Account Management';
    merge.targets = [
      { framework: 'soc2', label: 'SOC 2 Trust Services Criteria' },
      { framework: 'iso27001', label: 'ISO/IEC 27001:2022 Annex A' },
    ];
  }
  if (row._id === 'GRC-02') {
    merge.vendorProfile = {
      name: 'Northwind SaaS Vendor (fictional)',
      dataTypes: ['customer PII'],
      integration: 'REST API with OAuth',
      vendorPosture: 'SOC 2 Type I only, no penetration test history',
    };
    merge.toolUrl = 'https://www.simplerisk.com/';
  }
  if (row._id === 'GRC-05') {
    merge.control_id = 'ia-5.1';
    merge.controlId = 'ia-5.1';
  }
  if (row._id === 'GRC-06') {
    merge.useStudentSystemProfile = true;
    merge.sourceSystemProfile = {
      mode: 'student_grc03',
      ticketCode: 'GRC-03',
    };
    merge.impactLevel = 'moderate';
  }
  if (row._id === 'GRC-07') {
    // Deliberate 10-practice mix (4 met / 3 partial / 3 not_met → 55%).
    // Full per-practice summaries + answer key live in
    // supabase/migrations/20260810370000_update_grc07_cmmc_practice_mix.sql
    merge.companyName = 'Northwind Retail Technology';
    merge.readinessFormula =
      'readinessPercent = round(100 * Σ weight(score) / N); weight(met)=1, weight(partial)=0.5, weight(not_met)=0';
  }
  if (row._id === 'GRC-09') {
    merge.sampleJsonTemplate = {
      system_name: 'Northwind CUI Enclave',
      fips_199_category: 'moderate',
      controls: [
        {
          id: 'ac-2',
          status: 'implemented',
          narrative:
            'Accounts are provisioned through the corporate SSO IdP with MFA required for all privileged roles. Joiner/mover/leaver tickets update enclave group membership within one business day.',
        },
        {
          id: 'ia-5',
          status: 'partial',
          narrative:
            'Password complexity and rotation are enforced via the IdP. Hardware authenticator rollout for administrators is scheduled; interim compensating control is phishing-resistant MFA for admin roles.',
        },
      ],
    };
  }
  if (row._id === 'GRC-08') {
    merge.companyName = 'Northwind Retail Technology';
    merge.breachScenario = scenario;
    // Exact sheet Key Artifact facts — vendor/subset ambiguity is deliberate.
    merge.breach = {
      company: 'Northwind Retail Technology',
      discoveredAt: 'A payment-processing vendor just disclosed a breach',
      systemsAffected: "payment vendor's own systems, not Northwind's",
      dataExposed: 'names, emails, last-4 card digits',
      customersImpacted: '~4,000',
      remediationStatus: 'contained, forensics ongoing',
      businessImpact:
        'estimated customers impacted (~4,000); vendor\'s remediation status (contained, forensics ongoing)',
      scopeNote:
        "Vendor breach (not a direct Northwind breach); exposed a subset of Northwind's customer records.",
    };
  }

  return merge;
}

async function main() {
  const dbUrl = getDatabaseUrl();
  const rows = loadRows();
  if (rows.length !== 13) {
    throw new Error(`Expected 13 sheet rows, found ${rows.length}`);
  }

  if (!dbUrl) {
    console.log(
      'No DATABASE_URL/SUPABASE_DB_URL set. Apply migration instead:\n' +
        '  supabase/migrations/20260810340000_seed_grc_lesson_content.sql'
    );
    console.log(
      'Titles:',
      rows.map((r) => `${r._id}: ${r._title}`).join(' | ')
    );
    return;
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(`
      ALTER TABLE public.lessons
        ADD COLUMN IF NOT EXISTS content jsonb NOT NULL DEFAULT '{}'::jsonb;
    `);

    const {
      rows: [{ id: trackId }],
    } = await client.query<{ id: string }>(
      `SELECT id FROM public.tracks WHERE slug = 'grc'`
    );

    const {
      rows: iamRows,
    } = await client.query<{ id: string }>(
      `SELECT id FROM public.lessons
       WHERE track_id = $1 AND title = 'Evidence Collection & Validation'
       LIMIT 1`,
      [trackId]
    );
    const iamId = iamRows[0]?.id ?? null;

    for (const row of rows.filter((r) => r._id.startsWith('L'))) {
      const meta = LESSON_META[row._id];
      if (!meta) throw new Error(`Missing lesson meta for ${row._id}`);
      const content = contentPayload(row);
      const depends = row._id === 'L03' ? iamId : null;

      const updated = await client.query(
        `UPDATE public.lessons
         SET tier = $2,
             lesson_type = $3,
             sort_order = $4,
             learning_objectives = $5,
             dcwf_code = COALESCE(dcwf_code, '722'),
             content = $6::jsonb,
             depends_on_lesson_id = COALESCE($7::uuid, depends_on_lesson_id)
         WHERE track_id = $1 AND title = $8
         RETURNING id`,
        [
          trackId,
          meta.tier,
          meta.lesson_type,
          meta.sort_order,
          row['Learning Objective'],
          JSON.stringify(content),
          depends,
          meta.title,
        ]
      );

      if (updated.rowCount === 0) {
        await client.query(
          `INSERT INTO public.lessons (
             track_id, tier, lesson_type, sort_order, title,
             learning_objectives, dcwf_code, content, depends_on_lesson_id
           ) VALUES ($1,$2,$3,$4,$5,$6,'722',$7::jsonb,$8::uuid)`,
          [
            trackId,
            meta.tier,
            meta.lesson_type,
            meta.sort_order,
            meta.title,
            row['Learning Objective'],
            JSON.stringify(content),
            depends,
          ]
        );
      }
    }

    for (const row of rows.filter((r) => r._id.startsWith('GRC-'))) {
      const meta = TICKET_META[row._id];
      if (!meta) throw new Error(`Missing ticket meta for ${row._id}`);
      const scenario = row['Ticket / Scenario (Student-Facing)'];
      const merge = ticketInitialMerge(row);
      const expected = {
        gradingFocus: row['Grading Focus'],
        sheetId: row._id,
        learningObjective: row['Learning Objective'],
      };

      for (const tenantId of [COMMERCIAL, DOD]) {
        const updated = await client.query(
          `UPDATE public.tickets
           SET scenario_brief = $3,
               tier = $4,
               sort_order = $5,
               initial_state = COALESCE(initial_state, '{}'::jsonb) || $6::jsonb,
               expected_state = COALESCE(expected_state, '{}'::jsonb) || $7::jsonb,
               dcwf_code = COALESCE(dcwf_code, $8)
           WHERE tenant_id = $1
             AND track_id = $2
             AND ticket_type = $9
           RETURNING id`,
          [
            tenantId,
            trackId,
            scenario,
            meta.tier,
            meta.sort_order,
            JSON.stringify(merge),
            JSON.stringify(expected),
            meta.dcwf,
            meta.ticket_type,
          ]
        );

        if (updated.rowCount === 0) {
          await client.query(
            `INSERT INTO public.tickets (
               tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes,
               scenario_brief, initial_state, expected_state, dcwf_code, sort_order
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)`,
            [
              tenantId,
              trackId,
              meta.tier,
              meta.ticket_type,
              meta.difficulty,
              meta.sla,
              scenario,
              JSON.stringify(merge),
              JSON.stringify(expected),
              meta.dcwf,
              meta.sort_order,
            ]
          );
        }
      }
    }

    await client.query('COMMIT');

    const verify = await client.query<{
      kind: string;
      title: string;
      sheet_id: string | null;
      scenario_preview: string;
    }>(
      `
      SELECT 'lesson' AS kind, title,
             content->>'sheetId' AS sheet_id,
             left(content->>'scenarioBrief', 80) AS scenario_preview
      FROM lessons
      WHERE track_id = $1
        AND content ? 'scenarioBrief'
        AND coalesce(content->>'scenarioBrief','') <> ''
      UNION ALL
      SELECT DISTINCT ON (ticket_type) 'ticket',
             coalesce(initial_state->>'title', ticket_type),
             initial_state->>'sheetId',
             left(scenario_brief, 80)
      FROM tickets
      WHERE track_id = $1
        AND initial_state->>'sheetId' LIKE 'GRC-%'
      ORDER BY 1, 3
      `,
      [trackId]
    );

    console.log('Seeded/verified rows:');
    for (const row of verify.rows) {
      console.log(`  [${row.kind}] ${row.sheet_id ?? '?'} ${row.title}: ${row.scenario_preview}`);
    }
    console.log(`Total verified: ${verify.rows.length}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
