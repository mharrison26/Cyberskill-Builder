-- Seed exact GRC Lesson Content (13 rows) from CyberSkillBuilder_GRC_Premium_MVP.xlsx
-- Source sheet: "GRC Lesson Content" (L01-L03 lessons + GRC-01..GRC-10 tickets).
-- Do not invent scenario text — values are copied verbatim from the sheet export
-- at data/grc/grc-lesson-content.json.
--
-- Idempotent: upserts lessons by (track_id, title); merges ticket scenario fields
-- by track slug 'grc' + ticket_type (+ sheetId marker).

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS content jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.lessons.content IS
  'Authoring payload for lesson body: scenarioBrief, gradingFocus, keyArtifact, sheetId, etc.';


-- L01: Core Framework Differences
WITH grc AS (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc'
),
iam AS (
  SELECT l.id
  FROM public.lessons l
  CROSS JOIN grc
  WHERE l.track_id = grc.track_id
    AND l.title = 'Evidence Collection & Validation'
  LIMIT 1
)
UPDATE public.lessons AS target
SET
  tier = '1',
  lesson_type = 'conceptual',
  sort_order = 1,
  learning_objectives = $ol01$Distinguish voluntary/attestation-based commercial compliance from mandatory, prescriptive federal RMF obligations.$ol01$,
  dcwf_code = COALESCE(target.dcwf_code, '722'),
  content = $cl01${"sheetId": "L01", "scenarioBrief": "You're the newest hire on Northwind Retail Technology's two-person security team. Your manager, Dana Wu, is onboarding a contractor who has worked exclusively in commercial SaaS and has never touched a federal engagement. She asks you to draft a one-page orientation memo explaining, in plain terms, how commercial compliance obligations (SOC 2, ISO 27001, NIST CSF 2.0, SEC materiality rules) differ from federal/DoD obligations (NIST SP 800-37 RMF, SP 800-53, SP 800-171, CMMC 2.0), so the contractor doesn't apply the wrong mental model to Northwind's upcoming DoD subcontract.", "gradingFocus": "Memo correctly distinguishes voluntary, attestation-based commercial frameworks (self-selected control sets, auditor opinion) from mandatory federal frameworks (RMF's authorization boundary, ATO, system-specific ConMon obligations). Correctly frames CMMC as DoD's supply-chain enforcement mechanism specifically, not a general framework. Flags that SOC 2/ISO 27001 findings don't automatically satisfy an RMF control despite topical overlap -- continuing the precision-of-mapping thread from the IAM lab.", "keyArtifact": "None -- a synthesis/writing exercise, no external artifact.", "cursorPrompt": "Seed a lessons row for the GRC track, tier=1, lesson_type='conceptual', title='Core Framework Differences'. Populate its content field with the ticket text and grading rubric exactly as provided in this row (do not let the AI invent a different scenario). Grade the submission via RAG against a short internal rubric checking for the three distinctions above -- no external framework retrieval needed since this is a synthesis exercise, not a control-specific evaluation.", "source": "GRC Lesson Content"}$cl01$::jsonb,
  depends_on_lesson_id = CASE
    WHEN 'L01' = 'L03' THEN iam.id
    ELSE target.depends_on_lesson_id
  END
FROM grc
LEFT JOIN iam ON TRUE
WHERE target.track_id = grc.track_id
  AND target.title = 'Core Framework Differences';

INSERT INTO public.lessons (
  track_id, tier, lesson_type, sort_order, title, learning_objectives, dcwf_code, content, depends_on_lesson_id
)
SELECT
  grc.track_id,
  '1',
  'conceptual',
  1,
  'Core Framework Differences',
  $ol01$Distinguish voluntary/attestation-based commercial compliance from mandatory, prescriptive federal RMF obligations.$ol01$,
  '722',
  $cl01${"sheetId": "L01", "scenarioBrief": "You're the newest hire on Northwind Retail Technology's two-person security team. Your manager, Dana Wu, is onboarding a contractor who has worked exclusively in commercial SaaS and has never touched a federal engagement. She asks you to draft a one-page orientation memo explaining, in plain terms, how commercial compliance obligations (SOC 2, ISO 27001, NIST CSF 2.0, SEC materiality rules) differ from federal/DoD obligations (NIST SP 800-37 RMF, SP 800-53, SP 800-171, CMMC 2.0), so the contractor doesn't apply the wrong mental model to Northwind's upcoming DoD subcontract.", "gradingFocus": "Memo correctly distinguishes voluntary, attestation-based commercial frameworks (self-selected control sets, auditor opinion) from mandatory federal frameworks (RMF's authorization boundary, ATO, system-specific ConMon obligations). Correctly frames CMMC as DoD's supply-chain enforcement mechanism specifically, not a general framework. Flags that SOC 2/ISO 27001 findings don't automatically satisfy an RMF control despite topical overlap -- continuing the precision-of-mapping thread from the IAM lab.", "keyArtifact": "None -- a synthesis/writing exercise, no external artifact.", "cursorPrompt": "Seed a lessons row for the GRC track, tier=1, lesson_type='conceptual', title='Core Framework Differences'. Populate its content field with the ticket text and grading rubric exactly as provided in this row (do not let the AI invent a different scenario). Grade the submission via RAG against a short internal rubric checking for the three distinctions above -- no external framework retrieval needed since this is a synthesis exercise, not a control-specific evaluation.", "source": "GRC Lesson Content"}$cl01$::jsonb,
  CASE WHEN 'L01' = 'L03' THEN iam.id ELSE NULL END
FROM (SELECT id AS track_id FROM public.tracks WHERE slug = 'grc') AS grc
LEFT JOIN (
  SELECT l.id
  FROM public.lessons l
  WHERE l.track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
    AND l.title = 'Evidence Collection & Validation'
  LIMIT 1
) AS iam ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.lessons existing
  WHERE existing.track_id = grc.track_id
    AND existing.title = 'Core Framework Differences'
);


-- L02: Navigating NIST SP 800-53
WITH grc AS (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc'
),
iam AS (
  SELECT l.id
  FROM public.lessons l
  CROSS JOIN grc
  WHERE l.track_id = grc.track_id
    AND l.title = 'Evidence Collection & Validation'
  LIMIT 1
)
UPDATE public.lessons AS target
SET
  tier = '1',
  lesson_type = 'catalog_lab',
  sort_order = 2,
  learning_objectives = $ol02$Use the live control catalog to correctly scope a control family and avoid the AC-2/IA-5 confusion pattern from the IAM lab.$ol02$,
  dcwf_code = COALESCE(target.dcwf_code, '722'),
  content = $cl02${"sheetId": "L02", "scenarioBrief": "Dana pings you again: 'Procurement needs a shortlist of every control in the IA (Identification and Authentication) family before the next vendor call. And double-check -- are there any AC family controls that also touch authentication? I don't want us citing the wrong family again.'", "gradingFocus": "Correctly lists every IA-family control at the relevant baseline via the catalog browser, not memorization. Correctly excludes AC-2 from the list while correctly identifying any genuinely authentication-adjacent AC controls (e.g., AC-7, unsuccessful logon attempts) with an explanation of why they're adjacent but distinct from IA family.", "keyArtifact": "None -- uses the live control catalog browser (F21/PI feature), no external data needed.", "cursorPrompt": "Seed a lessons row, tier=1, lesson_type='catalog_lab', title='Navigating NIST SP 800-53'. Populate with this exact ticket text. Grading should verify the submitted control ID list against a live query of the pinned OSCAL catalog (deterministic family filter), not just RAG judgment -- this is a lookup-accuracy check first, narrative explanation second.", "source": "GRC Lesson Content"}$cl02$::jsonb,
  depends_on_lesson_id = CASE
    WHEN 'L02' = 'L03' THEN iam.id
    ELSE target.depends_on_lesson_id
  END
FROM grc
LEFT JOIN iam ON TRUE
WHERE target.track_id = grc.track_id
  AND target.title = 'Navigating NIST SP 800-53';

INSERT INTO public.lessons (
  track_id, tier, lesson_type, sort_order, title, learning_objectives, dcwf_code, content, depends_on_lesson_id
)
SELECT
  grc.track_id,
  '1',
  'catalog_lab',
  2,
  'Navigating NIST SP 800-53',
  $ol02$Use the live control catalog to correctly scope a control family and avoid the AC-2/IA-5 confusion pattern from the IAM lab.$ol02$,
  '722',
  $cl02${"sheetId": "L02", "scenarioBrief": "Dana pings you again: 'Procurement needs a shortlist of every control in the IA (Identification and Authentication) family before the next vendor call. And double-check -- are there any AC family controls that also touch authentication? I don't want us citing the wrong family again.'", "gradingFocus": "Correctly lists every IA-family control at the relevant baseline via the catalog browser, not memorization. Correctly excludes AC-2 from the list while correctly identifying any genuinely authentication-adjacent AC controls (e.g., AC-7, unsuccessful logon attempts) with an explanation of why they're adjacent but distinct from IA family.", "keyArtifact": "None -- uses the live control catalog browser (F21/PI feature), no external data needed.", "cursorPrompt": "Seed a lessons row, tier=1, lesson_type='catalog_lab', title='Navigating NIST SP 800-53'. Populate with this exact ticket text. Grading should verify the submitted control ID list against a live query of the pinned OSCAL catalog (deterministic family filter), not just RAG judgment -- this is a lookup-accuracy check first, narrative explanation second.", "source": "GRC Lesson Content"}$cl02$::jsonb,
  CASE WHEN 'L02' = 'L03' THEN iam.id ELSE NULL END
FROM (SELECT id AS track_id FROM public.tracks WHERE slug = 'grc') AS grc
LEFT JOIN (
  SELECT l.id
  FROM public.lessons l
  WHERE l.track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
    AND l.title = 'Evidence Collection & Validation'
  LIMIT 1
) AS iam ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.lessons existing
  WHERE existing.track_id = grc.track_id
    AND existing.title = 'Navigating NIST SP 800-53'
);


-- L03: Open-Source Tracking Workflows
WITH grc AS (
  SELECT id AS track_id FROM public.tracks WHERE slug = 'grc'
),
iam AS (
  SELECT l.id
  FROM public.lessons l
  CROSS JOIN grc
  WHERE l.track_id = grc.track_id
    AND l.title = 'Evidence Collection & Validation'
  LIMIT 1
)
UPDATE public.lessons AS target
SET
  tier = '1',
  lesson_type = 'tool_walkthrough',
  sort_order = 4,
  learning_objectives = $ol03$Translate a written finding into a properly-structured risk register entry that can actually be tracked to closure.$ol03$,
  dcwf_code = COALESCE(target.dcwf_code, '722'),
  content = $cl03${"sheetId": "L03", "scenarioBrief": "Your finding from the IAM Evidence Lab needs to actually live somewhere Dana can track it to closure, not just sit in a memo. Log it as a new risk entry in the team's SimpleRisk instance and submit a screenshot plus a short explanation of what you entered in each field and why.", "gradingFocus": "Correctly maps CCCER finding fields (Condition/Criteria/Cause/Effect/Recommendation) to SimpleRisk's risk register fields (likelihood, impact, category, owner). Explanation shows understanding of why each field matters for tracking to closure, not just confirmation it was filled in.", "keyArtifact": "The student's own prior IAM lab finding (pulled from their oscal_findings row) is the input.", "cursorPrompt": "Seed a lessons row, tier=1, lesson_type='tool_walkthrough', title='Open-Source Tracking Workflows', depends on the IAM lab lesson. Reuse the ToolWalkthroughLesson component (F23): screenshot upload plus reflection text. Grade via RAG checking the field-mapping explanation against the student's own prior finding, retrieved from their oscal_findings row, not a generic answer key.", "source": "GRC Lesson Content"}$cl03$::jsonb,
  depends_on_lesson_id = CASE
    WHEN 'L03' = 'L03' THEN iam.id
    ELSE target.depends_on_lesson_id
  END
FROM grc
LEFT JOIN iam ON TRUE
WHERE target.track_id = grc.track_id
  AND target.title = 'Open-Source Tracking Workflows';

INSERT INTO public.lessons (
  track_id, tier, lesson_type, sort_order, title, learning_objectives, dcwf_code, content, depends_on_lesson_id
)
SELECT
  grc.track_id,
  '1',
  'tool_walkthrough',
  4,
  'Open-Source Tracking Workflows',
  $ol03$Translate a written finding into a properly-structured risk register entry that can actually be tracked to closure.$ol03$,
  '722',
  $cl03${"sheetId": "L03", "scenarioBrief": "Your finding from the IAM Evidence Lab needs to actually live somewhere Dana can track it to closure, not just sit in a memo. Log it as a new risk entry in the team's SimpleRisk instance and submit a screenshot plus a short explanation of what you entered in each field and why.", "gradingFocus": "Correctly maps CCCER finding fields (Condition/Criteria/Cause/Effect/Recommendation) to SimpleRisk's risk register fields (likelihood, impact, category, owner). Explanation shows understanding of why each field matters for tracking to closure, not just confirmation it was filled in.", "keyArtifact": "The student's own prior IAM lab finding (pulled from their oscal_findings row) is the input.", "cursorPrompt": "Seed a lessons row, tier=1, lesson_type='tool_walkthrough', title='Open-Source Tracking Workflows', depends on the IAM lab lesson. Reuse the ToolWalkthroughLesson component (F23): screenshot upload plus reflection text. Grade via RAG checking the field-mapping explanation against the student's own prior finding, retrieved from their oscal_findings row, not a generic answer key.", "source": "GRC Lesson Content"}$cl03$::jsonb,
  CASE WHEN 'L03' = 'L03' THEN iam.id ELSE NULL END
FROM (SELECT id AS track_id FROM public.tracks WHERE slug = 'grc') AS grc
LEFT JOIN (
  SELECT l.id
  FROM public.lessons l
  WHERE l.track_id = (SELECT id FROM public.tracks WHERE slug = 'grc')
    AND l.title = 'Evidence Collection & Validation'
  LIMIT 1
) AS iam ON TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.lessons existing
  WHERE existing.track_id = grc.track_id
    AND existing.title = 'Open-Source Tracking Workflows'
);


-- GRC-01: Cross-framework control mapping matrix (control_mapping)
UPDATE public.tickets AS t
SET
  scenario_brief = $sgrc01$Northwind's new enterprise customer wants written assurance that Northwind's existing SOC 2 report also covers their upcoming ISO 27001 certification needs, and separately, procurement wants to know which 800-53 controls a specific SOC 2 CC6.1 test already partially evidences. Given control ID AC-2, identify its equivalent(s) in SOC 2 (Trust Services Criteria) and ISO 27001:2022 Annex A, and explain where the mappings are strong versus where they only partially overlap.$sgrc01$,
  tier = 2,
  sort_order = 27,
  initial_state = COALESCE(t.initial_state, '{}'::jsonb) || $mgrc01${"sheetId": "GRC-01", "ticketCode": "GRC-01", "title": "Cross-framework control mapping matrix", "prompt": "Northwind's new enterprise customer wants written assurance that Northwind's existing SOC 2 report also covers their upcoming ISO 27001 certification needs, and separately, procurement wants to know which 800-53 controls a specific SOC 2 CC6.1 test already partially evidences. Given control ID AC-2, identify its equivalent(s) in SOC 2 (Trust Services Criteria) and ISO 27001:2022 Annex A, and explain where the mappings are strong versus where they only partially overlap.", "scenarioBrief": "Northwind's new enterprise customer wants written assurance that Northwind's existing SOC 2 report also covers their upcoming ISO 27001 certification needs, and separately, procurement wants to know which 800-53 controls a specific SOC 2 CC6.1 test already partially evidences. Given control ID AC-2, identify its equivalent(s) in SOC 2 (Trust Services Criteria) and ISO 27001:2022 Annex A, and explain where the mappings are strong versus where they only partially overlap.", "keyArtifact": "The pre-seeded control_mappings reference table (a public NIST/SOC2/ISO crosswalk dataset).", "learningObjective": "Map a single NIST 800-53 control to its SOC 2 and ISO 27001 equivalents and correctly characterize partial overlap.", "source_framework": "nist_800_53", "source_control_id": "AC-2", "source_label": "NIST SP 800-53 Rev. 5 — AC-2 Account Management", "targets": [{"framework": "soc2", "label": "SOC 2 Trust Services Criteria", "options": ["CC6.1", "CC6.2", "CC6.3", "CC7.1", "A1.2"]}, {"framework": "iso27001", "label": "ISO/IEC 27001:2022 Annex A", "options": ["A.5.15", "A.5.16", "A.5.18", "A.5.7", "A.8.9"]}]}$mgrc01$::jsonb,
  expected_state = COALESCE(t.expected_state, '{}'::jsonb) || $egrc01${"gradingFocus": "Deterministic check against the seeded mapping table for correct target control IDs. RAG-graded narrative for whether the partial-overlap explanation is substantively correct (e.g., correctly notes SOC 2 CC6.1 doesn't test account review cadence the way AC-2 requires).", "sheetId": "GRC-01", "learningObjective": "Map a single NIST 800-53 control to its SOC 2 and ISO 27001 equivalents and correctly characterize partial overlap.", "scoringMode": "options_set_match", "passThresholdPercent": 100, "gradeOverlapNarrative": true, "minOverlapNarrativeLength": 120}$egrc01$::jsonb,
  dcwf_code = COALESCE(t.dcwf_code, '722')
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type = 'control_mapping'
  AND t.tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  );

INSERT INTO public.tickets (
  tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes,
  scenario_brief, initial_state, expected_state, dcwf_code, sort_order
)
SELECT
  st.id,
  grc.track_id,
  2,
  'control_mapping',
  'medium',
  45,
  $sgrc01$Northwind's new enterprise customer wants written assurance that Northwind's existing SOC 2 report also covers their upcoming ISO 27001 certification needs, and separately, procurement wants to know which 800-53 controls a specific SOC 2 CC6.1 test already partially evidences. Given control ID AC-2, identify its equivalent(s) in SOC 2 (Trust Services Criteria) and ISO 27001:2022 Annex A, and explain where the mappings are strong versus where they only partially overlap.$sgrc01$,
  $mgrc01${"sheetId": "GRC-01", "ticketCode": "GRC-01", "title": "Cross-framework control mapping matrix", "prompt": "Northwind's new enterprise customer wants written assurance that Northwind's existing SOC 2 report also covers their upcoming ISO 27001 certification needs, and separately, procurement wants to know which 800-53 controls a specific SOC 2 CC6.1 test already partially evidences. Given control ID AC-2, identify its equivalent(s) in SOC 2 (Trust Services Criteria) and ISO 27001:2022 Annex A, and explain where the mappings are strong versus where they only partially overlap.", "scenarioBrief": "Northwind's new enterprise customer wants written assurance that Northwind's existing SOC 2 report also covers their upcoming ISO 27001 certification needs, and separately, procurement wants to know which 800-53 controls a specific SOC 2 CC6.1 test already partially evidences. Given control ID AC-2, identify its equivalent(s) in SOC 2 (Trust Services Criteria) and ISO 27001:2022 Annex A, and explain where the mappings are strong versus where they only partially overlap.", "keyArtifact": "The pre-seeded control_mappings reference table (a public NIST/SOC2/ISO crosswalk dataset).", "learningObjective": "Map a single NIST 800-53 control to its SOC 2 and ISO 27001 equivalents and correctly characterize partial overlap.", "source_framework": "nist_800_53", "source_control_id": "AC-2", "source_label": "NIST SP 800-53 Rev. 5 — AC-2 Account Management", "targets": [{"framework": "soc2", "label": "SOC 2 Trust Services Criteria", "options": ["CC6.1", "CC6.2", "CC6.3", "CC7.1", "A1.2"]}, {"framework": "iso27001", "label": "ISO/IEC 27001:2022 Annex A", "options": ["A.5.15", "A.5.16", "A.5.18", "A.5.7", "A.8.9"]}]}$mgrc01$::jsonb,
  $egrc01${"gradingFocus": "Deterministic check against the seeded mapping table for correct target control IDs. RAG-graded narrative for whether the partial-overlap explanation is substantively correct (e.g., correctly notes SOC 2 CC6.1 doesn't test account review cadence the way AC-2 requires).", "sheetId": "GRC-01", "learningObjective": "Map a single NIST 800-53 control to its SOC 2 and ISO 27001 equivalents and correctly characterize partial overlap.", "scoringMode": "options_set_match", "passThresholdPercent": 100, "gradeOverlapNarrative": true, "minOverlapNarrativeLength": 120}$egrc01$::jsonb,
  '722',
  27
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
    AND existing.ticket_type = 'control_mapping'
);


-- GRC-02: SP 800-30 risk assessment via SimpleRisk (tool_walkthrough)
UPDATE public.tickets AS t
SET
  scenario_brief = $sgrc02$Northwind is onboarding a new SaaS vendor that will have API access to customer PII. Conduct a risk assessment using SP 800-30 methodology: identify at least two threat sources, estimate likelihood and impact using 800-30's qualitative scale, and log the resulting risk in SimpleRisk with a documented rationale.$sgrc02$,
  tier = 2,
  sort_order = 20,
  initial_state = COALESCE(t.initial_state, '{}'::jsonb) || $mgrc02${"sheetId": "GRC-02", "ticketCode": "GRC-02", "title": "SP 800-30 risk assessment via SimpleRisk", "prompt": "Northwind is onboarding a new SaaS vendor that will have API access to customer PII. Conduct a risk assessment using SP 800-30 methodology: identify at least two threat sources, estimate likelihood and impact using 800-30's qualitative scale, and log the resulting risk in SimpleRisk with a documented rationale.", "scenarioBrief": "Northwind is onboarding a new SaaS vendor that will have API access to customer PII. Conduct a risk assessment using SP 800-30 methodology: identify at least two threat sources, estimate likelihood and impact using 800-30's qualitative scale, and log the resulting risk in SimpleRisk with a documented rationale.", "keyArtifact": "A vendor profile (data types accessed, integration method, vendor's stated security posture) provided as scenario data.", "learningObjective": "Apply SP 800-30 threat/likelihood/impact methodology to a real vendor scenario and log the result properly.", "vendorProfile": {"name": "Northwind SaaS Vendor (fictional)", "dataTypes": ["customer PII"], "integration": "REST API with OAuth", "vendorPosture": "SOC 2 Type I only, no penetration test history"}, "toolUrl": "https://www.simplerisk.com/"}$mgrc02$::jsonb,
  expected_state = COALESCE(t.expected_state, '{}'::jsonb) || $egrc02${"gradingFocus": "RAG-graded against live SP 800-30 guidance retrieved at grading time (not model memory) for correct threat/vulnerability/likelihood/impact reasoning. Deterministic check that a SimpleRisk entry ID was actually submitted.", "sheetId": "GRC-02", "learningObjective": "Apply SP 800-30 threat/likelihood/impact methodology to a real vendor scenario and log the result properly."}$egrc02$::jsonb,
  dcwf_code = COALESCE(t.dcwf_code, '722')
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type = 'tool_walkthrough'
  AND t.tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  );

INSERT INTO public.tickets (
  tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes,
  scenario_brief, initial_state, expected_state, dcwf_code, sort_order
)
SELECT
  st.id,
  grc.track_id,
  2,
  'tool_walkthrough',
  'medium',
  45,
  $sgrc02$Northwind is onboarding a new SaaS vendor that will have API access to customer PII. Conduct a risk assessment using SP 800-30 methodology: identify at least two threat sources, estimate likelihood and impact using 800-30's qualitative scale, and log the resulting risk in SimpleRisk with a documented rationale.$sgrc02$,
  $mgrc02${"sheetId": "GRC-02", "ticketCode": "GRC-02", "title": "SP 800-30 risk assessment via SimpleRisk", "prompt": "Northwind is onboarding a new SaaS vendor that will have API access to customer PII. Conduct a risk assessment using SP 800-30 methodology: identify at least two threat sources, estimate likelihood and impact using 800-30's qualitative scale, and log the resulting risk in SimpleRisk with a documented rationale.", "scenarioBrief": "Northwind is onboarding a new SaaS vendor that will have API access to customer PII. Conduct a risk assessment using SP 800-30 methodology: identify at least two threat sources, estimate likelihood and impact using 800-30's qualitative scale, and log the resulting risk in SimpleRisk with a documented rationale.", "keyArtifact": "A vendor profile (data types accessed, integration method, vendor's stated security posture) provided as scenario data.", "learningObjective": "Apply SP 800-30 threat/likelihood/impact methodology to a real vendor scenario and log the result properly.", "vendorProfile": {"name": "Northwind SaaS Vendor (fictional)", "dataTypes": ["customer PII"], "integration": "REST API with OAuth", "vendorPosture": "SOC 2 Type I only, no penetration test history"}, "toolUrl": "https://www.simplerisk.com/"}$mgrc02$::jsonb,
  $egrc02${"gradingFocus": "RAG-graded against live SP 800-30 guidance retrieved at grading time (not model memory) for correct threat/vulnerability/likelihood/impact reasoning. Deterministic check that a SimpleRisk entry ID was actually submitted.", "sheetId": "GRC-02", "learningObjective": "Apply SP 800-30 threat/likelihood/impact methodology to a real vendor scenario and log the result properly."}$egrc02$::jsonb,
  '722',
  20
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
    AND existing.ticket_type = 'tool_walkthrough'
);


-- GRC-03: SSP component writer (800-171 Rev 3) (oscal_ssp)
UPDATE public.tickets AS t
SET
  scenario_brief = $sgrc03$Northwind's DoD subcontract requires a System Security Plan for the enclave handling CUI. Complete the SSP components for two 800-171 Rev 3 requirements related to access control, using the provided system description.$sgrc03$,
  tier = 2,
  sort_order = 22,
  initial_state = COALESCE(t.initial_state, '{}'::jsonb) || $mgrc03${"sheetId": "GRC-03", "ticketCode": "GRC-03", "title": "SSP component writer (800-171 Rev 3)", "framework": "nist_sp_800_171_rev3", "systemName": "Northwind CUI Enclave", "sspTitle": "Northwind CUI Enclave — NIST SP 800-171 Rev 3 SSP fragment (03.01.01, 03.01.02)", "systemDescription": "Northwind CUI enclave for the DoD subcontract. Enclave boundary: isolated VPC. User population: 12 engineers, 3 admins. Existing controls: SSO with MFA; quarterly access review.", "authorizationBoundary": "Isolated VPC enclave that processes, stores, and transmits CUI for Northwind's DoD subcontract.", "prompt": "Northwind's DoD subcontract requires a System Security Plan for the enclave handling CUI. Complete the SSP components for two 800-171 Rev 3 requirements related to access control, using the provided system description.", "scenarioBrief": "Northwind's DoD subcontract requires a System Security Plan for the enclave handling CUI. Complete the SSP components for two 800-171 Rev 3 requirements related to access control, using the provided system description.", "keyArtifact": "A short fictional system description: enclave boundary (isolated VPC), user population (12 engineers, 3 admins), existing controls (SSO with MFA, quarterly access review).", "learningObjective": "Write SSP implementation statements for two related 800-171 Rev 3 access control requirements given a concrete system.", "requirements": [{"id": "03.01.01", "oscalControlId": "r03.01.01", "family": "Access Control", "title": "Account Management", "statement": "Define and document the types of system accounts required for the system and manage system accounts, including establishing, activating, modifying, disabling, and removing accounts."}, {"id": "03.01.02", "oscalControlId": "r03.01.02", "family": "Access Control", "title": "Access Enforcement", "statement": "Enforce approved authorizations for logical access to CUI in accordance with applicable access control policies."}]}$mgrc03$::jsonb,
  expected_state = COALESCE(t.expected_state, '{}'::jsonb) || $egrc03${"gradingFocus": "Generated OSCAL SSP fragment validates against schema (deterministic). Implementation narratives are RAG-graded against the live 800-171 Rev 3 requirement text for the two requirements in scope.", "sheetId": "GRC-03", "learningObjective": "Write SSP implementation statements for two related 800-171 Rev 3 access control requirements given a concrete system."}$egrc03$::jsonb,
  dcwf_code = COALESCE(t.dcwf_code, '612')
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type = 'oscal_ssp'
  AND t.tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  );

INSERT INTO public.tickets (
  tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes,
  scenario_brief, initial_state, expected_state, dcwf_code, sort_order
)
SELECT
  st.id,
  grc.track_id,
  2,
  'oscal_ssp',
  'medium',
  60,
  $sgrc03$Northwind's DoD subcontract requires a System Security Plan for the enclave handling CUI. Complete the SSP components for two 800-171 Rev 3 requirements related to access control, using the provided system description.$sgrc03$,
  $mgrc03${"sheetId": "GRC-03", "ticketCode": "GRC-03", "title": "SSP component writer (800-171 Rev 3)", "framework": "nist_sp_800_171_rev3", "systemName": "Northwind CUI Enclave", "sspTitle": "Northwind CUI Enclave — NIST SP 800-171 Rev 3 SSP fragment (03.01.01, 03.01.02)", "systemDescription": "Northwind CUI enclave for the DoD subcontract. Enclave boundary: isolated VPC. User population: 12 engineers, 3 admins. Existing controls: SSO with MFA; quarterly access review.", "authorizationBoundary": "Isolated VPC enclave that processes, stores, and transmits CUI for Northwind's DoD subcontract.", "prompt": "Northwind's DoD subcontract requires a System Security Plan for the enclave handling CUI. Complete the SSP components for two 800-171 Rev 3 requirements related to access control, using the provided system description.", "scenarioBrief": "Northwind's DoD subcontract requires a System Security Plan for the enclave handling CUI. Complete the SSP components for two 800-171 Rev 3 requirements related to access control, using the provided system description.", "keyArtifact": "A short fictional system description: enclave boundary (isolated VPC), user population (12 engineers, 3 admins), existing controls (SSO with MFA, quarterly access review).", "learningObjective": "Write SSP implementation statements for two related 800-171 Rev 3 access control requirements given a concrete system.", "requirements": [{"id": "03.01.01", "oscalControlId": "r03.01.01", "family": "Access Control", "title": "Account Management", "statement": "Define and document the types of system accounts required for the system and manage system accounts, including establishing, activating, modifying, disabling, and removing accounts."}, {"id": "03.01.02", "oscalControlId": "r03.01.02", "family": "Access Control", "title": "Access Enforcement", "statement": "Enforce approved authorizations for logical access to CUI in accordance with applicable access control policies."}]}$mgrc03$::jsonb,
  $egrc03${"gradingFocus": "Generated OSCAL SSP fragment validates against schema (deterministic). Implementation narratives are RAG-graded against the live 800-171 Rev 3 requirement text for the two requirements in scope.", "sheetId": "GRC-03", "learningObjective": "Write SSP implementation statements for two related 800-171 Rev 3 access control requirements given a concrete system."}$egrc03$::jsonb,
  '612',
  22
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
    AND existing.ticket_type = 'oscal_ssp'
);


-- GRC-04: POA&M management (poam)
UPDATE public.tickets AS t
SET
  scenario_brief = $sgrc04$Two findings from your prior work -- the IAM lab's weak password policy finding, and the AC-2/IA-5 mapping correction from Navigating NIST SP 800-53 -- need formal POA&M entries before the next ConMon review. Draft both entries with realistic remediation milestones.$sgrc04$,
  tier = 2,
  sort_order = 25,
  initial_state = COALESCE(t.initial_state, '{}'::jsonb) || $mgrc04${"sheetId": "GRC-04", "ticketCode": "GRC-04", "title": "POA&M management", "prompt": "Two findings from your prior work -- the IAM lab's weak password policy finding, and the AC-2/IA-5 mapping correction from Navigating NIST SP 800-53 -- need formal POA&M entries before the next ConMon review. Draft both entries with realistic remediation milestones.", "scenarioBrief": "Two findings from your prior work -- the IAM lab's weak password policy finding, and the AC-2/IA-5 mapping correction from Navigating NIST SP 800-53 -- need formal POA&M entries before the next ConMon review. Draft both entries with realistic remediation milestones.", "keyArtifact": "The student's own two prior findings, pulled from their history.", "learningObjective": "Draft two POA&M entries from findings the student already produced, with realistic remediation milestones."}$mgrc04$::jsonb,
  expected_state = COALESCE(t.expected_state, '{}'::jsonb) || $egrc04${"gradingFocus": "Deterministic completeness check (all POA&M fields present). RAG-graded for whether the remediation milestone/date is realistic given the finding's severity.", "sheetId": "GRC-04", "learningObjective": "Draft two POA&M entries from findings the student already produced, with realistic remediation milestones."}$egrc04$::jsonb,
  dcwf_code = COALESCE(t.dcwf_code, '612')
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type = 'poam'
  AND t.tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  );

INSERT INTO public.tickets (
  tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes,
  scenario_brief, initial_state, expected_state, dcwf_code, sort_order
)
SELECT
  st.id,
  grc.track_id,
  2,
  'poam',
  'medium',
  45,
  $sgrc04$Two findings from your prior work -- the IAM lab's weak password policy finding, and the AC-2/IA-5 mapping correction from Navigating NIST SP 800-53 -- need formal POA&M entries before the next ConMon review. Draft both entries with realistic remediation milestones.$sgrc04$,
  $mgrc04${"sheetId": "GRC-04", "ticketCode": "GRC-04", "title": "POA&M management", "prompt": "Two findings from your prior work -- the IAM lab's weak password policy finding, and the AC-2/IA-5 mapping correction from Navigating NIST SP 800-53 -- need formal POA&M entries before the next ConMon review. Draft both entries with realistic remediation milestones.", "scenarioBrief": "Two findings from your prior work -- the IAM lab's weak password policy finding, and the AC-2/IA-5 mapping correction from Navigating NIST SP 800-53 -- need formal POA&M entries before the next ConMon review. Draft both entries with realistic remediation milestones.", "keyArtifact": "The student's own two prior findings, pulled from their history.", "learningObjective": "Draft two POA&M entries from findings the student already produced, with realistic remediation milestones."}$mgrc04$::jsonb,
  $egrc04${"gradingFocus": "Deterministic completeness check (all POA&M fields present). RAG-graded for whether the remediation milestone/date is realistic given the finding's severity.", "sheetId": "GRC-04", "learningObjective": "Draft two POA&M entries from findings the student already produced, with realistic remediation milestones."}$egrc04$::jsonb,
  '612',
  25
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
    AND existing.ticket_type = 'poam'
);


-- GRC-05: SP 800-53A assessment procedure lab (assessment_procedures)
UPDATE public.tickets AS t
SET
  scenario_brief = $sgrc05$Before the SOC 2 auditor's fieldwork begins, draft the assessment procedures your team will use to test control IA-5(1) yourselves, structured as Examine / Interview / Test, so you're not walking into the audit blind.$sgrc05$,
  tier = 2,
  sort_order = 26,
  initial_state = COALESCE(t.initial_state, '{}'::jsonb) || $mgrc05${"sheetId": "GRC-05", "ticketCode": "GRC-05", "title": "SP 800-53A assessment procedure lab", "prompt": "Before the SOC 2 auditor's fieldwork begins, draft the assessment procedures your team will use to test control IA-5(1) yourselves, structured as Examine / Interview / Test, so you're not walking into the audit blind.", "scenarioBrief": "Before the SOC 2 auditor's fieldwork begins, draft the assessment procedures your team will use to test control IA-5(1) yourselves, structured as Examine / Interview / Test, so you're not walking into the audit blind.", "keyArtifact": "None -- control_id given, live SP 800-53A text retrieved at grading time.", "learningObjective": "Write Examine/Interview/Test assessment procedures for IA-5(1) before the SOC 2 auditor's fieldwork begins.", "control_id": "ia-5.1", "controlId": "ia-5.1"}$mgrc05$::jsonb,
  expected_state = COALESCE(t.expected_state, '{}'::jsonb) || $egrc05${"gradingFocus": "RAG-graded against live SP 800-53A assessment objective text for IA-5(1) -- does the procedure actually test what the objective requires, using all three methods appropriately, not just restate the control statement.", "sheetId": "GRC-05", "learningObjective": "Write Examine/Interview/Test assessment procedures for IA-5(1) before the SOC 2 auditor's fieldwork begins.", "control_id": "ia-5.1", "controlId": "ia-5.1", "minFieldLength": 40}$egrc05$::jsonb,
  dcwf_code = COALESCE(t.dcwf_code, '612')
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type = 'assessment_procedures'
  AND t.tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  );

INSERT INTO public.tickets (
  tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes,
  scenario_brief, initial_state, expected_state, dcwf_code, sort_order
)
SELECT
  st.id,
  grc.track_id,
  2,
  'assessment_procedures',
  'medium',
  45,
  $sgrc05$Before the SOC 2 auditor's fieldwork begins, draft the assessment procedures your team will use to test control IA-5(1) yourselves, structured as Examine / Interview / Test, so you're not walking into the audit blind.$sgrc05$,
  $mgrc05${"sheetId": "GRC-05", "ticketCode": "GRC-05", "title": "SP 800-53A assessment procedure lab", "prompt": "Before the SOC 2 auditor's fieldwork begins, draft the assessment procedures your team will use to test control IA-5(1) yourselves, structured as Examine / Interview / Test, so you're not walking into the audit blind.", "scenarioBrief": "Before the SOC 2 auditor's fieldwork begins, draft the assessment procedures your team will use to test control IA-5(1) yourselves, structured as Examine / Interview / Test, so you're not walking into the audit blind.", "keyArtifact": "None -- control_id given, live SP 800-53A text retrieved at grading time.", "learningObjective": "Write Examine/Interview/Test assessment procedures for IA-5(1) before the SOC 2 auditor's fieldwork begins.", "control_id": "ia-5.1", "controlId": "ia-5.1"}$mgrc05$::jsonb,
  $egrc05${"gradingFocus": "RAG-graded against live SP 800-53A assessment objective text for IA-5(1) -- does the procedure actually test what the objective requires, using all three methods appropriately, not just restate the control statement.", "sheetId": "GRC-05", "learningObjective": "Write Examine/Interview/Test assessment procedures for IA-5(1) before the SOC 2 auditor's fieldwork begins.", "control_id": "ia-5.1", "controlId": "ia-5.1", "minFieldLength": 40}$egrc05$::jsonb,
  '612',
  26
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
    AND existing.ticket_type = 'assessment_procedures'
);


-- GRC-06: Continuous monitoring (ConMon) strategy (conmon_strategy)
UPDATE public.tickets AS t
SET
  scenario_brief = $sgrc06$Northwind's DoD subcontract is now active. Draft the ConMon strategy memo for the CUI enclave: monitoring cadence per control family, which free/open-source tools (DefectDojo, CloudSploit, Scuba) cover which families, and the escalation/reporting cadence to the ISSM.$sgrc06$,
  tier = 3,
  sort_order = 30,
  initial_state = COALESCE(t.initial_state, '{}'::jsonb) || $mgrc06${"sheetId": "GRC-06", "ticketCode": "GRC-06", "title": "Continuous monitoring (ConMon) strategy", "prompt": "Northwind's DoD subcontract is now active. Draft the ConMon strategy memo for the CUI enclave: monitoring cadence per control family, which free/open-source tools (DefectDojo, CloudSploit, Scuba) cover which families, and the escalation/reporting cadence to the ISSM.", "scenarioBrief": "Northwind's DoD subcontract is now active. Draft the ConMon strategy memo for the CUI enclave: monitoring cadence per control family, which free/open-source tools (DefectDojo, CloudSploit, Scuba) cover which families, and the escalation/reporting cadence to the ISSM.", "keyArtifact": "The system profile from GRC-03, reused for continuity across the track.", "learningObjective": "Draft a risk-appropriate ConMon strategy referencing free/open-source tooling coverage per control family."}$mgrc06$::jsonb,
  expected_state = COALESCE(t.expected_state, '{}'::jsonb) || $egrc06${"gradingFocus": "RAG-graded against SP 800-137 ConMon guidance. Checks cadence is risk-appropriate to the system's categorization, not a one-size-fits-all schedule.", "sheetId": "GRC-06", "learningObjective": "Draft a risk-appropriate ConMon strategy referencing free/open-source tooling coverage per control family."}$egrc06$::jsonb,
  dcwf_code = COALESCE(t.dcwf_code, '722')
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type = 'conmon_strategy'
  AND t.tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  );

INSERT INTO public.tickets (
  tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes,
  scenario_brief, initial_state, expected_state, dcwf_code, sort_order
)
SELECT
  st.id,
  grc.track_id,
  3,
  'conmon_strategy',
  'hard',
  60,
  $sgrc06$Northwind's DoD subcontract is now active. Draft the ConMon strategy memo for the CUI enclave: monitoring cadence per control family, which free/open-source tools (DefectDojo, CloudSploit, Scuba) cover which families, and the escalation/reporting cadence to the ISSM.$sgrc06$,
  $mgrc06${"sheetId": "GRC-06", "ticketCode": "GRC-06", "title": "Continuous monitoring (ConMon) strategy", "prompt": "Northwind's DoD subcontract is now active. Draft the ConMon strategy memo for the CUI enclave: monitoring cadence per control family, which free/open-source tools (DefectDojo, CloudSploit, Scuba) cover which families, and the escalation/reporting cadence to the ISSM.", "scenarioBrief": "Northwind's DoD subcontract is now active. Draft the ConMon strategy memo for the CUI enclave: monitoring cadence per control family, which free/open-source tools (DefectDojo, CloudSploit, Scuba) cover which families, and the escalation/reporting cadence to the ISSM.", "keyArtifact": "The system profile from GRC-03, reused for continuity across the track.", "learningObjective": "Draft a risk-appropriate ConMon strategy referencing free/open-source tooling coverage per control family."}$mgrc06$::jsonb,
  $egrc06${"gradingFocus": "RAG-graded against SP 800-137 ConMon guidance. Checks cadence is risk-appropriate to the system's categorization, not a one-size-fits-all schedule.", "sheetId": "GRC-06", "learningObjective": "Draft a risk-appropriate ConMon strategy referencing free/open-source tooling coverage per control family."}$egrc06$::jsonb,
  '722',
  30
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
    AND existing.ticket_type = 'conmon_strategy'
);


-- GRC-07: CMMC 2.0 maturity self-assessment (cmmc_gap_analysis)
UPDATE public.tickets AS t
SET
  scenario_brief = $sgrc07$Northwind's contracts team needs a CMMC Level 2 readiness estimate before the next contract renewal. Score Northwind's current control implementation summary against a subset of CMMC 2.0 Level 2 practices and produce a gap summary with an overall readiness percentage.$sgrc07$,
  tier = 3,
  sort_order = 32,
  initial_state = COALESCE(t.initial_state, '{}'::jsonb) || $mgrc07${"sheetId": "GRC-07", "ticketCode": "GRC-07", "title": "CMMC 2.0 maturity self-assessment", "prompt": "Northwind's contracts team needs a CMMC Level 2 readiness estimate before the next contract renewal. Score Northwind's current control implementation summary against a subset of CMMC 2.0 Level 2 practices and produce a gap summary with an overall readiness percentage.", "scenarioBrief": "Northwind's contracts team needs a CMMC Level 2 readiness estimate before the next contract renewal. Score Northwind's current control implementation summary against a subset of CMMC 2.0 Level 2 practices and produce a gap summary with an overall readiness percentage.", "keyArtifact": "A fictional company's control implementation summary (8-10 practices, some satisfied, some not, some partially).", "learningObjective": "Score a fictional company against CMMC 2.0 Level 2 practices and produce a gap summary with a readiness percentage."}$mgrc07$::jsonb,
  expected_state = COALESCE(t.expected_state, '{}'::jsonb) || $egrc07${"gradingFocus": "RAG-graded gap analysis against pinned CMMC 2.0 practice descriptions -- checks the readiness percentage is derived from the actual gap count, not asserted.", "sheetId": "GRC-07", "learningObjective": "Score a fictional company against CMMC 2.0 Level 2 practices and produce a gap summary with a readiness percentage."}$egrc07$::jsonb,
  dcwf_code = COALESCE(t.dcwf_code, '722')
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type = 'cmmc_gap_analysis'
  AND t.tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  );

INSERT INTO public.tickets (
  tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes,
  scenario_brief, initial_state, expected_state, dcwf_code, sort_order
)
SELECT
  st.id,
  grc.track_id,
  3,
  'cmmc_gap_analysis',
  'hard',
  60,
  $sgrc07$Northwind's contracts team needs a CMMC Level 2 readiness estimate before the next contract renewal. Score Northwind's current control implementation summary against a subset of CMMC 2.0 Level 2 practices and produce a gap summary with an overall readiness percentage.$sgrc07$,
  $mgrc07${"sheetId": "GRC-07", "ticketCode": "GRC-07", "title": "CMMC 2.0 maturity self-assessment", "prompt": "Northwind's contracts team needs a CMMC Level 2 readiness estimate before the next contract renewal. Score Northwind's current control implementation summary against a subset of CMMC 2.0 Level 2 practices and produce a gap summary with an overall readiness percentage.", "scenarioBrief": "Northwind's contracts team needs a CMMC Level 2 readiness estimate before the next contract renewal. Score Northwind's current control implementation summary against a subset of CMMC 2.0 Level 2 practices and produce a gap summary with an overall readiness percentage.", "keyArtifact": "A fictional company's control implementation summary (8-10 practices, some satisfied, some not, some partially).", "learningObjective": "Score a fictional company against CMMC 2.0 Level 2 practices and produce a gap summary with a readiness percentage."}$mgrc07$::jsonb,
  $egrc07${"gradingFocus": "RAG-graded gap analysis against pinned CMMC 2.0 practice descriptions -- checks the readiness percentage is derived from the actual gap count, not asserted.", "sheetId": "GRC-07", "learningObjective": "Score a fictional company against CMMC 2.0 Level 2 practices and produce a gap summary with a readiness percentage."}$egrc07$::jsonb,
  '722',
  32
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
    AND existing.ticket_type = 'cmmc_gap_analysis'
);


-- GRC-08: SEC materiality incident-reporting simulation (sec_materiality)
UPDATE public.tickets AS t
SET
  scenario_brief = $sgrc08$A vendor Northwind uses for payment processing just disclosed a breach that exposed a subset of Northwind's customer records. As the person drafting the initial materiality assessment, determine whether this triggers the SEC's 4-business-day 8-K disclosure requirement and draft the determination memo.$sgrc08$,
  tier = 3,
  sort_order = 31,
  initial_state = COALESCE(t.initial_state, '{}'::jsonb) || $mgrc08${"sheetId": "GRC-08", "ticketCode": "GRC-08", "title": "SEC materiality incident-reporting simulation", "prompt": "A vendor Northwind uses for payment processing just disclosed a breach that exposed a subset of Northwind's customer records. As the person drafting the initial materiality assessment, determine whether this triggers the SEC's 4-business-day 8-K disclosure requirement and draft the determination memo.", "scenarioBrief": "A vendor Northwind uses for payment processing just disclosed a breach that exposed a subset of Northwind's customer records. As the person drafting the initial materiality assessment, determine whether this triggers the SEC's 4-business-day 8-K disclosure requirement and draft the determination memo.", "keyArtifact": "Breach scenario details: systems affected (payment vendor's own systems, not Northwind's), data exposed (names, emails, last-4 card digits), estimated customers impacted (~4,000), vendor's remediation status (contained, forensics ongoing).", "learningObjective": "Determine whether a vendor breach triggers the SEC's 8-K materiality disclosure requirement and draft the memo.", "companyName": "Northwind Retail Technology", "breachScenario": "A vendor Northwind uses for payment processing just disclosed a breach that exposed a subset of Northwind's customer records. As the person drafting the initial materiality assessment, determine whether this triggers the SEC's 4-business-day 8-K disclosure requirement and draft the determination memo."}$mgrc08$::jsonb,
  expected_state = COALESCE(t.expected_state, '{}'::jsonb) || $egrc08${"gradingFocus": "RAG-graded against the SEC cybersecurity disclosure rule's materiality factors -- does the memo address each factor (financial impact, reputational impact, operational impact, legal/regulatory exposure), not just assert a conclusion.", "sheetId": "GRC-08", "learningObjective": "Determine whether a vendor breach triggers the SEC's 8-K materiality disclosure requirement and draft the memo."}$egrc08$::jsonb,
  dcwf_code = COALESCE(t.dcwf_code, '722')
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type = 'sec_materiality'
  AND t.tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  );

INSERT INTO public.tickets (
  tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes,
  scenario_brief, initial_state, expected_state, dcwf_code, sort_order
)
SELECT
  st.id,
  grc.track_id,
  3,
  'sec_materiality',
  'hard',
  45,
  $sgrc08$A vendor Northwind uses for payment processing just disclosed a breach that exposed a subset of Northwind's customer records. As the person drafting the initial materiality assessment, determine whether this triggers the SEC's 4-business-day 8-K disclosure requirement and draft the determination memo.$sgrc08$,
  $mgrc08${"sheetId": "GRC-08", "ticketCode": "GRC-08", "title": "SEC materiality incident-reporting simulation", "prompt": "A vendor Northwind uses for payment processing just disclosed a breach that exposed a subset of Northwind's customer records. As the person drafting the initial materiality assessment, determine whether this triggers the SEC's 4-business-day 8-K disclosure requirement and draft the determination memo.", "scenarioBrief": "A vendor Northwind uses for payment processing just disclosed a breach that exposed a subset of Northwind's customer records. As the person drafting the initial materiality assessment, determine whether this triggers the SEC's 4-business-day 8-K disclosure requirement and draft the determination memo.", "keyArtifact": "Breach scenario details: systems affected (payment vendor's own systems, not Northwind's), data exposed (names, emails, last-4 card digits), estimated customers impacted (~4,000), vendor's remediation status (contained, forensics ongoing).", "learningObjective": "Determine whether a vendor breach triggers the SEC's 8-K materiality disclosure requirement and draft the memo.", "companyName": "Northwind Retail Technology", "breachScenario": "A vendor Northwind uses for payment processing just disclosed a breach that exposed a subset of Northwind's customer records. As the person drafting the initial materiality assessment, determine whether this triggers the SEC's 4-business-day 8-K disclosure requirement and draft the determination memo."}$mgrc08$::jsonb,
  $egrc08${"gradingFocus": "RAG-graded against the SEC cybersecurity disclosure rule's materiality factors -- does the memo address each factor (financial impact, reputational impact, operational impact, legal/regulatory exposure), not just assert a conclusion.", "sheetId": "GRC-08", "learningObjective": "Determine whether a vendor breach triggers the SEC's 8-K materiality disclosure requirement and draft the memo."}$egrc08$::jsonb,
  '722',
  31
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
    AND existing.ticket_type = 'sec_materiality'
);


-- GRC-09: OSCAL automation capstone (oscal_generator)
UPDATE public.tickets AS t
SET
  scenario_brief = $sgrc09$Manually re-typing SSP data every time a system's categorization changes doesn't scale. Write a script that reads a JSON input file (system name, categorization, control implementation statuses) and generates a valid OSCAL SSP fragment automatically.$sgrc09$,
  tier = 3,
  sort_order = 90,
  initial_state = COALESCE(t.initial_state, '{}'::jsonb) || $mgrc09${"sheetId": "GRC-09", "ticketCode": "GRC-09", "title": "OSCAL automation capstone", "prompt": "Manually re-typing SSP data every time a system's categorization changes doesn't scale. Write a script that reads a JSON input file (system name, categorization, control implementation statuses) and generates a valid OSCAL SSP fragment automatically.", "scenarioBrief": "Manually re-typing SSP data every time a system's categorization changes doesn't scale. Write a script that reads a JSON input file (system name, categorization, control implementation statuses) and generates a valid OSCAL SSP fragment automatically.", "keyArtifact": "A sample JSON input file structure (system_name, fips_199_category, controls: [{id, status, narrative}]) provided as a starting template.", "learningObjective": "Write a script that generates a valid OSCAL SSP fragment from structured JSON input, validated against the schema."}$mgrc09$::jsonb,
  expected_state = COALESCE(t.expected_state, '{}'::jsonb) || $egrc09${"gradingFocus": "Generated OSCAL validates against schema (deterministic, primary gate). Basic script structure check (reads input, produces valid output, handles a missing field gracefully) -- not a full code review.", "sheetId": "GRC-09", "learningObjective": "Write a script that generates a valid OSCAL SSP fragment from structured JSON input, validated against the schema."}$egrc09$::jsonb,
  dcwf_code = COALESCE(t.dcwf_code, '621')
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type = 'oscal_generator'
  AND t.tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  );

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
  $mgrc09${"sheetId": "GRC-09", "ticketCode": "GRC-09", "title": "OSCAL automation capstone", "prompt": "Manually re-typing SSP data every time a system's categorization changes doesn't scale. Write a script that reads a JSON input file (system name, categorization, control implementation statuses) and generates a valid OSCAL SSP fragment automatically.", "scenarioBrief": "Manually re-typing SSP data every time a system's categorization changes doesn't scale. Write a script that reads a JSON input file (system name, categorization, control implementation statuses) and generates a valid OSCAL SSP fragment automatically.", "keyArtifact": "A sample JSON input file structure (system_name, fips_199_category, controls: [{id, status, narrative}]) provided as a starting template.", "learningObjective": "Write a script that generates a valid OSCAL SSP fragment from structured JSON input, validated against the schema."}$mgrc09$::jsonb,
  $egrc09${"gradingFocus": "Generated OSCAL validates against schema (deterministic, primary gate). Basic script structure check (reads input, produces valid output, handles a missing field gracefully) -- not a full code review.", "sheetId": "GRC-09", "learningObjective": "Write a script that generates a valid OSCAL SSP fragment from structured JSON input, validated against the schema."}$egrc09$::jsonb,
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


-- GRC-10: RMF package defense capstone (ao_review)
UPDATE public.tickets AS t
SET
  scenario_brief = $sgrc10$It's time to defend Northwind's CUI enclave package to the Authorizing Official. Your compiled SSP fragment (GRC-03), POA&M entries (GRC-04), and OSCAL artifacts (GRC-09) are the package. Answer the AO's questions about residual risk and POA&M adequacy -- in writing, and if the recorder feature is live, on video.$sgrc10$,
  tier = 3,
  sort_order = 95,
  initial_state = COALESCE(t.initial_state, '{}'::jsonb) || $mgrc10${"sheetId": "GRC-10", "ticketCode": "GRC-10", "title": "RMF package defense capstone", "prompt": "It's time to defend Northwind's CUI enclave package to the Authorizing Official. Your compiled SSP fragment (GRC-03), POA&M entries (GRC-04), and OSCAL artifacts (GRC-09) are the package. Answer the AO's questions about residual risk and POA&M adequacy -- in writing, and if the recorder feature is live, on video.", "scenarioBrief": "It's time to defend Northwind's CUI enclave package to the Authorizing Official. Your compiled SSP fragment (GRC-03), POA&M entries (GRC-04), and OSCAL artifacts (GRC-09) are the package. Answer the AO's questions about residual risk and POA&M adequacy -- in writing, and if the recorder feature is live, on video.", "keyArtifact": "The student's own compiled prior work from GRC-03, GRC-04, and GRC-09 -- this ticket has no new external artifact, it's the synthesis point.", "learningObjective": "Compile the track's artifacts into one package and defend residual-risk decisions to a simulated Authorizing Official."}$mgrc10$::jsonb,
  expected_state = COALESCE(t.expected_state, '{}'::jsonb) || $egrc10${"gradingFocus": "RAG-generates 5-7 AO-style questions specific to the student's own submitted artifacts (not generic questions). Responses graded for whether they directly address the specific risk raised, not just restate the finding. This is the track's flagship portfolio item.", "sheetId": "GRC-10", "learningObjective": "Compile the track's artifacts into one package and defend residual-risk decisions to a simulated Authorizing Official."}$egrc10$::jsonb,
  dcwf_code = COALESCE(t.dcwf_code, '722')
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'grc'
  AND t.ticket_type = 'ao_review'
  AND t.tenant_id IN (
    '00000000-0000-4000-8000-000000000001'::uuid,
    '00000000-0000-4000-8000-000000000003'::uuid
  );

INSERT INTO public.tickets (
  tenant_id, track_id, tier, ticket_type, difficulty, sla_minutes,
  scenario_brief, initial_state, expected_state, dcwf_code, sort_order
)
SELECT
  st.id,
  grc.track_id,
  3,
  'ao_review',
  'hard',
  90,
  $sgrc10$It's time to defend Northwind's CUI enclave package to the Authorizing Official. Your compiled SSP fragment (GRC-03), POA&M entries (GRC-04), and OSCAL artifacts (GRC-09) are the package. Answer the AO's questions about residual risk and POA&M adequacy -- in writing, and if the recorder feature is live, on video.$sgrc10$,
  $mgrc10${"sheetId": "GRC-10", "ticketCode": "GRC-10", "title": "RMF package defense capstone", "prompt": "It's time to defend Northwind's CUI enclave package to the Authorizing Official. Your compiled SSP fragment (GRC-03), POA&M entries (GRC-04), and OSCAL artifacts (GRC-09) are the package. Answer the AO's questions about residual risk and POA&M adequacy -- in writing, and if the recorder feature is live, on video.", "scenarioBrief": "It's time to defend Northwind's CUI enclave package to the Authorizing Official. Your compiled SSP fragment (GRC-03), POA&M entries (GRC-04), and OSCAL artifacts (GRC-09) are the package. Answer the AO's questions about residual risk and POA&M adequacy -- in writing, and if the recorder feature is live, on video.", "keyArtifact": "The student's own compiled prior work from GRC-03, GRC-04, and GRC-09 -- this ticket has no new external artifact, it's the synthesis point.", "learningObjective": "Compile the track's artifacts into one package and defend residual-risk decisions to a simulated Authorizing Official."}$mgrc10$::jsonb,
  $egrc10${"gradingFocus": "RAG-generates 5-7 AO-style questions specific to the student's own submitted artifacts (not generic questions). Responses graded for whether they directly address the specific risk raised, not just restate the finding. This is the track's flagship portfolio item.", "sheetId": "GRC-10", "learningObjective": "Compile the track's artifacts into one package and defend residual-risk decisions to a simulated Authorizing Official."}$egrc10$::jsonb,
  '722',
  95
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
    AND existing.ticket_type = 'ao_review'
);


-- Keep ISSO-track clones (if any) aligned on scenario text for shared ticket types
-- that were reassigned off GRC but still use GRC-* ticketCode markers.
UPDATE public.tickets AS t
SET
  scenario_brief = CASE

    WHEN t.ticket_type = 'oscal_ssp' THEN $isgrc03$Northwind's DoD subcontract requires a System Security Plan for the enclave handling CUI. Complete the SSP components for two 800-171 Rev 3 requirements related to access control, using the provided system description.$isgrc03$
    WHEN t.ticket_type = 'poam' THEN $isgrc04$Two findings from your prior work -- the IAM lab's weak password policy finding, and the AC-2/IA-5 mapping correction from Navigating NIST SP 800-53 -- need formal POA&M entries before the next ConMon review. Draft both entries with realistic remediation milestones.$isgrc04$
    WHEN t.ticket_type = 'conmon_strategy' THEN $isgrc06$Northwind's DoD subcontract is now active. Draft the ConMon strategy memo for the CUI enclave: monitoring cadence per control family, which free/open-source tools (DefectDojo, CloudSploit, Scuba) cover which families, and the escalation/reporting cadence to the ISSM.$isgrc06$
    WHEN t.ticket_type = 'oscal_generator' THEN $isgrc09$Manually re-typing SSP data every time a system's categorization changes doesn't scale. Write a script that reads a JSON input file (system name, categorization, control implementation statuses) and generates a valid OSCAL SSP fragment automatically.$isgrc09$
    WHEN t.ticket_type = 'ao_review' THEN $isgrc10$It's time to defend Northwind's CUI enclave package to the Authorizing Official. Your compiled SSP fragment (GRC-03), POA&M entries (GRC-04), and OSCAL artifacts (GRC-09) are the package. Answer the AO's questions about residual risk and POA&M adequacy -- in writing, and if the recorder feature is live, on video.$isgrc10$

    ELSE t.scenario_brief
  END,
  initial_state = t.initial_state || jsonb_build_object('sheetSyncedFrom', 'GRC Lesson Content')
FROM public.tracks AS tr
WHERE t.track_id = tr.id
  AND tr.slug = 'isso'
  AND t.ticket_type IN ('oscal_ssp','poam','conmon_strategy','oscal_generator','ao_review');


-- Verification helper comment: expect 3 GRC lessons with non-empty content.scenarioBrief
-- and 10 GRC ticket types with sheetId GRC-01..GRC-10 after apply.
