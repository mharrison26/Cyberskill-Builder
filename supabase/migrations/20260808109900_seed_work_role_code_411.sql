-- Seed DCWF 411 (Technical Support Specialist) referenced by helpdesk tickets
-- (customer_reply, kb_writeup, coaching, SLA escalation, script remediation, capstone).

INSERT INTO public.work_role_codes (
  code,
  title,
  workforce_element,
  legacy_8570_category,
  source_url
)
VALUES (
  '411',
  'Technical Support Specialist',
  'Cybersecurity',
  'CSSP Infrastructure Support',
  'https://dl.dod.cyber.mil/wp-content/uploads/ccp/pdf/411_Technical_Support_Specialist.pdf'
)
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  workforce_element = EXCLUDED.workforce_element,
  legacy_8570_category = EXCLUDED.legacy_8570_category,
  source_url = EXCLUDED.source_url;
