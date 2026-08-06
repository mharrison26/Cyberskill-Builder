-- Foundation schema: tenants, users, tracks, enrollments, lessons, progress, OSCAL findings

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
CREATE TABLE tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  tenant_kind text NOT NULL
);

COMMENT ON TABLE tenants IS 'Organizations or accounts that own users and enrollments.';
COMMENT ON COLUMN tenants.tenant_kind IS 'Free-form tenant classification (e.g. school, enterprise, individual).';

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
  email     text NOT NULL,
  CONSTRAINT users_tenant_email_unique UNIQUE (tenant_id, email)
);

CREATE INDEX users_tenant_id_idx ON users (tenant_id);

COMMENT ON TABLE users IS 'Application users scoped to a tenant.';

-- ---------------------------------------------------------------------------
-- tracks
-- ---------------------------------------------------------------------------
CREATE TABLE tracks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  full_price numeric(10, 2) NOT NULL CHECK (full_price >= 0)
);

COMMENT ON TABLE tracks IS 'Purchasable learning tracks.';

-- ---------------------------------------------------------------------------
-- track_enrollments
-- ---------------------------------------------------------------------------
CREATE TABLE track_enrollments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
  student_id    uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  track_id      uuid NOT NULL REFERENCES tracks (id) ON DELETE RESTRICT,
  status        text NOT NULL DEFAULT 'active',
  is_discounted boolean NOT NULL DEFAULT false,
  price_paid    numeric(10, 2) NOT NULL CHECK (price_paid >= 0),
  purchased_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT track_enrollments_status_check
    CHECK (status IN ('active', 'completed', 'cancelled', 'withdrawn', 'pending'))
);

CREATE INDEX track_enrollments_tenant_id_idx ON track_enrollments (tenant_id);
CREATE INDEX track_enrollments_student_id_idx ON track_enrollments (student_id);
CREATE INDEX track_enrollments_track_id_idx ON track_enrollments (track_id);
CREATE INDEX track_enrollments_student_active_idx
  ON track_enrollments (student_id)
  WHERE status = 'active';

-- At most one active discounted enrollment per student (second slot only).
CREATE UNIQUE INDEX track_enrollments_one_active_discounted_per_student_idx
  ON track_enrollments (student_id)
  WHERE status = 'active' AND is_discounted = true;

COMMENT ON TABLE track_enrollments IS
  'Student purchases/enrollments in tracks. Active enrollments are capped at two per student with discount rules enforced by trigger.';

-- ---------------------------------------------------------------------------
-- Enrollment rules (INSERT + UPDATE when becoming/changing active rows)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_track_enrollment_rules()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  active_count integer;
BEGIN
  -- Rules apply only to active enrollments; inactive rows do not consume a slot.
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  -- Serialize per-student enrollment mutations to prevent concurrent inserts
  -- from bypassing the max-2-active and discount-order constraints.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.student_id::text));

  SELECT count(*)
  INTO active_count
  FROM track_enrollments
  WHERE student_id = NEW.student_id
    AND status = 'active'
    AND (TG_OP = 'INSERT' OR id IS DISTINCT FROM NEW.id);

  IF active_count >= 2 THEN
    RAISE EXCEPTION
      'student % cannot have more than 2 active track enrollments (currently %)',
      NEW.student_id, active_count;
  END IF;

  -- First active enrollment must be full price; second must be discounted.
  IF active_count = 0 AND NEW.is_discounted THEN
    RAISE EXCEPTION
      'first active enrollment for student % must not be discounted',
      NEW.student_id;
  END IF;

  IF active_count = 1 AND NOT NEW.is_discounted THEN
    RAISE EXCEPTION
      'second active enrollment for student % must be discounted',
      NEW.student_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_track_enrollment_rules() IS
  'BEFORE INSERT/UPDATE on track_enrollments: advisory lock per student, max 2 active enrollments, first full-price then discounted.';

CREATE TRIGGER track_enrollments_enforce_rules
  BEFORE INSERT OR UPDATE OF status, is_discounted
  ON track_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION enforce_track_enrollment_rules();

-- ---------------------------------------------------------------------------
-- lessons
-- ---------------------------------------------------------------------------
CREATE TABLE lessons (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id            uuid NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  tier                text NOT NULL,
  lesson_type         text NOT NULL,
  sort_order          integer NOT NULL CHECK (sort_order >= 0),
  title               text NOT NULL,
  learning_objectives text,
  dcwf_code           text
);

CREATE INDEX lessons_track_id_idx ON lessons (track_id);

COMMENT ON TABLE lessons IS 'Ordered lessons belonging to a track.';

-- ---------------------------------------------------------------------------
-- lesson_progress
-- ---------------------------------------------------------------------------
CREATE TABLE lesson_progress (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  lesson_id    uuid NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'not_started',
  submitted_at timestamptz,
  CONSTRAINT lesson_progress_status_check
    CHECK (status IN ('not_started', 'in_progress', 'submitted', 'completed', 'reviewed')),
  CONSTRAINT lesson_progress_student_lesson_unique UNIQUE (student_id, lesson_id)
);

CREATE INDEX lesson_progress_student_id_idx ON lesson_progress (student_id);
CREATE INDEX lesson_progress_lesson_id_idx ON lesson_progress (lesson_id);

COMMENT ON TABLE lesson_progress IS 'Per-student completion state for individual lessons.';

-- ---------------------------------------------------------------------------
-- oscal_findings
-- ---------------------------------------------------------------------------
CREATE TABLE oscal_findings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants (id) ON DELETE RESTRICT,
  student_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  track_id          uuid NOT NULL REFERENCES tracks (id) ON DELETE RESTRICT,
  lesson_id         uuid NOT NULL REFERENCES lessons (id) ON DELETE RESTRICT,
  control_id        text NOT NULL,
  catalog_source    text NOT NULL,
  finding_state     text NOT NULL DEFAULT 'draft',
  observation       jsonb NOT NULL DEFAULT '{}'::jsonb,
  student_narrative text,
  dcwf_code         text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oscal_findings_finding_state_check
    CHECK (finding_state IN ('draft', 'submitted', 'under_review', 'accepted', 'rejected'))
);

CREATE INDEX oscal_findings_tenant_id_idx ON oscal_findings (tenant_id);
CREATE INDEX oscal_findings_student_id_idx ON oscal_findings (student_id);
CREATE INDEX oscal_findings_track_id_idx ON oscal_findings (track_id);
CREATE INDEX oscal_findings_lesson_id_idx ON oscal_findings (lesson_id);
CREATE INDEX oscal_findings_control_id_idx ON oscal_findings (control_id);

COMMENT ON TABLE oscal_findings IS 'Student OSCAL control findings tied to lessons and tracks.';
