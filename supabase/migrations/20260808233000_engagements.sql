-- PI-02: Multi-stage ticket sequences grouped under one engagement.
-- Engagements hold shared title/scope; tickets reference engagement_id + stage order.

-- ---------------------------------------------------------------------------
-- engagements
-- ---------------------------------------------------------------------------
CREATE TABLE public.engagements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  track_id    uuid NOT NULL REFERENCES public.tracks (id) ON DELETE CASCADE,
  slug        text NOT NULL,
  title       text NOT NULL,
  scope       jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order  integer NOT NULL DEFAULT 0,
  CONSTRAINT engagements_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT engagements_track_slug_unique UNIQUE (track_id, slug)
);

CREATE INDEX engagements_tenant_id_idx ON public.engagements (tenant_id);
CREATE INDEX engagements_track_id_idx ON public.engagements (track_id);
CREATE INDEX engagements_track_id_sort_order_idx
  ON public.engagements (track_id, sort_order);

COMMENT ON TABLE public.engagements IS
  'Groups sequential tickets into one console flow (planning → tests → findings).';
COMMENT ON COLUMN public.engagements.scope IS
  'Learner-facing engagement scope: company, period, in-scope processes/ITGCs, etc.';

ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagements FORCE ROW LEVEL SECURITY;

CREATE POLICY "Enrolled students read engagements"
  ON public.engagements
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      tenant_id = public.jwt_tenant_id()
      AND EXISTS (
        SELECT 1
        FROM public.track_enrollments AS te
        WHERE te.student_id = auth.uid()
          AND te.track_id = engagements.track_id
          AND te.tenant_id = engagements.tenant_id
          AND te.status = 'active'
      )
    )
  );

CREATE POLICY "Admins manage engagements"
  ON public.engagements
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.engagements TO authenticated;

-- ---------------------------------------------------------------------------
-- tickets: optional engagement membership + stage order within engagement
-- ---------------------------------------------------------------------------
ALTER TABLE public.tickets
  ADD COLUMN engagement_id uuid REFERENCES public.engagements (id) ON DELETE SET NULL,
  ADD COLUMN engagement_stage integer;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_engagement_stage_check
  CHECK (
    (engagement_id IS NULL AND engagement_stage IS NULL)
    OR (
      engagement_id IS NOT NULL
      AND engagement_stage IS NOT NULL
      AND engagement_stage >= 1
    )
  );

CREATE INDEX tickets_engagement_id_idx ON public.tickets (engagement_id);
CREATE UNIQUE INDEX tickets_engagement_id_stage_unique
  ON public.tickets (engagement_id, engagement_stage)
  WHERE engagement_id IS NOT NULL;

COMMENT ON COLUMN public.tickets.engagement_id IS
  'Optional FK grouping this ticket into a multi-stage engagement (PI-02).';
COMMENT ON COLUMN public.tickets.engagement_stage IS
  '1-based stage order within the engagement; stage N unlocks after stage N-1 is resolved.';
