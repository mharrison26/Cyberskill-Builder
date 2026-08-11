export type SlaState = {
  /** Milliseconds remaining until SLA breach; negative when overdue. */
  remainingMs: number;
  isOverdue: boolean;
  /** True when the ticket has not been started (no countdown yet). */
  notStarted: boolean;
  deadlineAt: Date | null;
  /** True when the countdown is frozen at resolve time. */
  isFrozen: boolean;
  /** Server/client met flag when resolved; null while open or unknown. */
  slaMet: boolean | null;
};

export type GetSlaStateOptions = {
  /** Freeze the clock at this instant (typically resolved_at / sla_resolved_at). */
  resolvedAt?: string | null;
  /** Precomputed deadline; when omitted, startedAt + slaMinutes is used. */
  slaDueAt?: string | null;
  /** Server-computed met/breached for resolved tickets. */
  slaMet?: boolean | null;
};

export function computeSlaDueAt(
  startedAt: string | null | undefined,
  slaMinutes: number
): string | null {
  if (!startedAt) return null;
  if (!Number.isFinite(slaMinutes) || slaMinutes < 0) return null;
  const startedMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedMs)) return null;
  return new Date(startedMs + slaMinutes * 60_000).toISOString();
}

export function getSlaState(
  slaMinutes: number,
  startedAt: string | null | undefined,
  nowMs: number = Date.now(),
  options: GetSlaStateOptions = {}
): SlaState {
  if (!startedAt) {
    return {
      remainingMs: slaMinutes * 60_000,
      isOverdue: false,
      notStarted: true,
      deadlineAt: null,
      isFrozen: false,
      slaMet: null,
    };
  }

  const startedMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedMs)) {
    return {
      remainingMs: slaMinutes * 60_000,
      isOverdue: false,
      notStarted: true,
      deadlineAt: null,
      isFrozen: false,
      slaMet: null,
    };
  }

  const dueMs = options.slaDueAt
    ? new Date(options.slaDueAt).getTime()
    : startedMs + slaMinutes * 60_000;
  if (Number.isNaN(dueMs)) {
    return {
      remainingMs: slaMinutes * 60_000,
      isOverdue: false,
      notStarted: true,
      deadlineAt: null,
      isFrozen: false,
      slaMet: null,
    };
  }

  const deadlineAt = new Date(dueMs);
  const resolvedMs = options.resolvedAt
    ? new Date(options.resolvedAt).getTime()
    : Number.NaN;
  const isFrozen = Boolean(options.resolvedAt) && !Number.isNaN(resolvedMs);
  const clockMs = isFrozen ? resolvedMs : nowMs;
  const remainingMs = dueMs - clockMs;
  const slaMet =
    typeof options.slaMet === 'boolean'
      ? options.slaMet
      : isFrozen
        ? remainingMs >= 0
        : null;

  return {
    remainingMs,
    isOverdue: remainingMs < 0,
    notStarted: false,
    deadlineAt,
    isFrozen,
    slaMet,
  };
}

export function formatSlaCountdown(remainingMs: number): string {
  const absMs = Math.abs(remainingMs);
  const totalSeconds = Math.floor(absMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  const core =
    hours > 0
      ? `${hours}:${pad(minutes)}:${pad(seconds)}`
      : `${minutes}:${pad(seconds)}`;

  return remainingMs < 0 ? `-${core}` : core;
}

/**
 * Whether a ticket row should keep a live SLA interval ticking.
 * Resolved tickets (resolvedAt / slaMet / closed status) stay frozen.
 */
export function needsLiveSlaCountdown(
  startedAt: string | null | undefined,
  options: {
    resolvedAt?: string | null;
    slaMet?: boolean | null;
    /** True when status is resolved/reviewed. */
    closed?: boolean;
  } = {}
): boolean {
  if (!startedAt) return false;
  if (options.closed) return false;
  if (options.resolvedAt) return false;
  if (typeof options.slaMet === 'boolean') return false;
  return true;
}

export type SlaResolutionInput = {
  startedAt: string | null | undefined;
  resolvedAt: string | null | undefined;
  slaMinutes: number;
};

/**
 * Whether a resolved ticket finished within its SLA window.
 * Returns null when timestamps are missing/invalid (not countable).
 */
export function wasResolvedWithinSla(
  startedAt: string | null | undefined,
  resolvedAt: string | null | undefined,
  slaMinutes: number
): boolean | null {
  if (!startedAt || !resolvedAt) return null;
  if (!Number.isFinite(slaMinutes) || slaMinutes < 0) return null;

  const startedMs = new Date(startedAt).getTime();
  const resolvedMs = new Date(resolvedAt).getTime();
  if (Number.isNaN(startedMs) || Number.isNaN(resolvedMs)) return null;

  return resolvedMs - startedMs <= slaMinutes * 60_000;
}

/**
 * Percentage of countable resolved tickets completed within SLA.
 * Returns null when there are no countable resolutions.
 */
export function computeSlaCompliancePercent(
  items: SlaResolutionInput[]
): number | null {
  let total = 0;
  let within = 0;

  for (const item of items) {
    const result = wasResolvedWithinSla(
      item.startedAt,
      item.resolvedAt,
      item.slaMinutes
    );
    if (result === null) continue;
    total += 1;
    if (result) within += 1;
  }

  if (total === 0) return null;
  return Math.round((within / total) * 100);
}
