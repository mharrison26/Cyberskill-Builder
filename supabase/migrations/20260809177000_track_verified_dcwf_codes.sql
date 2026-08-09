-- Track-level verified DCWF mappings for helpdesk / sysadmin / python / auditor.
--
-- Verification (2026-08-09): Work Role IDs confirmed against the DoD Emerging
-- Technologies Talent Marketplace DCWF role pages (authoritative Work Role ID
-- + definition). cyber.mil CCP career-pathway PDFs for these codes currently
-- 404; marketplace pages are live and match the DCWF workforce-elements list.
--
--   411  Technical Support Specialist (Cyber IT)
--        https://www.dodemergingtech.com/dod-programs/dod-cyber-workforce-framework-dcwf/cyber-it/technical-support-specialist/
--        → helpdesk (customer incident / service-desk curriculum)
--
--   451  System Administrator (Cyber IT)
--        https://www.dodemergingtech.com/dod-programs/dod-cyber-workforce-framework-dcwf/cyber-it/system-administrator/
--        → sysadmin
--
--   621  Software Developer (Software Engineering)
--        https://www.dodemergingtech.com/dod-programs/dod-cyber-workforce-framework-dcwf/software-engineering/software-developer/
--        → python
--
--   805  IT Program Auditor (Cyberspace Enablers / Acquisition)
--        https://www.dodemergingtech.com/dod-programs/dod-cyber-workforce-framework-dcwf/cyberspace-enablers-support/it-program-auditor/
--        → auditor (IT program / compliance audit curriculum; not 612 SCA)
--
-- After every ticket in every track has a confirmed code, enforce
-- tickets.dcwf_code NOT NULL so placeholders cannot ship to portfolios.

INSERT INTO public.work_role_codes (
  code,
  title,
  workforce_element,
  legacy_8570_category,
  source_url
)
VALUES
  (
    '411',
    'Technical Support Specialist',
    'IT (Cyberspace)',
    NULL,
    'https://www.dodemergingtech.com/dod-programs/dod-cyber-workforce-framework-dcwf/cyber-it/technical-support-specialist/'
  ),
  (
    '451',
    'System Administrator',
    'IT (Cyberspace)',
    NULL,
    'https://www.dodemergingtech.com/dod-programs/dod-cyber-workforce-framework-dcwf/cyber-it/system-administrator/'
  ),
  (
    '621',
    'Software Developer',
    'Software Engineering',
    NULL,
    'https://www.dodemergingtech.com/dod-programs/dod-cyber-workforce-framework-dcwf/software-engineering/software-developer/'
  ),
  (
    '805',
    'IT Program Auditor',
    'Cyberspace Enablers (Support)',
    NULL,
    'https://www.dodemergingtech.com/dod-programs/dod-cyber-workforce-framework-dcwf/cyberspace-enablers-support/it-program-auditor/'
  )
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  workforce_element = EXCLUDED.workforce_element,
  legacy_8570_category = EXCLUDED.legacy_8570_category,
  source_url = EXCLUDED.source_url;

-- ---------------------------------------------------------------------------
-- Assign confirmed default work-role code per track (all tickets in track)
-- ---------------------------------------------------------------------------
UPDATE public.tickets AS t
SET dcwf_code = v.code
FROM (
  VALUES
    ('helpdesk', '411'),
    ('sysadmin', '451'),
    ('python', '621'),
    ('auditor', '805')
) AS v (slug, code)
JOIN public.tracks AS tr ON tr.slug = v.slug
WHERE t.track_id = tr.id;

UPDATE public.portfolio_items AS p
SET dcwf_code = v.code
FROM (
  VALUES
    ('helpdesk', '411'),
    ('sysadmin', '451'),
    ('python', '621'),
    ('auditor', '805')
) AS v (slug, code)
JOIN public.tracks AS tr ON tr.slug = v.slug
WHERE p.track_id = tr.id
  AND (p.dcwf_code IS NULL OR p.dcwf_code IS DISTINCT FROM v.code);

-- ---------------------------------------------------------------------------
-- Every track now has a confirmed ticket-level mapping → require dcwf_code
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  null_tickets integer;
BEGIN
  SELECT count(*) INTO null_tickets
  FROM public.tickets
  WHERE dcwf_code IS NULL;

  IF null_tickets > 0 THEN
    RAISE EXCEPTION
      'Refusing NOT NULL on tickets.dcwf_code: % ticket(s) still unmapped',
      null_tickets;
  END IF;
END $$;

ALTER TABLE public.tickets
  ALTER COLUMN dcwf_code SET NOT NULL;

COMMENT ON COLUMN public.tickets.dcwf_code IS
  'Required DCWF work-role code. Must reference a manually verified work_role_codes row; do not invent placeholders for public portfolios.';
