-- Tickets content model (parallel to lessons) + unified learning_items view.
-- Does not alter public.lessons (GRC Tier 1 and other lesson-based tracks stay unchanged).

-- ---------------------------------------------------------------------------
-- tickets
-- ---------------------------------------------------------------------------
CREATE TABLE public.tickets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  track_id       uuid NOT NULL REFERENCES public.tracks (id) ON DELETE CASCADE,
  tier           integer NOT NULL,
  ticket_type    text NOT NULL,
  difficulty     text NOT NULL,
  sla_minutes    integer NOT NULL,
  scenario_brief text NOT NULL,
  initial_state  jsonb NOT NULL DEFAULT '{}'::jsonb,
  dcwf_code      text,
  sort_order     integer NOT NULL,
  CONSTRAINT tickets_tier_check CHECK (tier IN (1, 2, 3)),
  CONSTRAINT tickets_sla_minutes_check CHECK (sla_minutes >= 0),
  CONSTRAINT tickets_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX tickets_tenant_id_idx ON public.tickets (tenant_id);
CREATE INDEX tickets_track_id_idx ON public.tickets (track_id);
CREATE INDEX tickets_track_id_sort_order_idx ON public.tickets (track_id, sort_order);

COMMENT ON TABLE public.tickets IS
  'Tenant-scoped ticket scenarios for tracks that use the ticket content model (parallel to lessons).';
COMMENT ON COLUMN public.tickets.tier IS
  'Difficulty tier for the ticket: 1, 2, or 3.';
COMMENT ON COLUMN public.tickets.scenario_brief IS
  'Learner-facing brief; used as title in public.learning_items.';
COMMENT ON COLUMN public.tickets.initial_state IS
  'Starting lab/simulator state payload for the ticket.';

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets FORCE ROW LEVEL SECURITY;

-- Enrolled students (same tenant) and admins can read tickets for their track.
CREATE POLICY "Enrolled students read tickets"
  ON public.tickets
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
          AND te.track_id = tickets.track_id
          AND te.tenant_id = tickets.tenant_id
          AND te.status = 'active'
      )
    )
  );

CREATE POLICY "Admins manage tickets"
  ON public.tickets
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.tickets TO authenticated;

-- ---------------------------------------------------------------------------
-- learning_items: normalized UNION of lessons + tickets for dashboard queries
-- ---------------------------------------------------------------------------
CREATE VIEW public.learning_items
WITH (security_invoker = true)
AS
SELECT
  l.id,
  l.track_id,
  l.tier,
  l.title,
  'lesson'::text AS kind
FROM public.lessons AS l
UNION ALL
SELECT
  t.id,
  t.track_id,
  t.tier::text AS tier,
  t.scenario_brief AS title,
  'ticket'::text AS kind
FROM public.tickets AS t;

COMMENT ON VIEW public.learning_items IS
  'Unified learning content (lessons and tickets) with shape id, track_id, tier, title, kind. Respects underlying table RLS via security_invoker.';

GRANT SELECT ON public.learning_items TO authenticated;
