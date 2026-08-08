-- Seed OSCAL generator capstone ticket (GRC track).
--
-- Students complete a Node (or Python) script in the WebContainer CodeSandbox
-- that reads input/system.json and writes a minimal OSCAL SSP to output/ssp.json.
-- Grading (ticket_type = oscal_generator | capstone_oscal):
--   1. Basic static checks on the submitted script
--   2. JSON Schema validation of the generated OSCAL document
--
-- How to create / customize:
--   1. Admin → Tickets → ticket_type = oscal_generator (alias: capstone_oscal)
--   2. Put lab files under initial_state.files
--   3. expected_state knobs: documentKind, scriptPath, inputPath, outputPath
--
-- Idempotent: deletes prior seed rows by stable scenario_brief marker per tenant.

WITH seed_tenants AS (
  SELECT id
  FROM public.tenants
  WHERE id IN (
    '00000000-0000-4000-8000-000000000001'::uuid, -- commercial
    '00000000-0000-4000-8000-000000000003'::uuid  -- dod_adjacent
  )
),
grc AS (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc'
)
DELETE FROM public.tickets t
USING seed_tenants st, grc
WHERE t.tenant_id = st.id
  AND t.track_id = grc.track_id
  AND t.ticket_type IN ('oscal_generator', 'capstone_oscal')
  AND t.scenario_brief LIKE 'Capstone OSCAL:%';

INSERT INTO public.tickets (
  tenant_id,
  track_id,
  tier,
  ticket_type,
  difficulty,
  sla_minutes,
  scenario_brief,
  initial_state,
  expected_state,
  dcwf_code,
  sort_order
)
SELECT
  st.id,
  grc.track_id,
  3,
  'oscal_generator',
  'high',
  90,
  'Capstone OSCAL: Generate a minimal System Security Plan from JSON input',
  jsonb_build_object(
    'files', jsonb_build_object(
      'README.md', $readme$# Capstone: OSCAL SSP generator

Write a small **Node.js** or **Python** script that:

1. Reads `input/system.json`
2. Builds a **minimal valid** OSCAL System Security Plan (SSP)
3. Writes JSON to `output/ssp.json`

## Workflow

1. Edit `generate_ssp.js` (or replace it with `generate_ssp.py`)
2. In the sandbox terminal, run: `node generate_ssp.js`
3. Confirm `output/ssp.json` exists
4. Click **Submit lab**

Grading checks (a) basic script structure / I/O intent and (b) that
`output/ssp.json` validates against the NIST OSCAL SSP JSON Schema.

Tip: keep UUIDs as RFC 4122 version 4/5 and timestamps with timezone
(e.g. `2024-01-15T12:00:00Z`).
$readme$,
      'input/system.json', $input${
  "systemId": "ACME-CRM-01",
  "systemName": "ACME Customer Portal",
  "description": "Customer-facing web portal for account management.",
  "boundary": "Public VPC edge to application tier; no direct database exposure.",
  "profileHref": "#profile",
  "controlIds": ["ac-1", "ac-2"]
}
$input$,
      'generate_ssp.js', $script$/**
 * Capstone stub — complete this generator.
 *
 * Read input/system.json and write a minimal valid OSCAL SSP to output/ssp.json.
 * Run: node generate_ssp.js
 */

const fs = require('fs');

function buildSsp(input) {
  // TODO: map input fields into a minimal OSCAL system-security-plan.
  // Required assemblies: metadata, import-profile, system-characteristics,
  // system-implementation, control-implementation.
  const uuid = '11111111-1111-4111-8111-111111111111';
  const now = '2024-01-15T12:00:00Z';

  return {
    'system-security-plan': {
      uuid,
      metadata: {
        title: `${input.systemName} SSP`,
        'last-modified': now,
        version: '1.0',
        'oscal-version': '1.1.2',
      },
      'import-profile': { href: input.profileHref || '#profile' },
      // Expand the remaining required assemblies using input.* fields.
    },
  };
}

function main() {
  const input = JSON.parse(fs.readFileSync('input/system.json', 'utf8'));
  const ssp = buildSsp(input);
  fs.mkdirSync('output', { recursive: true });
  fs.writeFileSync('output/ssp.json', JSON.stringify(ssp, null, 2));
  console.log('Wrote output/ssp.json');
}

main();
$script$
    )
  ),
  jsonb_build_object(
    'documentKind', 'ssp',
    'scriptPath', 'generate_ssp.js',
    'inputPath', 'input/system.json',
    'outputPath', 'output/ssp.json',
    'minScriptChars', 80
  ),
  '612',
  90
FROM (
  SELECT id
  FROM public.tenants
  WHERE id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
) AS st
CROSS JOIN (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc'
) AS grc;
