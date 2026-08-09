-- Seed remaining workforce tracks (GRC already seeded).
INSERT INTO public.tracks (slug, name, full_price)
VALUES
  ('helpdesk', 'HelpDesk', 299.00),
  ('sysadmin', 'IT Admin / Sysadmin', 299.00),
  ('auditor', 'IT Auditor', 299.00),
  ('python', 'Python Engineering', 299.00),
  ('isso', 'ISSO', 299.00),
  ('issm', 'ISSM', 299.00)
ON CONFLICT (slug) DO NOTHING;

-- Core table (idempotent). Full RLS/grants finalized in
-- 20260809175000_defense_recordings_grants_and_rls_fix.sql.
CREATE TABLE IF NOT EXISTS public.defense_recordings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  student_id          uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  track_id            uuid NOT NULL REFERENCES public.tracks (id) ON DELETE RESTRICT,
  related_finding_id  uuid REFERENCES public.oscal_findings (id) ON DELETE SET NULL,
  prompt_questions    jsonb NOT NULL DEFAULT '[]'::jsonb,
  storage_path        text NOT NULL,
  duration_seconds    integer,
  is_public           boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Evolve for portfolio artifact linkage + media metadata.
ALTER TABLE public.defense_recordings
  ADD COLUMN IF NOT EXISTS portfolio_item_id uuid REFERENCES public.portfolio_items (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS artifact_id text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill artifact_id for any legacy rows.
UPDATE public.defense_recordings
SET artifact_id = COALESCE(
  artifact_id,
  related_finding_id::text,
  id::text
)
WHERE artifact_id IS NULL;

UPDATE public.defense_recordings
SET media_type = COALESCE(media_type, 'audio')
WHERE media_type IS NULL;

UPDATE public.defense_recordings
SET mime_type = COALESCE(mime_type, 'audio/webm')
WHERE mime_type IS NULL;

ALTER TABLE public.defense_recordings
  ALTER COLUMN artifact_id SET NOT NULL;

ALTER TABLE public.defense_recordings
  ALTER COLUMN media_type SET NOT NULL;

ALTER TABLE public.defense_recordings
  ALTER COLUMN mime_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'defense_recordings_media_type_check'
  ) THEN
    ALTER TABLE public.defense_recordings
      ADD CONSTRAINT defense_recordings_media_type_check
      CHECK (media_type IN ('audio', 'video'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS defense_recordings_student_id_idx
  ON public.defense_recordings (student_id);
CREATE INDEX IF NOT EXISTS defense_recordings_artifact_id_idx
  ON public.defense_recordings (artifact_id);
CREATE INDEX IF NOT EXISTS defense_recordings_portfolio_item_id_idx
  ON public.defense_recordings (portfolio_item_id);

COMMENT ON TABLE public.defense_recordings IS
  'Verbal/video defense recordings linked to portfolio artifacts.';

ALTER TABLE public.defense_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defense_recordings FORCE ROW LEVEL SECURITY;

-- Interim policies (replaced by tenant_isolation_recordings + public_read_published
-- in 20260809175000). Keep student + public reads working if that migration is delayed.
DROP POLICY IF EXISTS "Students manage own defense recordings" ON public.defense_recordings;
CREATE POLICY "Students manage own defense recordings"
  ON public.defense_recordings
  FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Public can read public defense recordings" ON public.defense_recordings;
CREATE POLICY "Public can read public defense recordings"
  ON public.defense_recordings
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.defense_recordings TO authenticated;
GRANT SELECT ON public.defense_recordings TO anon;

-- Private bucket for defense uploads.
-- Path: {tenant_id}/{student_id}/{artifact_id}/{filename}
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'defenses',
  'defenses',
  false,
  52428800,
  ARRAY[
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'video/webm',
    'video/mp4',
    'video/ogg'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Students upload own defense files" ON storage.objects;
CREATE POLICY "Students upload own defense files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'defenses'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Students read own defense files" ON storage.objects;
CREATE POLICY "Students read own defense files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'defenses'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Students update own defense files" ON storage.objects;
CREATE POLICY "Students update own defense files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'defenses'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'defenses'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
