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

/** Authoring payload stored in lessons.content (GRC Lesson Content sheet). */
export interface LessonContentPayload {
  sheetId?: string;
  scenarioBrief?: string;
  gradingFocus?: string;
  keyArtifact?: string;
  cursorPrompt?: string;
  source?: string;
  /** Optional markdown body; when absent UI renders scenarioBrief. */
  body?: string;
  [key: string]: unknown;
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
  /** Optional prerequisite lesson (e.g. IAM lab for tool walkthroughs). */
  depends_on_lesson_id?: string | null;
  /** Scenario / rubric payload from the GRC Lesson Content sheet. */
  content?: LessonContentPayload | null;
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

export type TicketProgressStatus =
  'new' | 'in_progress' | 'resolved' | 'reviewed';

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
  /** Optional multi-stage engagement grouping (PI-02 / engagements migration). */
  engagement_id?: string | null;
  /** 1-based stage within engagement; null when not in an engagement. */
  engagement_stage?: number | null;
  /**
   * Max graded attempts for this scenario (migration 20260811010000+).
   * Null → app default (3).
   */
  max_attempts?: number | null;
}

export interface TicketProgress {
  id: string;
  student_id: string;
  ticket_id: string;
  status: TicketProgressStatus;
  /** SLA clock start (sla_started_at). */
  started_at: string | null;
  /** SLA resolution timestamp (sla_resolved_at). */
  resolved_at: string | null;
  /** Latest submission payload when present (migration 0024+). */
  submission?: Record<string, unknown> | null;
  /** Server-computed deadline (started_at + sla_minutes). */
  sla_due_at?: string | null;
  /** Whether latest resolution met SLA; null while open. */
  sla_met?: boolean | null;
  last_score_status?: 'resolved' | 'needs_revision' | null;
  last_feedback?: string | null;
  last_structured_result?: Record<string, unknown> | null;
  attempt_count?: number;
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

/** Simulated directory user for mock_directory / helpdesk tickets. */
export type {
  MockDirectoryActionType,
  MockDirectoryLoggedAction,
  MockDirectoryUser,
  MockDirectoryUserStatus,
} from '@/lib/scoring/ticketUi';

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
  /** ISO timestamp for ledger display. */
  createdAt?: string;
  /** Public portfolio visibility (matches finding toggle pattern). */
  isPublic?: boolean;
  /** Optional verbal defense recording (mock Storage object). */
  defense?: MockDefenseRecording | null;
  /** Sample AO/interview prompts the student would answer verbally. */
  promptQuestions?: Array<{ id?: string; prompt: string; focus?: string }>;
}

/** Browser-recorded verbal/video defense artifact. */
export interface MockDefenseRecording {
  id: string;
  /** Object path or blob URL for playback. */
  url: string;
  mediaType: 'audio' | 'video';
  durationSeconds: number;
  isPublic: boolean;
  createdAt: string;
}

/** Track console ticket row used by useTrackTickets (mock → Supabase later). */
export interface MockTrackTicket {
  id: string;
  trackSlug: string;
  title: string;
  subtitle?: string;
  ticketType: string;
  difficulty: string;
  slaMinutes: number;
  startedAt: string | null;
  status: TicketProgressStatus;
  /** GRC / ISSO / ISSM: control family or engagement label. */
  controlFamily?: string;
  controlId?: string;
  /** Severity for compliance findings (critical/high/medium/low). */
  severity?: 'critical' | 'high' | 'medium' | 'low';
  /** POA&M due date (ISO date) when applicable. */
  poamDueAt?: string | null;
  /** HelpDesk: requester display name. */
  requester?: string;
  /** HelpDesk queue bucket for filter tabs. */
  queueBucket?: 'my_queue' | 'unassigned' | 'escalated';
  /** Sysadmin: hostname / asset id. */
  hostname?: string;
  /** Auditor: engagement folder title. */
  engagementTitle?: string;
  /** Auditor workpaper checklist lines. */
  workpaperItems?: Array<{ id: string; label: string; done: boolean }>;
  /** Optional issue-tracker / console labels. */
  labels?: string[];
  /** ISSO: system / authorization boundary name. */
  systemName?: string;
  /** ISSM: program or authorization package stage. */
  packageStage?: string;
  dcwfCode?: string | null;
  sortOrder: number;
  /** live = Supabase row; mock = placeholder console data. */
  source?: 'live' | 'mock';
  /** Workbench URL when source is live. */
  workbenchHref?: string | null;
  /** Raw ticket.initial_state for sandbox embedding. */
  initialState?: Record<string, unknown>;
  /** Raw ticket.expected_state for sandbox embedding. */
  expectedState?: Record<string, unknown>;
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
  /** Finding rows are reviewable; pending_submission rows await AI grading. */
  rowKind?: 'finding' | 'pending_submission';
  gradingError?: string | null;
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
