-- GRC-05: pin assessment_procedures ticket to IA-5(1) / ia-5.1.
-- Graded against live SP 800-53A assessment-objective text (OSCAL assessment
-- parts in the pinned NIST SP-800-53 rev5 catalog), not the 53 control statement.
--
-- Fixes expected_state.control_id leftover from the AC-2 seed, which would
-- otherwise win over initial_state when resolving the control for grading.

UPDATE public.tickets AS t
SET
  scenario_brief = $sgrc05$Before the SOC 2 auditor's fieldwork begins, draft the assessment procedures your team will use to test control IA-5(1) yourselves, structured as Examine / Interview / Test, so you're not walking into the audit blind.$sgrc05$,
  tier = 2,
  difficulty = 'medium',
  sla_minutes = 45,
  dcwf_code = COALESCE(t.dcwf_code, '612'),
  initial_state = COALESCE(t.initial_state, '{}'::jsonb) || $igrc05${
    "sheetId": "GRC-05",
    "ticketCode": "GRC-05",
    "title": "SP 800-53A assessment procedure lab",
    "control_id": "ia-5.1",
    "controlId": "ia-5.1",
    "prompt": "Before the SOC 2 auditor's fieldwork begins, draft the assessment procedures your team will use to test control IA-5(1) yourselves, structured as Examine / Interview / Test, so you're not walking into the audit blind.",
    "scenarioBrief": "Before the SOC 2 auditor's fieldwork begins, draft the assessment procedures your team will use to test control IA-5(1) yourselves, structured as Examine / Interview / Test, so you're not walking into the audit blind.",
    "keyArtifact": "None -- control_id given, live SP 800-53A text retrieved at grading time.",
    "learningObjective": "Write Examine/Interview/Test assessment procedures for IA-5(1) before the SOC 2 auditor's fieldwork begins."
  }$igrc05$::jsonb,
  expected_state = COALESCE(t.expected_state, '{}'::jsonb) || $egrc05${
    "sheetId": "GRC-05",
    "control_id": "ia-5.1",
    "controlId": "ia-5.1",
    "minFieldLength": 40,
    "gradingFocus": "RAG-graded against live SP 800-53A assessment objective text for IA-5(1) -- does the procedure actually test what the objective requires, using all three methods appropriately, not just restate the control statement.",
    "learningObjective": "Write Examine/Interview/Test assessment procedures for IA-5(1) before the SOC 2 auditor's fieldwork begins."
  }$egrc05$::jsonb
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type = 'assessment_procedures'
  AND t.tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  );
