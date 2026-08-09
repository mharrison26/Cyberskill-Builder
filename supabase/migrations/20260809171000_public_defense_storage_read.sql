-- Allow anonymous/authenticated readers to fetch Storage objects for
-- defenses that are explicitly marked public (verifiable public portfolio).
DROP POLICY IF EXISTS "Public can read public defense files" ON storage.objects;
CREATE POLICY "Public can read public defense files"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'defenses'
    AND EXISTS (
      SELECT 1
      FROM public.defense_recordings d
      WHERE d.storage_path = name
        AND d.is_public = true
    )
  );
