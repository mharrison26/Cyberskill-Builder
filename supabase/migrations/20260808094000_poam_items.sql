-- POA&M items: student remediation plans linked to findings (ticket exercise + portfolio).

-- ---------------------------------------------------------------------------
-- poam_items
-- ---------------------------------------------------------------------------
CREATE TABLE public.poam_items (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES public.tenants (id) ON DELETE RESTRICT,
  student_id                 uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  track_id                   uuid NOT NULL REFERENCES public.tracks (id) ON DELETE RESTRICT,
  ticket_id                  uuid REFERENCES public.tickets (id) ON DELETE SET NULL,
  -- Seed/exercise finding key (e.g. FIND-AC-2-01) or oscal_findings.id as text.
  finding_id                 text NOT NULL,
  -- Optional FK when the finding is a real oscal_findings row.
  oscal_finding_id           uuid REFERENCES public.oscal_findings (id) ON DELETE SET NULL,
  weakness_description       text NOT NULL,
  milestone                  text NOT NULL,
  scheduled_completion_date  date NOT NULL,
  status                     text NOT NULL DEFAULT 'open',
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poam_items_status_check
    CHECK (status IN ('open', 'ongoing', 'completed', 'delayed', 'risk_accepted')),
  CONSTRAINT poam_items_finding_id_nonempty
    CHECK (length(trim(finding_id)) > 0),
  CONSTRAINT poam_items_student_ticket_finding_unique
    UNIQUE (student_id, ticket_id, finding_id)
);

CREATE INDEX poam_items_tenant_id_idx ON public.poam_items (tenant_id);
CREATE INDEX poam_items_student_id_idx ON public.poam_items (student_id);
CREATE INDEX poam_items_track_id_idx ON public.poam_items (track_id);
CREATE INDEX poam_items_ticket_id_idx ON public.poam_items (ticket_id);
CREATE INDEX poam_items_finding_id_idx ON public.poam_items (finding_id);
CREATE INDEX poam_items_oscal_finding_id_idx ON public.poam_items (oscal_finding_id);

COMMENT ON TABLE public.poam_items IS
  'Student Plan of Action & Milestones (POA&M) remediation entries tied to findings.';
COMMENT ON COLUMN public.poam_items.finding_id IS
  'Finding identifier: ticket seed key or oscal_findings.id as text.';
COMMENT ON COLUMN public.poam_items.oscal_finding_id IS
  'Optional FK to public.oscal_findings when the finding exists in the database.';
COMMENT ON COLUMN public.poam_items.milestone IS
  'Remediation milestone / planned corrective action.';
COMMENT ON COLUMN public.poam_items.scheduled_completion_date IS
  'Target completion date for the remediation milestone.';
COMMENT ON COLUMN public.poam_items.status IS
  'POA&M item status: open | ongoing | completed | delayed | risk_accepted.';

ALTER TABLE public.poam_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poam_items FORCE ROW LEVEL SECURITY;

CREATE POLICY "Tenant students read own poam items"
  ON public.poam_items
  FOR SELECT
  TO authenticated
  USING (
    (
      tenant_id = public.jwt_tenant_id()
      AND student_id = auth.uid()
    )
    OR public.is_admin()
  );

CREATE POLICY "Tenant students insert own poam items"
  ON public.poam_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.jwt_tenant_id()
    AND student_id = auth.uid()
  );

CREATE POLICY "Tenant students update own poam items"
  ON public.poam_items
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

CREATE POLICY "Admins manage poam items"
  ON public.poam_items
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE ON public.poam_items TO authenticated;
