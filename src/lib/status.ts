import type { FindingState, ProgressStatus } from '@/types';

export type LessonProgressDisplayStatus =
  'submitted' | 'graded' | 'in_progress';

export type StatusKey =
  ProgressStatus | FindingState | LessonProgressDisplayStatus;

export const STATUS_LABELS: Record<StatusKey, string> = {
  satisfied: 'Satisfied',
  insufficient_evidence: 'Insufficient evidence',
  not_satisfied: 'Not satisfied',
  not_started: 'Not Started',
  submitted: 'Submitted',
  graded: 'Graded',
  in_progress: 'In Progress',
};

export const STATUS_DESCRIPTIONS: Record<StatusKey, string> = {
  satisfied: 'Control requirement met with adequate evidence',
  insufficient_evidence: 'Partial progress; additional evidence required',
  not_satisfied: 'Requirement not met or blocked',
  not_started: 'Lesson has not been started',
  submitted: 'Lesson submitted and awaiting review',
  graded: 'Lesson completed and graded',
  in_progress: 'Lesson work is in progress',
};

export function normalizeStatus(status: string): StatusKey {
  const normalized = status.toLowerCase().replace(/-/g, '_');
  if (normalized in STATUS_LABELS) {
    return normalized as StatusKey;
  }
  return 'not_started';
}

/** Maps DB finding_state values to display keys for StatusBadge. */
export function normalizeFindingState(findingState: string): StatusKey {
  const normalized = findingState.toLowerCase().replace(/-/g, '_');
  switch (normalized) {
    case 'satisfied':
    case 'accepted':
      return 'satisfied';
    case 'not_satisfied':
    case 'rejected':
      return 'not_satisfied';
    case 'insufficient_evidence':
    case 'under_review':
      return 'insufficient_evidence';
    case 'draft':
    case 'submitted':
      return 'submitted';
    default:
      return normalizeStatus(normalized);
  }
}

export function isLessonGradedStatus(
  status: string | null | undefined
): boolean {
  return status === 'completed' || status === 'reviewed' || status === 'graded';
}

export function getStatusColorClass(status: StatusKey): string {
  switch (status) {
    case 'satisfied':
    case 'graded':
      return 'bg-status-satisfied text-status-satisfied-foreground border-status-satisfied-foreground/20';
    case 'insufficient_evidence':
    case 'submitted':
    case 'in_progress':
      return 'bg-status-insufficient text-status-insufficient-foreground border-status-insufficient-foreground/20';
    case 'not_satisfied':
      return 'bg-status-blocked text-status-blocked-foreground border-status-blocked-foreground/20';
    case 'not_started':
    default:
      return 'bg-status-not-started text-status-not-started-foreground border-status-not-started-foreground/20';
  }
}
