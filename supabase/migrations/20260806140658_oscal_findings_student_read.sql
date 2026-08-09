-- Allow students to read their own OSCAL findings (grading results on lesson pages).

ALTER TABLE public.oscal_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own findings"
  ON public.oscal_findings
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());
