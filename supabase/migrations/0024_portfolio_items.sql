-- Unified portfolio_items (OSCAL findings + ticket resolutions).
-- Also adds ticket_progress.submission for parity with lesson_progress.

-- ---------------------------------------------------------------------------
-- ticket_progress.submission (optional payload from last submit)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ticket_progress
  ADD COLUMN IF NOT EXISTS submission jsonb;

COMMENT ON COLUMN public.ticket_progress.submission IS
  'Latest student submission payload for the ticket (set on submit).';

-- ---------------------------------------------------------------------------
-- portfolio_items
-- ---------------------------------------------------------------------------
CREATE TABLE public.portfolio_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  student_id         uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  track_id           uuid NOT NULL REFERENCES public.tracks (id) ON DELETE RESTRICT,
  tier               text,
  item_kind          text NOT NULL,
  title              text NOT NULL,
  dcwf_code          text,
  structured_result  jsonb NOT NULL DEFAULT '{}'::jsonb,
  narrative          text,
  is_public          boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- Optional provenance / submit extras (nullable)
  ticket_id          uuid REFERENCES public.tickets (id) ON DELETE RESTRICT,
  lesson_id          uuid REFERENCES public.lessons (id) ON DELETE RESTRICT,
  oscal_finding_id   uuid REFERENCES public.oscal_findings (id) ON DELETE SET NULL,
  ticket_type        text,
  score_status       text,
  submission         jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portfolio_items_item_kind_check
    CHECK (item_kind IN ('oscal_finding', 'ticket_resolution')),
  CONSTRAINT portfolio_items_score_status_check
    CHECK (
      score_status IS NULL
      OR score_status IN ('resolved', 'needs_revision')
    ),
  CONSTRAINT portfolio_items_ticket_resolution_requires_ticket
    CHECK (item_kind <> 'ticket_resolution' OR ticket_id IS NOT NULL),
  -- Postgres allows multiple NULLs in UNIQUE, so oscal rows (ticket_id NULL) coexist.
  CONSTRAINT portfolio_items_student_ticket_unique UNIQUE (student_id, ticket_id),
  CONSTRAINT portfolio_items_oscal_finding_unique UNIQUE (oscal_finding_id)
);

CREATE INDEX portfolio_items_tenant_id_idx ON public.portfolio_items (tenant_id);
CREATE INDEX portfolio_items_student_id_idx ON public.portfolio_items (student_id);
CREATE INDEX portfolio_items_track_id_idx ON public.portfolio_items (track_id);
CREATE INDEX portfolio_items_item_kind_idx ON public.portfolio_items (item_kind);
CREATE INDEX portfolio_items_ticket_id_idx ON public.portfolio_items (ticket_id);
CREATE INDEX portfolio_items_student_public_idx
  ON public.portfolio_items (student_id)
  WHERE is_public = true;

COMMENT ON TABLE public.portfolio_items IS
  'Unified student portfolio artifacts: OSCAL findings and ticket resolutions.';
COMMENT ON COLUMN public.portfolio_items.item_kind IS
  'Artifact type: oscal_finding or ticket_resolution.';
COMMENT ON COLUMN public.portfolio_items.tier IS
  'Lesson tier text or ticket tier as text (1|2|3).';
COMMENT ON COLUMN public.portfolio_items.narrative IS
  'Student narrative (findings) or scorer feedback (ticket resolutions).';
COMMENT ON COLUMN public.portfolio_items.structured_result IS
  'Machine-readable payload (OSCAL observation or score details).';
COMMENT ON COLUMN public.portfolio_items.score_status IS
  'Ticket scorer outcome when item_kind = ticket_resolution.';
COMMENT ON COLUMN public.portfolio_items.is_public IS
  'When true, item may appear on the student public portfolio.';

ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_items FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant students read own portfolio items"
  ON public.portfolio_items
  FOR SELECT
  TO authenticated
  USING (
    (
      tenant_id = public.jwt_tenant_id()
      AND student_id = auth.uid()
    )
    OR public.is_admin()
    OR is_public = true
  );

CREATE POLICY "Tenant students insert own portfolio items"
  ON public.portfolio_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.jwt_tenant_id()
    AND student_id = auth.uid()
  );

CREATE POLICY "Tenant students update own portfolio items"
  ON public.portfolio_items
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.jwt_tenant_id()
    AND student_id = auth.uid()
  )
  WITH CHECK (
    tenant_id = public.jwt_tenant_id()
    AND student_id = auth.uid()
  );

CREATE POLICY "Admins manage portfolio items"
  ON public.portfolio_items
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Anon may read public portfolio items (mirrors oscal_findings public reads).
CREATE POLICY "Public read public portfolio items"
  ON public.portfolio_items
  FOR SELECT
  TO anon
  USING (is_public = true);

GRANT SELECT, INSERT, UPDATE ON public.portfolio_items TO authenticated;
GRANT SELECT ON public.portfolio_items TO anon;

-- ---------------------------------------------------------------------------
-- Keep portfolio_items in sync when oscal_findings are written (no app dual-write).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_oscal_finding_to_portfolio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text;
BEGIN
  SELECT l.tier INTO v_tier
  FROM public.lessons l
  WHERE l.id = NEW.lesson_id;

  INSERT INTO public.portfolio_items (
    tenant_id,
    student_id,
    track_id,
    tier,
    item_kind,
    title,
    dcwf_code,
    structured_result,
    narrative,
    is_public,
    created_at,
    lesson_id,
    oscal_finding_id,
    updated_at
  )
  VALUES (
    NEW.tenant_id,
    NEW.student_id,
    NEW.track_id,
    COALESCE(v_tier, '1'),
    'oscal_finding',
    'Finding: ' || NEW.control_id,
    NEW.dcwf_code,
    COALESCE(NEW.observation, '{}'::jsonb)
      || jsonb_build_object(
        'control_id', NEW.control_id,
        'finding_state', NEW.finding_state
      ),
    NEW.student_narrative,
    COALESCE(NEW.is_public, false),
    NEW.created_at,
    NEW.lesson_id,
    NEW.id,
    now()
  )
  ON CONFLICT (oscal_finding_id) DO UPDATE SET
    title = EXCLUDED.title,
    dcwf_code = EXCLUDED.dcwf_code,
    structured_result = EXCLUDED.structured_result,
    narrative = EXCLUDED.narrative,
    is_public = EXCLUDED.is_public,
    tier = EXCLUDED.tier,
    lesson_id = EXCLUDED.lesson_id,
    updated_at = now();

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_oscal_finding_to_portfolio() IS
  'Upserts a portfolio_items row (item_kind=oscal_finding) for each oscal_findings change.';

CREATE TRIGGER oscal_findings_sync_portfolio_items
  AFTER INSERT OR UPDATE ON public.oscal_findings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_oscal_finding_to_portfolio();

-- ---------------------------------------------------------------------------
-- Idempotent backfill from existing oscal_findings
-- ---------------------------------------------------------------------------
INSERT INTO public.portfolio_items (
  tenant_id,
  student_id,
  track_id,
  tier,
  item_kind,
  title,
  dcwf_code,
  structured_result,
  narrative,
  is_public,
  created_at,
  lesson_id,
  oscal_finding_id
)
SELECT
  f.tenant_id,
  f.student_id,
  f.track_id,
  COALESCE(l.tier, '1'),
  'oscal_finding',
  'Finding: ' || f.control_id,
  f.dcwf_code,
  COALESCE(f.observation, '{}'::jsonb)
    || jsonb_build_object(
      'control_id', f.control_id,
      'finding_state', f.finding_state
    ),
  f.student_narrative,
  COALESCE(f.is_public, false),
  f.created_at,
  f.lesson_id,
  f.id
FROM public.oscal_findings f
LEFT JOIN public.lessons l ON l.id = f.lesson_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.portfolio_items pi
  WHERE pi.oscal_finding_id = f.id
);
