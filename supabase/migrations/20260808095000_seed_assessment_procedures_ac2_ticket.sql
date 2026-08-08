-- Seed a Tier 2 assessment_procedures ticket on the GRC track (commercial tenant).
-- Students write Examine / Interview / Test procedures for AC-2; graded via RAG
-- against live SP 800-53A assessment objectives from the pinned OSCAL catalog.

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
  'assessment_procedures',
  'medium',
  45,
  'Draft SP 800-53A assessment procedures for AC-2 (Account Management) using Examine, Interview, and Test methods.',
  '{
    "control_id": "ac-2",
    "prompt": "Using NIST SP 800-53A methods, write assessment procedures for AC-2. Cover Examine (artifacts/config), Interview (personnel), and Test (mechanisms/processes). Your submission will be graded against the live 800-53A assessment objectives for this control."
  }'::jsonb,
  '{
    "control_id": "ac-2",
    "minFieldLength": 40
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
      AND existing.ticket_type = 'assessment_procedures'
      AND existing.scenario_brief LIKE 'Draft SP 800-53A assessment procedures for AC-2%'
  );
