import type { TicketProgressStatus } from '@/types';

export const TICKET_STATUS_LABELS: Record<TicketProgressStatus, string> = {
  new: 'New',
  in_progress: 'In Progress',
  resolved: 'Resolved',
};

export function isTicketProgressStatus(
  value: string | null | undefined
): value is TicketProgressStatus {
  return value === 'new' || value === 'in_progress' || value === 'resolved';
}

export function normalizeTicketStatus(
  status: string | null | undefined
): TicketProgressStatus {
  if (isTicketProgressStatus(status)) return status;
  return 'new';
}

export function isOpenTicketStatus(status: TicketProgressStatus): boolean {
  return status === 'new' || status === 'in_progress';
}

/** CSS classes aligned with StatusBadge / lesson status tokens. */
export function getTicketStatusColorClass(
  status: TicketProgressStatus
): string {
  switch (status) {
    case 'resolved':
      return 'bg-status-satisfied text-status-satisfied-foreground border-status-satisfied-foreground/20';
    case 'in_progress':
      return 'bg-status-insufficient text-status-insufficient-foreground border-status-insufficient-foreground/20';
    case 'new':
    default:
      return 'bg-status-not-started text-status-not-started-foreground border-status-not-started-foreground/20';
  }
}
