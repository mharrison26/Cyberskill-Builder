-- Ensure defense_recordings exists (idempotent for fresh local DBs), grant API
-- roles, and replace overlapping policies with:
--   1) tenant_isolation_recordings — NULLIF(current_setting(...), '')::uuid so an
--      empty/missing session var is NULL (row excluded), not a cast error that
--      would also break the public policy under OR evaluation
--   2) public_read_published — is_public = true for anonymous portfolio viewers

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

-- Columns added by 20260809160000 may already exist; keep this migration safe alone.
ALTER TABLE public.defense_recordings
  ADD COLUMN IF NOT EXISTS portfolio_item_id uuid REFERENCES public.portfolio_items (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS artifact_id text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.defense_recordings
  ALTER COLUMN prompt_questions SET DEFAULT '[]'::jsonb;

UPDATE public.defense_recordings
SET prompt_questions = '[]'::jsonb
WHERE prompt_questions IS NULL;

UPDATE public.defense_recordings
SET artifact_id = COALESCE(artifact_id, related_finding_id::text, id::text)
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

CREATE INDEX IF NOT EXISTS defense_recordings_tenant_id_idx
  ON public.defense_recordings (tenant_id);
CREATE INDEX IF NOT EXISTS defense_recordings_student_id_idx
  ON public.defense_recordings (student_id);
CREATE INDEX IF NOT EXISTS defense_recordings_track_id_idx
  ON public.defense_recordings (track_id);
CREATE INDEX IF NOT EXISTS defense_recordings_related_finding_id_idx
  ON public.defense_recordings (related_finding_id);
CREATE INDEX IF NOT EXISTS defense_recordings_student_public_idx
  ON public.defense_recordings (student_id)
  WHERE is_public = true;

COMMENT ON TABLE public.defense_recordings IS
  'Verbal/video defense recordings answering RAG AO/interview prompts; linked to findings or portfolio artifacts.';
COMMENT ON COLUMN public.defense_recordings.prompt_questions IS
  'RAG-generated AO/interview questions the recording answers (e.g. GRC-10 / ISSO AO review).';
COMMENT ON COLUMN public.defense_recordings.related_finding_id IS
  'Optional oscal_findings row this defense answers; null for ticket-resolution defenses.';
COMMENT ON COLUMN public.defense_recordings.is_public IS
  'When true, readable by anon via public_read_published (public portfolio).';

ALTER TABLE public.defense_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defense_recordings FORCE ROW LEVEL SECURITY;

-- Drop prior/overlapping policy names from earlier iterations.
DROP POLICY IF EXISTS "Students manage own defense recordings" ON public.defense_recordings;
DROP POLICY IF EXISTS "Public can read public defense recordings" ON public.defense_recordings;
DROP POLICY IF EXISTS tenant_isolation_recordings ON public.defense_recordings;
DROP POLICY IF EXISTS public_read_published_recordings ON public.defense_recordings;
DROP POLICY IF EXISTS public_read_published ON public.defense_recordings;

-- Tenant-scoped access. Prefer app.current_tenant_id when set; otherwise own-row
-- via JWT tenant + auth.uid(). NULLIF prevents ''::uuid from raising and
-- poisoning the OR with public_read_published.
CREATE POLICY tenant_isolation_recordings
  ON public.defense_recordings
  FOR ALL
  TO authenticated
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR (
      student_id = auth.uid()
      AND tenant_id = public.jwt_tenant_id()
    )
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
    OR (
      student_id = auth.uid()
      AND tenant_id = public.jwt_tenant_id()
    )
  );

-- Separate public read for anonymous (and authenticated) portfolio viewers.
CREATE POLICY public_read_published
  ON public.defense_recordings
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.defense_recordings TO authenticated;
GRANT SELECT ON public.defense_recordings TO anon;
