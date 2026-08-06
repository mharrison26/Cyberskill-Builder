-- Admin grading review: is_reviewed flag, assessor states, admin RLS.

ALTER TABLE public.oscal_findings
  ADD COLUMN IF NOT EXISTS is_reviewed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.oscal_findings.is_reviewed IS
  'True after an admin has reviewed and optionally overridden AI grading.';

-- Allow assessor grading states alongside existing workflow states.
ALTER TABLE public.oscal_findings
  DROP CONSTRAINT IF EXISTS oscal_findings_finding_state_check;

ALTER TABLE public.oscal_findings
  ADD CONSTRAINT oscal_findings_finding_state_check
  CHECK (finding_state IN (
    'draft',
    'submitted',
    'under_review',
    'accepted',
    'rejected',
    'satisfied',
    'insufficient_evidence',
    'not_satisfied',
    'not_started'
  ));

CREATE POLICY "Students insert own findings"
  ON public.oscal_findings
  FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Admins manage findings"
  ON public.oscal_findings
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins read all users"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
