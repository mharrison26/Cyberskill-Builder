-- Seed a Tier 1 control_implementation_adequacy ticket on the GRC track.
-- Students judge whether a written AC-2 implementation statement is adequate
-- or inadequate and justify; scored with deterministic judgment match + RAG
-- against live SP 800-53 control text via getControlText (F25).

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
  1,
  'control_implementation_adequacy',
  'medium',
  30,
  $brief$
HarborNet CMS shipped an AC-2 (Account Management) implementation statement for the draft SSP. Judge whether the statement adequately addresses the control requirements, and justify your decision against the live control text.
$brief$,
  $initial${
    "controlId": "AC-2",
    "controlTitle": "Account Management",
    "systemName": "HarborNet CMS",
    "implementationStatement": "User accounts for HarborNet CMS are managed appropriately by IT staff in accordance with organizational security practices. Access is granted as needed and removed when no longer required.",
    "prompt": "Judge whether the implementation statement adequately addresses the AC-2 control requirements. Cite specific requirements from the control (account types, managers, create/enable/modify/disable/remove, reviews, termination/transfer notifications) when explaining your judgment."
  }$initial$::jsonb,
  $expected${
    "expectedJudgment": "inadequate",
    "controlId": "AC-2",
    "minJustificationLength": 80,
    "guidanceTopics": []
  }$expected$::jsonb,
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
      AND existing.ticket_type = 'control_implementation_adequacy'
      AND existing.scenario_brief LIKE 'HarborNet CMS shipped an AC-2%'
  );
