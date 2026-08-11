-- Backfill finding severity + POA&M due dates on GRC tickets.
-- Severity is finding risk (critical/high/medium/low), NOT lesson difficulty.
-- Unrated (null) remains valid for non-finding work; openBySeverity counts it
-- separately and never defaults missing severity to medium.

WITH grc_track AS (
  SELECT id FROM public.tracks WHERE slug = 'grc' LIMIT 1
),
sheet_updates(sheet_id, severity, poam_due_at) AS (
  VALUES
    ('GRC-01', 'medium', NULL::text),
    ('GRC-02', 'medium', NULL),
    ('GRC-03', 'medium', NULL),
    ('GRC-04', 'medium', '2026-08-20'),
    ('GRC-05', 'medium', NULL),
    ('GRC-06', 'medium', '2026-08-18'),
    ('GRC-07', 'high', '2026-08-15'),
    ('GRC-08', 'high', NULL),
    ('GRC-09', 'medium', NULL),
    ('GRC-10', 'medium', NULL)
)
UPDATE public.tickets t
SET initial_state =
  COALESCE(t.initial_state, '{}'::jsonb)
  || jsonb_strip_nulls(
    jsonb_build_object(
      'severity', u.severity,
      'poam_due_at', u.poam_due_at,
      'poamDueAt', u.poam_due_at
    )
  )
FROM sheet_updates u, grc_track g
WHERE t.track_id = g.id
  AND (
    t.initial_state->>'sheetId' = u.sheet_id
    OR t.initial_state->>'ticketCode' = u.sheet_id
  );

-- Non-sheet GRC scenarios (seeded by other migrations).
WITH grc_track AS (
  SELECT id FROM public.tracks WHERE slug = 'grc' LIMIT 1
),
type_updates(ticket_type, severity, poam_due_at) AS (
  VALUES
    ('control_implementation_adequacy', 'medium', NULL::text),
    ('fips_199_impact_categorization', 'medium', NULL),
    ('ssp_gap_review', 'medium', NULL),
    ('raci_matrix', 'low', NULL),
    ('policy_section_draft', 'low', NULL),
    ('program_metrics_brief', 'medium', NULL),
    ('vendor_risk_rating', 'high', NULL)
)
UPDATE public.tickets t
SET initial_state =
  COALESCE(t.initial_state, '{}'::jsonb)
  || jsonb_strip_nulls(
    jsonb_build_object(
      'severity', u.severity,
      'poam_due_at', u.poam_due_at,
      'poamDueAt', u.poam_due_at
    )
  )
FROM type_updates u, grc_track g
WHERE t.track_id = g.id
  AND t.ticket_type = u.ticket_type
  AND COALESCE(t.initial_state->>'severity', '') = '';
