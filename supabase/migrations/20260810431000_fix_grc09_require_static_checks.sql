-- GRC-09: grade both OSCAL schema validation and basic script structure checks.
-- requireStaticChecks was seeded false (advisory-only); enable it as a pass gate.

UPDATE public.tickets AS t
SET
  expected_state = COALESCE(t.expected_state, '{}'::jsonb) || $egrc09${
    "sheetId": "GRC-09",
    "documentKind": "ssp",
    "scriptPath": "generate_ssp.js",
    "inputPath": "input/system.json",
    "outputPath": "output/ssp.json",
    "requireStaticChecks": true,
    "gradingFocus": "Generated OSCAL validates against schema (deterministic). Basic script structure checks also gate pass/fail (reads input, produces valid output, handles a missing field gracefully) -- not a full code review.",
    "learningObjective": "Write a script that generates a valid OSCAL SSP fragment from structured JSON input, validated against the schema."
  }$egrc09$::jsonb,
  initial_state = CASE
    WHEN t.initial_state ? 'files' THEN
      jsonb_set(
        COALESCE(t.initial_state, '{}'::jsonb),
        '{files,README.md}',
        to_jsonb((
$readme$# GRC-09: OSCAL SSP generator

Write a **Node.js** or **Python** script that:

1. Reads `input/system.json` (sample template: `system_name`, `fips_199_category`, `controls[]`)
2. Builds a **minimal valid** OSCAL System Security Plan (SSP)
3. Writes JSON to `output/ssp.json` (or prints JSON to stdout)

## Workflow

1. Edit `generate_ssp.js` (or replace it with `generate_ssp.py`)
2. Optionally preview in the terminal: `node generate_ssp.js`
3. Click **Submit lab** — the sandbox re-runs your script against the canonical sample input
4. Pass/fail requires **OSCAL schema validation** and **basic script structure checks** (reads input, writes JSON, not a stub) — not a full code review

Tip: keep UUIDs as RFC 4122 and timestamps with timezone (e.g. `2024-01-15T12:00:00Z`).
$readme$
        )::text),
        true
      )
    ELSE t.initial_state
  END
WHERE t.ticket_type IN ('oscal_generator', 'capstone_oscal')
  AND t.tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  )
  AND (
    t.initial_state->>'sheetId' = 'GRC-09'
    OR t.initial_state->>'ticketCode' = 'GRC-09'
    OR t.scenario_brief LIKE 'Manually re-typing SSP data%'
    OR t.scenario_brief LIKE 'Capstone OSCAL:%'
  );
