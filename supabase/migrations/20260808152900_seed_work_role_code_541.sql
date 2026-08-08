-- Seed DCWF 541 (Vulnerability Assessment Analyst) referenced by
-- vuln_prioritization / patch_schedule tickets.

INSERT INTO public.work_role_codes (
  code,
  title,
  workforce_element,
  legacy_8570_category,
  source_url
)
VALUES (
  '541',
  'Vulnerability Assessment Analyst',
  'Cybersecurity',
  'CSSP Analyst',
  'https://dl.dod.cyber.mil/wp-content/uploads/ccp/pdf/541_Vulnerability_Assessment_Analyst.pdf'
)
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  workforce_element = EXCLUDED.workforce_element,
  legacy_8570_category = EXCLUDED.legacy_8570_category,
  source_url = EXCLUDED.source_url;
