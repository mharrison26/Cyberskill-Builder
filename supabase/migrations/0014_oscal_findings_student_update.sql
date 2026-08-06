-- Allow students to update their own findings (e.g. is_public portfolio toggle).

CREATE POLICY "Students update own findings"
  ON public.oscal_findings
  FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());
