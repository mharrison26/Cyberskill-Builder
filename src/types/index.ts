export type ProgressStatus =
  'satisfied' | 'insufficient_evidence' | 'not_satisfied' | 'not_started';

export type FindingState =
  'satisfied' | 'insufficient_evidence' | 'not_satisfied' | 'not_started';

export type LessonType =
  'conceptual' | 'catalog_lab' | 'artifact_lab' | 'tool_walkthrough';

export type LessonTier = 'foundation' | 'intermediate' | 'advanced';

/** DCWF work role catalog row (public.work_role_codes). */
export interface WorkRoleCode {
  code: string;
  title: string;
  workforce_element: string | null;
  legacy_8570_category: string | null;
  source_url: string | null;
}

export interface Lesson {
  id: string;
  track_id: string;
  tier: LessonTier | string;
  lesson_type: LessonType;
  sort_order: number;
  title: string;
  learning_objectives: string | null;
  /** FK → work_role_codes.code (nullable). */
  dcwf_code: string | null;
}

/** Ticket content model (parallel to lessons). Tier is 1 | 2 | 3. */
export type TicketTier = 1 | 2 | 3;

/** Reference row in public.control_mappings (framework crosswalk). */
export type ControlMappingConfidence = 'high' | 'medium' | 'low';

export type ControlMappingFramework = 'nist_800_53' | 'soc2' | 'iso27001';

export interface ControlMapping {
  id: string;
  source_framework: ControlMappingFramework;
  source_control_id: string;
  target_framework: ControlMappingFramework;
  target_control_id: string;
  mapping_confidence: ControlMappingConfidence;
}

export type TicketProgressStatus = 'new' | 'in_progress' | 'resolved';

export interface Ticket {
  id: string;
  tenant_id: string;
  track_id: string;
  tier: number;
  ticket_type: string;
  difficulty: string;
  sla_minutes: number;
  scenario_brief: string;
  initial_state: Record<string, unknown>;
  /** Deterministic scoring ruleset (migration 0026+). Default `{}`. */
  expected_state: Record<string, unknown>;
  /** FK → work_role_codes.code (nullable). */
  dcwf_code: string | null;
  sort_order: number;
}

export interface TicketProgress {
  id: string;
  student_id: string;
  ticket_id: string;
  status: TicketProgressStatus;
  started_at: string | null;
  resolved_at: string | null;
  /** Latest submission payload when present (migration 0024+). */
  submission?: Record<string, unknown> | null;
}

/** Fly Machines sandbox session (migration 0025+; PI-12 cost tracking). */
export type SandboxSessionStatus = 'running' | 'stopped' | 'expired';

export interface SandboxSession {
  id: string;
  ticket_id: string;
  student_id: string;
  tenant_id: string;
  machine_id: string;
  machine_name: string | null;
  region: string | null;
  status: SandboxSessionStatus;
  started_at: string;
  stopped_at: string | null;
  duration_seconds: number | null;
  idle_timeout_minutes: number;
  expires_at: string;
  stop_reason: string | null;
  created_at: string;
}

/** Daily Fly sandbox machine-hours per tenant (migration 0028+). */
export interface SandboxUsage {
  id: string;
  tenant_id: string;
  usage_date: string;
  machine_hours: number;
  machine_count: number;
  created_at: string;
  updated_at: string;
}

/** Unified portfolio artifact kinds (public.portfolio_items.item_kind). */
export type PortfolioItemKind = 'oscal_finding' | 'ticket_resolution';

export type PortfolioScoreStatus = 'resolved' | 'needs_revision';

export interface PortfolioItem {
  id: string;
  tenant_id: string;
  student_id: string;
  track_id: string;
  tier: string | null;
  item_kind: PortfolioItemKind;
  title: string;
  /** FK → work_role_codes.code (nullable). */
  dcwf_code: string | null;
  structured_result: Record<string, unknown>;
  narrative: string | null;
  is_public: boolean;
  /** Track flagship capstone (AO review); sorts first on public portfolio. */
  is_flagship?: boolean;
  created_at: string;
  ticket_id?: string | null;
  lesson_id?: string | null;
  oscal_finding_id?: string | null;
  ticket_type?: string | null;
  score_status?: PortfolioScoreStatus | null;
  submission?: Record<string, unknown> | null;
  updated_at?: string;
}

export interface MockUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
}

export interface MockTrack {
  id: string;
  slug: string;
  name: string;
  description: string;
}

export interface MockLesson {
  id: string;
  trackSlug: string;
  tier: LessonTier;
  lessonType: LessonType;
  sortOrder: number;
  title: string;
  learningObjectives: string[];
  dcwfCode: string;
  status: ProgressStatus;
  content?: string;
  evidenceJson?: string;
}

export interface MockControl {
  id: string;
  family: string;
  title: string;
  statement: string;
}

export interface MockFinding {
  id: string;
  controlId: string;
  findingState: FindingState;
  dcwfCode: string;
  dcwfTitle?: string;
  narrative: string;
}

export interface MockGradingQueueItem {
  id: string;
  studentName: string;
  studentEmail: string;
  lessonTitle: string;
  trackName: string;
  aiFindingState: FindingState;
  reviewed: boolean;
}

export interface AdminGradingRow {
  id: string;
  studentEmail: string;
  lessonTitle: string;
  trackName: string;
  controlId: string;
  findingState: string;
  aiFeedback: string;
  aiFeedbackPreview: string;
  submissionPreview: string;
  submissionFull: string;
  isReviewed: boolean;
}

export interface CCCERValues {
  condition: string;
  criteria: string;
  cause: string;
  effect: string;
  recommendation: string;
}

/** POA&M remediation entry (public.poam_items / ticket submission). */
export type PoamItemStatus =
  'open' | 'ongoing' | 'completed' | 'delayed' | 'risk_accepted';

export interface PoamItem {
  id: string;
  tenant_id: string;
  student_id: string;
  track_id: string;
  ticket_id?: string | null;
  finding_id: string;
  oscal_finding_id?: string | null;
  weakness_description: string;
  milestone: string;
  scheduled_completion_date: string;
  status: PoamItemStatus;
  created_at: string;
  updated_at: string;
}

/** Seed prior finding shown in a POA&M ticket initial_state. */
export interface PoamPriorFindingSeed {
  id: string;
  control_id?: string;
  title?: string;
  summary: string;
  finding_state?: string;
}
