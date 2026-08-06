import type { FindingState, ProgressStatus } from '@/types';

export type StatusKey = ProgressStatus | FindingState;

export const STATUS_LABELS: Record<StatusKey, string> = {
  satisfied: 'Satisfied',
  insufficient_evidence: 'Insufficient evidence',
  not_satisfied: 'Not satisfied',
  not_started: 'Not started',
};

export const STATUS_DESCRIPTIONS: Record<StatusKey, string> = {
  satisfied: 'Control requirement met with adequate evidence',
  insufficient_evidence: 'Partial progress; additional evidence required',
  not_satisfied: 'Requirement not met or blocked',
  not_started: 'Assessment has not begun',
};

export function normalizeStatus(status: string): StatusKey {
  const normalized = status.toLowerCase().replace(/-/g, '_');
  if (normalized in STATUS_LABELS) {
    return normalized as StatusKey;
  }
  return 'not_started';
}

export function getStatusColorClass(status: StatusKey): string {
  switch (status) {
    case 'satisfied':
      return 'bg-status-satisfied text-status-satisfied-foreground border-status-satisfied-foreground/20';
    case 'insufficient_evidence':
      return 'bg-status-insufficient text-status-insufficient-foreground border-status-insufficient-foreground/20';
    case 'not_satisfied':
      return 'bg-status-blocked text-status-blocked-foreground border-status-blocked-foreground/20';
    case 'not_started':
    default:
      return 'bg-status-not-started text-status-not-started-foreground border-status-not-started-foreground/20';
  }
}
