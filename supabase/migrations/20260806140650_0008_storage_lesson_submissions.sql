-- Private bucket for tool walkthrough evidence uploads.
-- Path pattern: {tenant_id}/{student_id}/{lesson_id}/{filename}

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lesson-submissions',
  'lesson-submissions',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Students upload own lesson submission files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'lesson-submissions'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Students read own lesson submission files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'lesson-submissions'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Students update own lesson submission files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'lesson-submissions'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'lesson-submissions'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
