import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  P1_STATUS_UPDATES_DEFAULT_TOLERANCE_MINUTES,
  P1_STATUS_UPDATES_MIN_FIELD_LENGTH,
  formatSimClock,
} from '@/lib/scoring/ticketUi';

/**
 * P1 outage stakeholder status-update scoring.
 *
 * Fully deterministic:
 *   1. Cadence — each required simulated post time has a student update
 *      within tolerance minutes.
 *   2. Content — each matched update covers impact, ETA, and next-update-time
 *      (min length + next-update in the future; optional promise check against
 *      the next required slot).
 *
 * initial_state:
 *   {
 *     ticketCode?, outage: { title, service, summary, impactFacts, ... },
 *     channel: { name, stakeholders? },
 *     clock: { startSimMinutes?, maxSimMinutes?, advanceStepsMinutes? }
 *   }
 *
 * expected_state:
 *   {
 *     requiredUpdateTimes?: number[];           // absolute sim minutes
 *     requiredCadenceMinutes?: number;          // derive times with window
 *     incidentWindowMinutes?: number;
 *     cadenceToleranceMinutes?: number;         // default 5
 *     minFieldLength?: number;                  // default 20
 *     requireNextUpdatePromise?: boolean;       // default true
 *   }
 *
 * submission:
 *   {
 *     type: 'p1_status_updates',
 *     updates: Array<{
 *       postedAtSimMinutes: number;
 *       impact: string;
 *       eta: string;
 *       nextUpdateAtSimMinutes: number;
 *     }>
 *   }
 */

export {
  P1_STATUS_UPDATES_MIN_FIELD_LENGTH,
  P1_STATUS_UPDATES_DEFAULT_TOLERANCE_MINUTES,
  formatSimClock,
} from '@/lib/scoring/ticketUi';

export type P1StatusUpdateEntry = {
  postedAtSimMinutes: number;
  impact: string;
  eta: string;
  nextUpdateAtSimMinutes: number;
};

export type P1StatusUpdatesExpectedState = {
  requiredUpdateTimes?: number[];
  requiredCadenceMinutes?: number;
  incidentWindowMinutes?: number;
  cadenceToleranceMinutes?: number;
  minFieldLength?: number;
  /** When true, nextUpdateAt must land near the next required slot (non-final). */
  requireNextUpdatePromise?: boolean;
};

export type P1StatusUpdatesSubmission = {
  type?: string;
  updates: P1StatusUpdateEntry[];
};

export type P1CadenceMatch = {
  requiredTime: number;
  matched: boolean;
  updateIndex: number | null;
  deltaMinutes: number | null;
};

export type P1UpdateContentResult = {
  updateIndex: number;
  postedAtSimMinutes: number;
  impactOk: boolean;
  etaOk: boolean;
  nextUpdatePresent: boolean;
  nextUpdateInFuture: boolean;
  nextUpdatePromiseOk: boolean;
  fieldsOk: boolean;
  missing: string[];
};

export type P1StatusUpdatesStructuredResult = {
  style: 'p1_status_updates';
  requiredTimes: number[];
  toleranceMinutes: number;
  minFieldLength: number;
  updateCount: number;
  cadenceMatchedCount: number;
  cadenceRequiredCount: number;
  cadenceOk: boolean;
  contentOk: boolean;
  cadenceMatches: P1CadenceMatch[];
  contentResults: P1UpdateContentResult[];
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function readNonNegInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  return n >= 0 ? n : null;
}

function readPositiveInt(value: unknown): number | null {
  const n = readNonNegInt(value);
  return n !== null && n > 0 ? n : null;
}

export function parseP1StatusUpdatesExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): P1StatusUpdatesExpectedState {
  if (!isPlainObject(expectedState)) return {};

  let requiredUpdateTimes: number[] | undefined;
  const rawTimes =
    expectedState.requiredUpdateTimes ?? expectedState.required_update_times;
  if (Array.isArray(rawTimes)) {
    const times = rawTimes
      .map((item) => readNonNegInt(item))
      .filter((item): item is number => item !== null);
    if (times.length > 0) {
      requiredUpdateTimes = Array.from(new Set(times)).sort((a, b) => a - b);
    }
  }

  const requiredCadenceMinutes = readPositiveInt(
    expectedState.requiredCadenceMinutes ??
      expectedState.required_cadence_minutes ??
      expectedState.cadenceMinutes
  );

  const incidentWindowMinutes = readPositiveInt(
    expectedState.incidentWindowMinutes ?? expectedState.incident_window_minutes
  );

  const cadenceToleranceMinutes = readNonNegInt(
    expectedState.cadenceToleranceMinutes ??
      expectedState.cadence_tolerance_minutes ??
      expectedState.toleranceMinutes
  );

  const minFieldLength = readPositiveInt(
    expectedState.minFieldLength ?? expectedState.min_field_length
  );

  const requireNextUpdatePromise =
    typeof expectedState.requireNextUpdatePromise === 'boolean'
      ? expectedState.requireNextUpdatePromise
      : typeof expectedState.require_next_update_promise === 'boolean'
        ? expectedState.require_next_update_promise
        : undefined;

  return {
    requiredUpdateTimes,
    requiredCadenceMinutes: requiredCadenceMinutes ?? undefined,
    incidentWindowMinutes: incidentWindowMinutes ?? undefined,
    cadenceToleranceMinutes: cadenceToleranceMinutes ?? undefined,
    minFieldLength: minFieldLength ?? undefined,
    requireNextUpdatePromise,
  };
}

export function resolveIncidentWindowMinutes(
  expected: P1StatusUpdatesExpectedState,
  initialState: Record<string, unknown> | null | undefined
): number {
  if (expected.incidentWindowMinutes) return expected.incidentWindowMinutes;
  const initial = asRecord(initialState);
  const clock = asRecord(initial.clock);
  const fromClock = readPositiveInt(
    clock.maxSimMinutes ?? clock.max_sim_minutes ?? clock.endSimMinutes
  );
  if (fromClock) return fromClock;
  return 90;
}

/**
 * Resolve absolute required post times (sim minutes from incident start).
 * Prefer explicit requiredUpdateTimes; otherwise expand cadence across the window.
 */
export function resolveRequiredUpdateTimes(
  expected: P1StatusUpdatesExpectedState,
  initialState?: Record<string, unknown> | null
): number[] {
  if (expected.requiredUpdateTimes && expected.requiredUpdateTimes.length > 0) {
    return [...expected.requiredUpdateTimes].sort((a, b) => a - b);
  }

  const cadence = expected.requiredCadenceMinutes;
  if (!cadence) return [];

  const window = resolveIncidentWindowMinutes(expected, initialState);
  const times: number[] = [];
  for (let t = 0; t < window; t += cadence) {
    times.push(t);
  }
  return times;
}

export function extractP1StatusUpdatesSubmission(
  submission: TicketSubmission
): P1StatusUpdatesSubmission | null {
  const rawUpdates = submission.updates ?? submission.statusUpdates;
  if (!Array.isArray(rawUpdates)) return null;

  const updates: P1StatusUpdateEntry[] = [];

  for (const entry of rawUpdates) {
    if (!isPlainObject(entry)) continue;

    const postedAtSimMinutes = readNonNegInt(
      entry.postedAtSimMinutes ?? entry.posted_at_sim_minutes ?? entry.postedAt
    );
    if (postedAtSimMinutes === null) continue;

    const impact =
      typeof entry.impact === 'string'
        ? entry.impact.trim()
        : typeof entry.impactSummary === 'string'
          ? entry.impactSummary.trim()
          : '';

    const eta =
      typeof entry.eta === 'string'
        ? entry.eta.trim()
        : typeof entry.etaText === 'string'
          ? entry.etaText.trim()
          : typeof entry.estimatedResolution === 'string'
            ? entry.estimatedResolution.trim()
            : '';

    const nextUpdateAtSimMinutes = readNonNegInt(
      entry.nextUpdateAtSimMinutes ??
        entry.next_update_at_sim_minutes ??
        entry.nextUpdateAt ??
        entry.nextUpdateTime
    );
    if (nextUpdateAtSimMinutes === null) continue;

    updates.push({
      postedAtSimMinutes,
      impact,
      eta,
      nextUpdateAtSimMinutes,
    });
  }

  if (updates.length === 0) return null;

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'p1_status_updates',
    updates,
  };
}

export function matchCadenceSlots(
  requiredTimes: number[],
  updates: P1StatusUpdateEntry[],
  toleranceMinutes: number
): P1CadenceMatch[] {
  const used = new Set<number>();
  const matches: P1CadenceMatch[] = [];

  for (const requiredTime of requiredTimes) {
    let bestIdx: number | null = null;
    let bestDelta = Infinity;

    for (let i = 0; i < updates.length; i++) {
      if (used.has(i)) continue;
      const delta = Math.abs(updates[i].postedAtSimMinutes - requiredTime);
      if (delta <= toleranceMinutes && delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    }

    if (bestIdx !== null) {
      used.add(bestIdx);
      matches.push({
        requiredTime,
        matched: true,
        updateIndex: bestIdx,
        deltaMinutes: bestDelta,
      });
    } else {
      matches.push({
        requiredTime,
        matched: false,
        updateIndex: null,
        deltaMinutes: null,
      });
    }
  }

  return matches;
}

function evaluateUpdateContent(
  update: P1StatusUpdateEntry,
  updateIndex: number,
  minFieldLength: number,
  nextRequiredTime: number | null,
  requireNextUpdatePromise: boolean,
  toleranceMinutes: number
): P1UpdateContentResult {
  const impactOk = update.impact.length >= minFieldLength;
  const etaOk = update.eta.length >= minFieldLength;
  const nextUpdatePresent = Number.isFinite(update.nextUpdateAtSimMinutes);
  const nextUpdateInFuture =
    nextUpdatePresent &&
    update.nextUpdateAtSimMinutes > update.postedAtSimMinutes;

  let nextUpdatePromiseOk = true;
  if (requireNextUpdatePromise && nextRequiredTime !== null) {
    nextUpdatePromiseOk =
      nextUpdatePresent &&
      Math.abs(update.nextUpdateAtSimMinutes - nextRequiredTime) <=
        toleranceMinutes;
  } else if (requireNextUpdatePromise && nextRequiredTime === null) {
    // Final slot: only require a future next-update time (or resolution marker).
    nextUpdatePromiseOk = nextUpdateInFuture;
  }

  const missing: string[] = [];
  if (!impactOk) missing.push('impact');
  if (!etaOk) missing.push('eta');
  if (!nextUpdatePresent) missing.push('next_update_time');
  else if (!nextUpdateInFuture) missing.push('next_update_in_future');
  else if (!nextUpdatePromiseOk) missing.push('next_update_promise');

  const fieldsOk =
    impactOk &&
    etaOk &&
    nextUpdatePresent &&
    nextUpdateInFuture &&
    nextUpdatePromiseOk;

  return {
    updateIndex,
    postedAtSimMinutes: update.postedAtSimMinutes,
    impactOk,
    etaOk,
    nextUpdatePresent,
    nextUpdateInFuture,
    nextUpdatePromiseOk,
    fieldsOk,
    missing,
  };
}

export function evaluateP1StatusUpdates(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: P1StatusUpdatesSubmission | null;
  structured: P1StatusUpdatesStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseP1StatusUpdatesExpectedState(ticket.expected_state);
  const requiredTimes = resolveRequiredUpdateTimes(
    expected,
    ticket.initial_state
  );
  const toleranceMinutes =
    expected.cadenceToleranceMinutes ??
    P1_STATUS_UPDATES_DEFAULT_TOLERANCE_MINUTES;
  const minFieldLength =
    expected.minFieldLength ?? P1_STATUS_UPDATES_MIN_FIELD_LENGTH;
  const requireNextUpdatePromise = expected.requireNextUpdatePromise !== false;

  const parsed = extractP1StatusUpdatesSubmission(submission);

  if (requiredTimes.length === 0) {
    const structured: P1StatusUpdatesStructuredResult = {
      style: 'p1_status_updates',
      requiredTimes: [],
      toleranceMinutes,
      minFieldLength,
      updateCount: parsed?.updates.length ?? 0,
      cadenceMatchedCount: 0,
      cadenceRequiredCount: 0,
      cadenceOk: false,
      contentOk: false,
      cadenceMatches: [],
      contentResults: [],
      reason: 'missing_required_times',
    };
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        'Ticket expected_state is missing requiredUpdateTimes or requiredCadenceMinutes; cannot score cadence.',
    };
  }

  if (!parsed) {
    const structured: P1StatusUpdatesStructuredResult = {
      style: 'p1_status_updates',
      requiredTimes,
      toleranceMinutes,
      minFieldLength,
      updateCount: 0,
      cadenceMatchedCount: 0,
      cadenceRequiredCount: requiredTimes.length,
      cadenceOk: false,
      contentOk: false,
      cadenceMatches: requiredTimes.map((requiredTime) => ({
        requiredTime,
        matched: false,
        updateIndex: null,
        deltaMinutes: null,
      })),
      contentResults: [],
      reason: 'missing_updates',
    };
    return {
      parsed: null,
      structured,
      ok: false,
      feedback: `Post stakeholder status updates at the required cadence (${requiredTimes
        .map(formatSimClock)
        .join(
          ', '
        )}). Each update must include impact, ETA, and next-update time.`,
    };
  }

  const cadenceMatches = matchCadenceSlots(
    requiredTimes,
    parsed.updates,
    toleranceMinutes
  );
  const cadenceMatchedCount = cadenceMatches.filter((m) => m.matched).length;
  const cadenceOk = cadenceMatchedCount === requiredTimes.length;

  const contentResults: P1UpdateContentResult[] = [];
  for (let slotIndex = 0; slotIndex < cadenceMatches.length; slotIndex++) {
    const match = cadenceMatches[slotIndex];
    if (!match.matched || match.updateIndex === null) continue;

    const nextRequiredTime =
      slotIndex + 1 < requiredTimes.length
        ? requiredTimes[slotIndex + 1]
        : null;

    contentResults.push(
      evaluateUpdateContent(
        parsed.updates[match.updateIndex],
        match.updateIndex,
        minFieldLength,
        nextRequiredTime,
        requireNextUpdatePromise,
        toleranceMinutes
      )
    );
  }

  const contentOk =
    cadenceOk &&
    contentResults.length === requiredTimes.length &&
    contentResults.every((r) => r.fieldsOk);

  const structured: P1StatusUpdatesStructuredResult = {
    style: 'p1_status_updates',
    requiredTimes,
    toleranceMinutes,
    minFieldLength,
    updateCount: parsed.updates.length,
    cadenceMatchedCount,
    cadenceRequiredCount: requiredTimes.length,
    cadenceOk,
    contentOk,
    cadenceMatches,
    contentResults,
  };

  if (!cadenceOk) {
    const missed = cadenceMatches
      .filter((m) => !m.matched)
      .map((m) => formatSimClock(m.requiredTime));
    return {
      parsed,
      structured: { ...structured, reason: 'cadence_miss' },
      ok: false,
      feedback: `Cadence incomplete. Missing status updates near: ${missed.join(
        ', '
      )} (±${toleranceMinutes} sim minutes). Posted ${cadenceMatchedCount}/${requiredTimes.length} required updates.`,
    };
  }

  if (!contentOk) {
    const gaps = contentResults
      .filter((r) => !r.fieldsOk)
      .map(
        (r) =>
          `${formatSimClock(r.postedAtSimMinutes)}: ${r.missing.join(', ')}`
      );
    return {
      parsed,
      structured: { ...structured, reason: 'content_incomplete' },
      ok: false,
      feedback: `Cadence met, but one or more updates are missing required fields (impact, ETA, next-update time${
        requireNextUpdatePromise ? ' matching the promised slot' : ''
      }). Fix: ${gaps.join('; ')}.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback: `All ${requiredTimes.length} stakeholder updates posted on cadence with impact, ETA, and next-update time covered.`,
  };
}

export const p1StatusUpdatesTicketScorer: TicketScorer = {
  score(submission, ticket) {
    const result = evaluateP1StatusUpdates(submission, ticket);
    const scoreResult: TicketScoreResult = {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
    return scoreResult;
  },
};
