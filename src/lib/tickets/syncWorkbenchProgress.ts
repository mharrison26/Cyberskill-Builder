import { normalizeTicketStatus } from '@/lib/tickets/status';
import type { TicketProgressStatus } from '@/types';

export type WorkbenchProgressSnapshot = {
  status: TicketProgressStatus;
  startedAt: string | null;
  resolvedAt: string | null;
  slaDueAt: string | null;
  slaMet: boolean | null;
};

export type SubmitProgressPayload = {
  progressStatus?: unknown;
  startedAt?: unknown;
  slaStartedAt?: unknown;
  resolvedAt?: unknown;
  slaResolvedAt?: unknown;
  slaDueAt?: unknown;
  slaMet?: unknown;
  status?: unknown;
};

/**
 * Optimistic transition when a submit request begins.
 * Opening is required before submit, so we only advance new → in_progress
 * if the client somehow still shows new (defensive).
 */
export function optimisticProgressOnSubmitStart(
  current: WorkbenchProgressSnapshot,
  nowIso: string = new Date().toISOString()
): WorkbenchProgressSnapshot {
  if (current.status === 'new') {
    return {
      ...current,
      status: 'in_progress',
      startedAt: current.startedAt ?? nowIso,
      resolvedAt: null,
      slaMet: null,
    };
  }
  return current;
}

/** Map a successful submit API body onto workbench header state. */
export function progressFromSubmitPayload(
  payload: SubmitProgressPayload,
  fallback: WorkbenchProgressSnapshot
): WorkbenchProgressSnapshot {
  const rawStatus =
    typeof payload.progressStatus === 'string'
      ? payload.progressStatus
      : typeof payload.status === 'string' &&
          (payload.status === 'resolved' ||
            payload.status === 'needs_revision' ||
            payload.status === 'in_progress' ||
            payload.status === 'new' ||
            payload.status === 'reviewed')
        ? payload.status === 'needs_revision'
          ? 'in_progress'
          : payload.status
        : fallback.status;

  const status = normalizeTicketStatus(rawStatus);

  const startedAt =
    readIso(payload.slaStartedAt) ??
    readIso(payload.startedAt) ??
    fallback.startedAt;

  const resolvedAt =
    status === 'resolved' || status === 'reviewed'
      ? (readIso(payload.slaResolvedAt) ??
        readIso(payload.resolvedAt) ??
        fallback.resolvedAt ??
        new Date().toISOString())
      : null;

  const slaDueAt = readIso(payload.slaDueAt) ?? fallback.slaDueAt;

  let slaMet: boolean | null = fallback.slaMet;
  if (typeof payload.slaMet === 'boolean') {
    slaMet = payload.slaMet;
  } else if (status !== 'resolved' && status !== 'reviewed') {
    slaMet = null;
  }

  return {
    status,
    startedAt,
    resolvedAt,
    slaDueAt,
    slaMet,
  };
}

export function isTicketSubmitUrl(url: string, ticketId: string): boolean {
  try {
    const parsed = new URL(url, 'http://local.invalid');
    return (
      parsed.pathname === `/api/tickets/${ticketId}/submit` ||
      parsed.pathname.endsWith(`/api/tickets/${ticketId}/submit`)
    );
  } catch {
    return url.includes(`/api/tickets/${ticketId}/submit`);
  }
}

function readIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  return value;
}
