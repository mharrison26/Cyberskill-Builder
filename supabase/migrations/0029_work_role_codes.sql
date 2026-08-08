-- DCWF work role codes catalog + FK from lessons/tickets (and related dcwf_code columns).

-- ---------------------------------------------------------------------------
-- work_role_codes
-- ---------------------------------------------------------------------------
CREATE TABLE public.work_role_codes (
  code                  text PRIMARY KEY,
  title                 text NOT NULL,
  workforce_element     text,
  legacy_8570_category  text,
  source_url            text
);

COMMENT ON TABLE public.work_role_codes IS
  'DoD Cyber Workforce Framework (DCWF) work role catalog for curriculum alignment.';
COMMENT ON COLUMN public.work_role_codes.code IS
  'DCWF work role code (natural key, e.g. 722).';
COMMENT ON COLUMN public.work_role_codes.workforce_element IS
  'DCWF workforce element (e.g. Cybersecurity).';
COMMENT ON COLUMN public.work_role_codes.legacy_8570_category IS
  'Best-effort legacy DoD 8570 IA category association; DoD 8140 has no official crosswalk.';
COMMENT ON COLUMN public.work_role_codes.source_url IS
  'Authoritative or public reference URL for the work role.';

ALTER TABLE public.work_role_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_role_codes FORCE ROW LEVEL SECURITY;

-- Catalog is read-only for clients; no student writes.
CREATE POLICY "Authenticated read work role codes"
  ON public.work_role_codes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon read work role codes"
  ON public.work_role_codes
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Admins manage work role codes"
  ON public.work_role_codes
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.work_role_codes TO authenticated;
GRANT SELECT ON public.work_role_codes TO anon;

-- ---------------------------------------------------------------------------
-- Seed codes referenced by curriculum (and related GRC assessor role).
-- Distinct dcwf_code values found in seeds/data: 722 (lessons).
-- 612 seeded for curriculum narrative (Security Control Assessor); official DCWF.
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

-- Clear any orphan free-text codes before adding FKs (keeps nullable columns valid).
UPDATE public.lessons AS l
SET dcwf_code = NULL
WHERE l.dcwf_code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.work_role_codes AS w WHERE w.code = l.dcwf_code
  );

UPDATE public.tickets AS t
SET dcwf_code = NULL
WHERE t.dcwf_code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.work_role_codes AS w WHERE w.code = t.dcwf_code
  );

UPDATE public.oscal_findings AS f
SET dcwf_code = NULL
WHERE f.dcwf_code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.work_role_codes AS w WHERE w.code = f.dcwf_code
  );

UPDATE public.portfolio_items AS p
SET dcwf_code = NULL
WHERE p.dcwf_code IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.work_role_codes AS w WHERE w.code = p.dcwf_code
  );

-- ---------------------------------------------------------------------------
-- Foreign keys (nullable): lessons + tickets required; findings/portfolio for joins
-- ---------------------------------------------------------------------------
ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_dcwf_code_fkey
  FOREIGN KEY (dcwf_code)
  REFERENCES public.work_role_codes (code)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_dcwf_code_fkey
  FOREIGN KEY (dcwf_code)
  REFERENCES public.work_role_codes (code)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

ALTER TABLE public.oscal_findings
  ADD CONSTRAINT oscal_findings_dcwf_code_fkey
  FOREIGN KEY (dcwf_code)
  REFERENCES public.work_role_codes (code)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

ALTER TABLE public.portfolio_items
  ADD CONSTRAINT portfolio_items_dcwf_code_fkey
  FOREIGN KEY (dcwf_code)
  REFERENCES public.work_role_codes (code)
  ON UPDATE CASCADE
  ON DELETE SET NULL;
