-- Seed a Tier 2 sampling_methodology ticket on the GRC track.
-- Students review a 75-transaction AP population, describe statistical random
-- sampling of size 25, and identify risk-based additions. Scoring is
-- deterministic against expected_state requirements (no LLM).
--
-- How to customize:
--   1. Admin → Tickets → create/edit ticket_type = sampling_methodology
--   2. initial_state knobs: populationSize (50–100), populationSeed, methodology,
--      riskCriteria, prompt. Optional: embed initial_state.transactions array.
--   3. expected_state knobs: requiredSampleSize, requiredApproachKeywords,
--      requireRiskBasedAdditions, requiredRiskCriteria, minMethodologyLength,
--      minRiskAdditionsLength
--
-- Idempotent: skips insert when the same scenario_brief already exists on grc.

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
  '00000000-0000-4000-8000-000000000001'::uuid,
  t.id,
  2,
  'sampling_methodology',
  'medium',
  45,
  'Sampling: Select a statistical random sample of 25 from AP transactions and identify risk-based additions.',
  '{
    "populationSize": 75,
    "populationSeed": 20260808,
    "methodology": {
      "approach": "statistical_random",
      "sampleSize": 25,
      "description": "Statistical random sampling of size 25 from the accounts-payable transaction population, plus risk-based additions for high-risk attributes."
    },
    "riskCriteria": [
      "high_value",
      "privileged_account",
      "after_hours",
      "foreign_vendor"
    ],
    "prompt": "You are assessing a moderate-impact finance application. The table below is the full population of AP transactions for the period. The engagement plan requires statistical random sampling of size 25. Describe how you would select that sample, then identify any risk-based additions (high value, privileged account, after-hours, foreign vendor) you would include beyond the random draw."
  }'::jsonb,
  '{
    "requiredSampleSize": 25,
    "requiredApproachKeywords": ["random", "statistical"],
    "requireRiskBasedAdditions": true,
    "requiredRiskCriteria": [
      "high_value",
      "privileged_account",
      "after_hours",
      "foreign_vendor"
    ],
    "minMethodologyLength": 80,
    "minRiskAdditionsLength": 80
  }'::jsonb,
  '612',
  COALESCE(
    (
      SELECT MAX(tk.sort_order) + 1
      FROM public.tickets AS tk
      WHERE tk.track_id = t.id
    ),
    0
  )
FROM public.tracks AS t
WHERE t.slug = 'grc'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tickets AS existing
    WHERE existing.track_id = t.id
      AND existing.ticket_type IN (
        'sampling_methodology',
        'assessment_sampling',
        'transaction_sampling'
      )
      AND existing.scenario_brief LIKE 'Sampling: Select a statistical random sample of 25%'
  );
