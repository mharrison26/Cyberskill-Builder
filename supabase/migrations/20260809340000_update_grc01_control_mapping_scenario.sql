-- GRC-01: Cross-framework control mapping matrix
-- Populate scenario_brief from the GRC Lesson Content sheet (exact student-facing
-- ticket text). Enable overlap-narrative RAG grading after deterministic
-- control_mappings ID checks.

UPDATE public.tickets AS t
SET
  scenario_brief =
    'Northwind''s new enterprise customer wants written assurance that Northwind''s existing SOC 2 report also covers their upcoming ISO 27001 certification needs, and separately, procurement wants to know which 800-53 controls a specific SOC 2 CC6.1 test already partially evidences. Given control ID AC-2, identify its equivalent(s) in SOC 2 (Trust Services Criteria) and ISO 27001:2022 Annex A, and explain where the mappings are strong versus where they only partially overlap.',
  initial_state = jsonb_set(
    COALESCE(t.initial_state, '{}'::jsonb),
    '{prompt}',
    to_jsonb(
      'Select every SOC 2 Trust Services Criterion and ISO/IEC 27001:2022 Annex A control that maps to AC-2 in the reference crosswalk, then explain where those mappings are strong versus only partially overlapping (for example, where SOC 2 CC6.1 does not test account-review cadence the way AC-2 requires). Incorrect control selections lower your score.'::text
    ),
    true
  ),
  expected_state = COALESCE(t.expected_state, '{}'::jsonb)
    || jsonb_build_object(
      'scoringMode', 'options_set_match',
      'passThresholdPercent', 100,
      'gradeOverlapNarrative', true,
      'minOverlapNarrativeLength', 120
    )
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type = 'control_mapping'
  AND t.initial_state->>'source_control_id' = 'AC-2';
