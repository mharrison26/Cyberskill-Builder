-- GRC-01: restore Tier 2 control_mapping candidate options.
-- The lesson-content seed (20260810340000) jsonb-merged targets without
-- `options`, which left ControlMappingWorkArea with empty candidate lists and
-- forced free-text scoring against the full AC-2 crosswalk fan-out.

UPDATE public.tickets AS t
SET
  initial_state =
    COALESCE(t.initial_state, '{}'::jsonb)
    || jsonb_build_object(
      'source_framework', 'nist_800_53',
      'source_control_id', 'AC-2',
      'source_label', 'NIST SP 800-53 Rev. 5 — AC-2 Account Management',
      'prompt',
      'Given NIST SP 800-53 control AC-2, select every equivalent SOC 2 Trust Services Criterion and ISO/IEC 27001:2022 Annex A control from the candidate lists. Scoring uses the reference crosswalk table (not an AI guess). Then explain where those mappings are strong versus only partially overlapping (for example, where SOC 2 CC6.1 does not test account-review cadence the way AC-2 requires).',
      'targets',
      $targets$[
        {
          "framework": "soc2",
          "label": "SOC 2 Trust Services Criteria",
          "options": ["CC6.1", "CC6.2", "CC6.3", "CC7.1", "A1.2"]
        },
        {
          "framework": "iso27001",
          "label": "ISO/IEC 27001:2022 Annex A",
          "options": ["A.5.15", "A.5.16", "A.5.18", "A.5.7", "A.8.9"]
        }
      ]$targets$::jsonb
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
  AND lower(COALESCE(t.initial_state->>'source_control_id', '')) = 'ac-2';
