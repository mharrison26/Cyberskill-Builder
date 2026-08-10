-- GRC-09: OSCAL automation capstone
-- Provide the sample JSON template (system_name, fips_199_category, controls[])
-- in ticket.initial_state. Pass/fail is OSCAL SSP schema validation after the
-- WebContainer (PI-04) runs the student script against that sample input.

UPDATE public.tickets AS t
SET
  scenario_brief = $sgrc09$Manually re-typing SSP data every time a system's categorization changes doesn't scale. Write a script that reads a JSON input file (system name, categorization, control implementation statuses) and generates a valid OSCAL SSP fragment automatically.$sgrc09$,
  tier = 3,
  sort_order = 90,
  difficulty = 'hard',
  sla_minutes = 90,
  dcwf_code = COALESCE(t.dcwf_code, '621'),
  initial_state = $mgrc09${
  "sheetId": "GRC-09",
  "ticketCode": "GRC-09",
  "title": "OSCAL automation capstone",
  "prompt": "Manually re-typing SSP data every time a system's categorization changes doesn't scale. Write a script that reads a JSON input file (system name, categorization, control implementation statuses) and generates a valid OSCAL SSP fragment automatically.",
  "scenarioBrief": "Manually re-typing SSP data every time a system's categorization changes doesn't scale. Write a script that reads a JSON input file (system name, categorization, control implementation statuses) and generates a valid OSCAL SSP fragment automatically.",
  "keyArtifact": "A sample JSON input file structure (system_name, fips_199_category, controls: [{id, status, narrative}]) provided as a starting template.",
  "learningObjective": "Write a script that generates a valid OSCAL SSP fragment from structured JSON input, validated against the schema.",
  "sampleJsonTemplate": {
    "system_name": "Northwind CUI Enclave",
    "fips_199_category": "moderate",
    "controls": [
      {
        "id": "ac-2",
        "status": "implemented",
        "narrative": "Accounts are provisioned through the corporate SSO IdP with MFA required for all privileged roles. Joiner/mover/leaver tickets update enclave group membership within one business day."
      },
      {
        "id": "ia-5",
        "status": "partial",
        "narrative": "Password complexity and rotation are enforced via the IdP. Hardware authenticator rollout for administrators is scheduled; interim compensating control is phishing-resistant MFA for admin roles."
      }
    ]
  },
  "files": {
    "README.md": "# GRC-09: OSCAL SSP generator\n\nWrite a **Node.js** or **Python** script that:\n\n1. Reads `input/system.json` (sample template: `system_name`, `fips_199_category`, `controls[]`)\n2. Builds a **minimal valid** OSCAL System Security Plan (SSP)\n3. Writes JSON to `output/ssp.json` (or prints JSON to stdout)\n\n## Workflow\n\n1. Edit `generate_ssp.js` (or replace it with `generate_ssp.py`)\n2. Optionally preview in the terminal: `node generate_ssp.js`\n3. Click **Submit lab** — the sandbox re-runs your script against the canonical sample input\n4. Pass/fail is **OSCAL SSP JSON Schema validation only** (not subjective code quality)\n\nTip: keep UUIDs as RFC 4122 and timestamps with timezone (e.g. `2024-01-15T12:00:00Z`).\n",
    "input/system.json": "{\n  \"system_name\": \"Northwind CUI Enclave\",\n  \"fips_199_category\": \"moderate\",\n  \"controls\": [\n    {\n      \"id\": \"ac-2\",\n      \"status\": \"implemented\",\n      \"narrative\": \"Accounts are provisioned through the corporate SSO IdP with MFA required for all privileged roles. Joiner/mover/leaver tickets update enclave group membership within one business day.\"\n    },\n    {\n      \"id\": \"ia-5\",\n      \"status\": \"partial\",\n      \"narrative\": \"Password complexity and rotation are enforced via the IdP. Hardware authenticator rollout for administrators is scheduled; interim compensating control is phishing-resistant MFA for admin roles.\"\n    }\n  ]\n}\n",
    "generate_ssp.js": "/**\n * GRC-09 stub — complete this generator.\n *\n * Read input/system.json and write a minimal valid OSCAL SSP to output/ssp.json.\n * On submit, the sandbox re-runs this script against the sample input.\n * Pass/fail = OSCAL SSP JSON Schema validation only.\n *\n * Run: node generate_ssp.js\n */\n\nconst fs = require('fs');\n\nfunction buildSsp(input) {\n  // TODO: map input.system_name, input.fips_199_category, and input.controls\n  // into a minimal OSCAL system-security-plan.\n  // Required assemblies: metadata, import-profile, system-characteristics,\n  // system-implementation, control-implementation.\n  const uuid = '11111111-1111-4111-8111-111111111111';\n  const now = '2024-01-15T12:00:00Z';\n\n  return {\n    'system-security-plan': {\n      uuid,\n      metadata: {\n        title: `${input.system_name || 'System'} SSP`,\n        'last-modified': now,\n        version: '1.0',\n        'oscal-version': '1.1.2',\n      },\n      'import-profile': { href: '#profile' },\n      // Expand the remaining required assemblies using input.* fields.\n    },\n  };\n}\n\nfunction main() {\n  const input = JSON.parse(fs.readFileSync('input/system.json', 'utf8'));\n  const ssp = buildSsp(input);\n  fs.mkdirSync('output', { recursive: true });\n  fs.writeFileSync('output/ssp.json', JSON.stringify(ssp, null, 2));\n  console.log('Wrote output/ssp.json');\n}\n\nmain();\n"
  }
}$mgrc09$::jsonb,
  expected_state = $egrc09${
  "sheetId": "GRC-09",
  "documentKind": "ssp",
  "scriptPath": "generate_ssp.js",
  "inputPath": "input/system.json",
  "outputPath": "output/ssp.json",
  "requireStaticChecks": false,
  "gradingFocus": "Generated OSCAL validates against schema (deterministic, primary gate). Basic script structure check (reads input, produces valid output, handles a missing field gracefully) -- not a full code review.",
  "learningObjective": "Write a script that generates a valid OSCAL SSP fragment from structured JSON input, validated against the schema."
}$egrc09$::jsonb
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND t.ticket_type IN ('oscal_generator', 'capstone_oscal')
  AND t.tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND (
    tr.slug IN ('grc', 'isso')
    OR t.initial_state->>'sheetId' = 'GRC-09'
    OR t.scenario_brief LIKE 'Capstone OSCAL:%'
    OR t.scenario_brief LIKE 'Manually re-typing SSP data%'
  );

-- Ensure GRC-track rows exist (tickets may live only on ISSO after reassignment).
INSERT INTO public.tickets (
  tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes,
  scenario_brief, initial_state, expected_state, dcwf_code, sort_order
)
SELECT
  st.id,
  grc.track_id,
  3,
  'oscal_generator',
  'hard',
  90,
  $sgrc09$Manually re-typing SSP data every time a system's categorization changes doesn't scale. Write a script that reads a JSON input file (system name, categorization, control implementation statuses) and generates a valid OSCAL SSP fragment automatically.$sgrc09$,
  $mgrc09${
  "sheetId": "GRC-09",
  "ticketCode": "GRC-09",
  "title": "OSCAL automation capstone",
  "prompt": "Manually re-typing SSP data every time a system's categorization changes doesn't scale. Write a script that reads a JSON input file (system name, categorization, control implementation statuses) and generates a valid OSCAL SSP fragment automatically.",
  "scenarioBrief": "Manually re-typing SSP data every time a system's categorization changes doesn't scale. Write a script that reads a JSON input file (system name, categorization, control implementation statuses) and generates a valid OSCAL SSP fragment automatically.",
  "keyArtifact": "A sample JSON input file structure (system_name, fips_199_category, controls: [{id, status, narrative}]) provided as a starting template.",
  "learningObjective": "Write a script that generates a valid OSCAL SSP fragment from structured JSON input, validated against the schema.",
  "sampleJsonTemplate": {
    "system_name": "Northwind CUI Enclave",
    "fips_199_category": "moderate",
    "controls": [
      {
        "id": "ac-2",
        "status": "implemented",
        "narrative": "Accounts are provisioned through the corporate SSO IdP with MFA required for all privileged roles. Joiner/mover/leaver tickets update enclave group membership within one business day."
      },
      {
        "id": "ia-5",
        "status": "partial",
        "narrative": "Password complexity and rotation are enforced via the IdP. Hardware authenticator rollout for administrators is scheduled; interim compensating control is phishing-resistant MFA for admin roles."
      }
    ]
  },
  "files": {
    "README.md": "# GRC-09: OSCAL SSP generator\n\nWrite a **Node.js** or **Python** script that:\n\n1. Reads `input/system.json` (sample template: `system_name`, `fips_199_category`, `controls[]`)\n2. Builds a **minimal valid** OSCAL System Security Plan (SSP)\n3. Writes JSON to `output/ssp.json` (or prints JSON to stdout)\n\n## Workflow\n\n1. Edit `generate_ssp.js` (or replace it with `generate_ssp.py`)\n2. Optionally preview in the terminal: `node generate_ssp.js`\n3. Click **Submit lab** — the sandbox re-runs your script against the canonical sample input\n4. Pass/fail is **OSCAL SSP JSON Schema validation only** (not subjective code quality)\n\nTip: keep UUIDs as RFC 4122 and timestamps with timezone (e.g. `2024-01-15T12:00:00Z`).\n",
    "input/system.json": "{\n  \"system_name\": \"Northwind CUI Enclave\",\n  \"fips_199_category\": \"moderate\",\n  \"controls\": [\n    {\n      \"id\": \"ac-2\",\n      \"status\": \"implemented\",\n      \"narrative\": \"Accounts are provisioned through the corporate SSO IdP with MFA required for all privileged roles. Joiner/mover/leaver tickets update enclave group membership within one business day.\"\n    },\n    {\n      \"id\": \"ia-5\",\n      \"status\": \"partial\",\n      \"narrative\": \"Password complexity and rotation are enforced via the IdP. Hardware authenticator rollout for administrators is scheduled; interim compensating control is phishing-resistant MFA for admin roles.\"\n    }\n  ]\n}\n",
    "generate_ssp.js": "/**\n * GRC-09 stub — complete this generator.\n *\n * Read input/system.json and write a minimal valid OSCAL SSP to output/ssp.json.\n * On submit, the sandbox re-runs this script against the sample input.\n * Pass/fail = OSCAL SSP JSON Schema validation only.\n *\n * Run: node generate_ssp.js\n */\n\nconst fs = require('fs');\n\nfunction buildSsp(input) {\n  // TODO: map input.system_name, input.fips_199_category, and input.controls\n  // into a minimal OSCAL system-security-plan.\n  // Required assemblies: metadata, import-profile, system-characteristics,\n  // system-implementation, control-implementation.\n  const uuid = '11111111-1111-4111-8111-111111111111';\n  const now = '2024-01-15T12:00:00Z';\n\n  return {\n    'system-security-plan': {\n      uuid,\n      metadata: {\n        title: `${input.system_name || 'System'} SSP`,\n        'last-modified': now,\n        version: '1.0',\n        'oscal-version': '1.1.2',\n      },\n      'import-profile': { href: '#profile' },\n      // Expand the remaining required assemblies using input.* fields.\n    },\n  };\n}\n\nfunction main() {\n  const input = JSON.parse(fs.readFileSync('input/system.json', 'utf8'));\n  const ssp = buildSsp(input);\n  fs.mkdirSync('output', { recursive: true });\n  fs.writeFileSync('output/ssp.json', JSON.stringify(ssp, null, 2));\n  console.log('Wrote output/ssp.json');\n}\n\nmain();\n"
  }
}$mgrc09$::jsonb,
  $egrc09${
  "sheetId": "GRC-09",
  "documentKind": "ssp",
  "scriptPath": "generate_ssp.js",
  "inputPath": "input/system.json",
  "outputPath": "output/ssp.json",
  "requireStaticChecks": false,
  "gradingFocus": "Generated OSCAL validates against schema (deterministic, primary gate). Basic script structure check (reads input, produces valid output, handles a missing field gracefully) -- not a full code review.",
  "learningObjective": "Write a script that generates a valid OSCAL SSP fragment from structured JSON input, validated against the schema."
}$egrc09$::jsonb,
  '621',
  90
FROM (
  SELECT id FROM public.tenants
  WHERE id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
) AS st
CROSS JOIN (SELECT id AS track_id FROM public.tracks WHERE slug = 'grc') AS grc
WHERE NOT EXISTS (
  SELECT 1 FROM public.tickets existing
  WHERE existing.tenant_id = st.id
    AND existing.track_id = grc.track_id
    AND existing.ticket_type = 'oscal_generator'
);
