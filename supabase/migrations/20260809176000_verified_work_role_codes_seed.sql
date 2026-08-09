-- Verified-only DCWF work_role_codes seed + portfolio-safe ticket cleanup.
--
-- Rationale: incorrect work-role codes must not ship to a student's public
-- portfolio (undermines the credibility the ledger exists to provide).
--
-- Verification standard (manual check against DoD Cyber Workforce Framework
-- career-pathway / qualification materials on dod.cyber.mil, 2026-08-09):
--
--   722  Information Systems Security Manager
--        Source (live): https://dl.dod.cyber.mil/wp-content/uploads/ccp/pdf/722_Information_Systems_Security_Manager.pdf
--        Notes: DCWF disclaimer states 722 tasks/KSAs may be shared with ISSOs.
--        Confirmed for GRC / ISSO / ISSM-aligned curriculum mapping.
--
--   612  Security Control Assessor
--        Source (live): https://dl.dod.cyber.mil/wp-content/uploads/ccp/pdf/612_Security_Control_Assessor.pdf
--        Notes: Official SCA work role. Already seeded in 0029 alongside 722 for
--        GRC/ISSO assessor-aligned tickets (POA&M, SAR, OSCAL, assessment labs).
--        Confirmed against the same cyber.mil career-pathway PDFs.
--
-- NOT seeded (do not invent / do not re-add until manually re-verified):
--   411  Technical Support Specialist — prior seed URL 404'd
--        (…/ccp/pdf/411_Technical_Support_Specialist.pdf). HelpDesk ticket
--        assignments were convenience placeholders, not track-confirmed.
--   541  Vulnerability Assessment Analyst — prior seed URL 404'd
--        (…/ccp/pdf/541_Vulnerability_Assessment_Analyst.pdf). Sysadmin
--        vuln_prioritization assignment was a convenience placeholder.
--
-- Additional codes MUST be manually verified against current cyber.mil /
-- public.cyber.mil DCWF qualification matrices (or the matching career-pathway
-- PDF) before INSERT into work_role_codes, and ticket-level mappings must be
-- confirmed before setting tickets.dcwf_code.
--
-- NOT NULL on tickets.dcwf_code is intentionally NOT added: several tracks
-- (helpdesk, sysadmin, python, auditor) still have tickets without a confirmed
-- work-role mapping. Enforce NOT NULL only once every ticket in a track has a
-- confirmed code.

-- ---------------------------------------------------------------------------
-- 1. Upsert only manually verified catalog rows
-- ---------------------------------------------------------------------------
INSERT INTO public.work_role_codes (
  code,
  title,
  workforce_element,
  legacy_8570_category,
  source_url
)
VALUES
  (
    '722',
    'Information Systems Security Manager',
    'Cybersecurity',
    'IAM Level III',
    'https://dl.dod.cyber.mil/wp-content/uploads/ccp/pdf/722_Information_Systems_Security_Manager.pdf'
  ),
  (
    '612',
    'Security Control Assessor',
    'Cybersecurity',
    'IAM Level II',
    'https://dl.dod.cyber.mil/wp-content/uploads/ccp/pdf/612_Security_Control_Assessor.pdf'
  )
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  workforce_element = EXCLUDED.workforce_element,
  legacy_8570_category = EXCLUDED.legacy_8570_category,
  source_url = EXCLUDED.source_url;

COMMENT ON TABLE public.work_role_codes IS
  'DoD Cyber Workforce Framework (DCWF) work role catalog. Seed ONLY codes manually verified against current cyber.mil / public.cyber.mil qualification matrices or career-pathway PDFs. Incorrect codes must not appear on public student portfolios.';

-- ---------------------------------------------------------------------------
-- 2. Remove unverified placeholder catalog rows
--    FK ON DELETE SET NULL clears lessons/tickets/findings/portfolio_items.
-- ---------------------------------------------------------------------------
DELETE FROM public.work_role_codes
WHERE code NOT IN ('722', '612');

-- ---------------------------------------------------------------------------
-- 3. Null misassigned codes on tracks without confirmed mappings
--    (helpdesk used 722 as a GRC copy-paste; auditor used 612 though IT
--    auditor ≠ Security Control Assessor; sysadmin/python had 411/541 which
--    were removed above — this pass clears any remaining 722/612 on those tracks.)
-- ---------------------------------------------------------------------------
UPDATE public.tickets AS t
SET dcwf_code = NULL
WHERE t.dcwf_code IS NOT NULL
  AND t.track_id IN (
    SELECT tr.id
    FROM public.tracks AS tr
    WHERE tr.slug IN ('helpdesk', 'sysadmin', 'python', 'auditor')
  );

-- Mirror portfolio / findings that still carry those track placeholders.
UPDATE public.portfolio_items AS p
SET dcwf_code = NULL
WHERE p.dcwf_code IS NOT NULL
  AND p.track_id IN (
    SELECT tr.id
    FROM public.tracks AS tr
    WHERE tr.slug IN ('helpdesk', 'sysadmin', 'python', 'auditor')
  );

UPDATE public.oscal_findings AS f
SET dcwf_code = NULL
WHERE f.dcwf_code IS NOT NULL
  AND f.track_id IN (
    SELECT tr.id
    FROM public.tracks AS tr
    WHERE tr.slug IN ('helpdesk', 'sysadmin', 'python', 'auditor')
  );

-- ---------------------------------------------------------------------------
-- 4. ISSM track: definitional match to verified 722 (was incorrectly 612 SCA)
-- ---------------------------------------------------------------------------
UPDATE public.tickets AS t
SET dcwf_code = '722'
WHERE t.track_id = (SELECT id FROM public.tracks WHERE slug = 'issm');

-- GRC + ISSO tickets that already reference 722 or 612 keep those values
-- (both codes verified; assessor labs → 612, ISSM/ISSO-aligned ops → 722).
-- Tickets on those tracks that are already NULL stay NULL until a human
-- confirms the correct work role for that specific ticket.
