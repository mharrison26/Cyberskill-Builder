import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * ITGC timely access revocation scoring.
 *
 * Fully deterministic: compare the student's control outcome (pass/fail) and
 * exception user-ID set against `expected_state`. Order of exceptions does not
 * matter; exact set match is required to resolve.
 *
 * initial_state:
 *   {
 *     prompt?: string;
 *     controlObjective?: string;
 *     policy?: {
 *       title?, criteria?, revokeWithinDays, asOfDate, calendarBasis?
 *     };
 *     users: Array<{
 *       id, displayName?, username?, department?,
 *       employmentStatus: 'active' | 'terminated',
 *       terminationDate?: string | null,  // YYYY-MM-DD
 *       accessStatus: 'active' | 'revoked',
 *       accessRevokedDate?: string | null // YYYY-MM-DD
 *     }>
 *   }
 *
 * expected_state:
 *   {
 *     controlOutcome: 'pass' | 'fail';
 *     exceptionUserIds: string[];
 *   }
 *
 * submission:
 *   {
 *     type: 'itgc_access_revocation' | 'timely_access_revocation',
 *     controlOutcome: 'pass' | 'fail',
 *     exceptionUserIds: string[]
 *   }
 */

export const ITGC_ACCESS_REVOCATION_TICKET_TYPES = [
  'itgc_access_revocation',
  'timely_access_revocation',
] as const;

export type ItgcAccessRevocationTicketType =
  (typeof ITGC_ACCESS_REVOCATION_TICKET_TYPES)[number];

export const ITGC_CONTROL_OUTCOMES = ['pass', 'fail'] as const;
export type ItgcControlOutcome = (typeof ITGC_CONTROL_OUTCOMES)[number];

export type ItgcEmploymentStatus = 'active' | 'terminated';
export type ItgcAccessStatus = 'active' | 'revoked';

export type ItgcAccessUser = {
  id: string;
  displayName: string;
  username: string;
  department: string;
  employmentStatus: ItgcEmploymentStatus;
  terminationDate: string | null;
  accessStatus: ItgcAccessStatus;
  accessRevokedDate: string | null;
};

export type ItgcAccessPolicy = {
  title: string;
  criteria: string;
  revokeWithinDays: number;
  asOfDate: string;
  calendarBasis: string;
};

export type ItgcAccessRevocationExpectedState = {
  controlOutcome: ItgcControlOutcome;
  exceptionUserIds: string[];
};

export type ItgcAccessRevocationSubmission = {
  type?: string;
  controlOutcome: ItgcControlOutcome;
  exceptionUserIds: string[];
};

export type ItgcAccessRevocationStructuredResult = {
  style: 'itgc_access_revocation';
  controlOutcome: ItgcControlOutcome | null;
  expectedControlOutcome: ItgcControlOutcome | null;
  controlOutcomeMatch: boolean;
  submittedExceptionUserIds: string[];
  expectedExceptionUserIds: string[];
  exceptionSetMatch: boolean;
  missingExceptionUserIds: string[];
  extraExceptionUserIds: string[];
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isItgcAccessRevocationTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (ITGC_ACCESS_REVOCATION_TICKET_TYPES as readonly string[]).includes(
    base
  );
}

export function isItgcControlOutcome(
  value: string
): value is ItgcControlOutcome {
  return (ITGC_CONTROL_OUTCOMES as readonly string[]).includes(value);
}

function normalizeOutcome(value: unknown): ItgcControlOutcome | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'pass' || normalized === 'effective') return 'pass';
  if (
    normalized === 'fail' ||
    normalized === 'failed' ||
    normalized === 'ineffective' ||
    normalized === 'exception'
  ) {
    return 'fail';
  }
  if (isItgcControlOutcome(normalized)) return normalized;
  return null;
}

function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeStringIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of raw) {
    let id = '';
    if (typeof entry === 'string') {
      id = entry.trim();
    } else if (isPlainObject(entry)) {
      const candidate = entry.userId ?? entry.user_id ?? entry.id;
      if (typeof candidate === 'string') id = candidate.trim();
    }
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function parseItgcAccessUsers(
  initialState: Record<string, unknown> | null | undefined
): ItgcAccessUser[] {
  if (!isPlainObject(initialState)) return [];

  const raw =
    initialState.users ??
    initialState.accessList ??
    initialState.access_list ??
    initialState.userAccessList;

  if (!Array.isArray(raw)) return [];

  const users: ItgcAccessUser[] = [];

  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;

    const id =
      typeof entry.id === 'string'
        ? entry.id.trim()
        : typeof entry.userId === 'string'
          ? entry.userId.trim()
          : typeof entry.user_id === 'string'
            ? entry.user_id.trim()
            : '';
    if (!id) continue;

    const username =
      typeof entry.username === 'string'
        ? entry.username.trim()
        : typeof entry.userName === 'string'
          ? entry.userName.trim()
          : id;

    const displayName =
      typeof entry.displayName === 'string'
        ? entry.displayName.trim()
        : typeof entry.display_name === 'string'
          ? entry.display_name.trim()
          : typeof entry.name === 'string'
            ? entry.name.trim()
            : username;

    const department =
      typeof entry.department === 'string' ? entry.department.trim() : '';

    const employmentRaw = String(
      entry.employmentStatus ?? entry.employment_status ?? entry.status ?? ''
    )
      .trim()
      .toLowerCase();
    const employmentStatus: ItgcEmploymentStatus =
      employmentRaw === 'terminated' || employmentRaw === 'inactive'
        ? 'terminated'
        : 'active';

    const accessRaw = String(
      entry.accessStatus ?? entry.access_status ?? entry.accountStatus ?? ''
    )
      .trim()
      .toLowerCase();
    const accessStatus: ItgcAccessStatus =
      accessRaw === 'revoked' ||
      accessRaw === 'disabled' ||
      accessRaw === 'deactivated'
        ? 'revoked'
        : 'active';

    users.push({
      id,
      displayName: displayName || username || id,
      username: username || id,
      department,
      employmentStatus,
      terminationDate: normalizeIsoDate(
        entry.terminationDate ?? entry.termination_date ?? entry.termDate
      ),
      accessStatus,
      accessRevokedDate: normalizeIsoDate(
        entry.accessRevokedDate ??
          entry.access_revoked_date ??
          entry.revokedDate ??
          entry.revokeDate
      ),
    });
  }

  return users;
}

export function parseItgcAccessPolicy(
  initialState: Record<string, unknown> | null | undefined
): ItgcAccessPolicy | null {
  if (!isPlainObject(initialState)) return null;

  const nested = isPlainObject(initialState.policy)
    ? initialState.policy
    : initialState;

  const revokeWithinDaysRaw =
    nested.revokeWithinDays ??
    nested.revoke_within_days ??
    nested.slaDays ??
    nested.sla_days;
  const revokeWithinDays =
    typeof revokeWithinDaysRaw === 'number' &&
    Number.isFinite(revokeWithinDaysRaw) &&
    revokeWithinDaysRaw >= 0
      ? Math.floor(revokeWithinDaysRaw)
      : null;

  const asOfDate = normalizeIsoDate(
    nested.asOfDate ?? nested.as_of_date ?? nested.testingDate
  );

  if (revokeWithinDays === null || !asOfDate) return null;

  const title =
    typeof nested.title === 'string' && nested.title.trim()
      ? nested.title.trim()
      : typeof nested.policyTitle === 'string' && nested.policyTitle.trim()
        ? nested.policyTitle.trim()
        : 'Timely access revocation policy';

  const criteria =
    typeof nested.criteria === 'string' && nested.criteria.trim()
      ? nested.criteria.trim()
      : typeof nested.text === 'string' && nested.text.trim()
        ? nested.text.trim()
        : `Access for terminated users must be revoked within ${revokeWithinDays} calendar days of the termination date (as of ${asOfDate}).`;

  const calendarBasis =
    typeof nested.calendarBasis === 'string' && nested.calendarBasis.trim()
      ? nested.calendarBasis.trim()
      : typeof nested.calendar_basis === 'string' &&
          nested.calendar_basis.trim()
        ? nested.calendar_basis.trim()
        : 'calendar_days';

  return {
    title,
    criteria,
    revokeWithinDays,
    asOfDate,
    calendarBasis,
  };
}

export function parseItgcAccessRevocationExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): ItgcAccessRevocationExpectedState | null {
  if (!isPlainObject(expectedState)) return null;

  const controlOutcome = normalizeOutcome(
    expectedState.controlOutcome ??
      expectedState.control_outcome ??
      expectedState.outcome ??
      expectedState.expectedOutcome
  );
  if (!controlOutcome) return null;

  const exceptionUserIds = normalizeStringIds(
    expectedState.exceptionUserIds ??
      expectedState.exception_user_ids ??
      expectedState.exceptions
  ).sort((a, b) => a.localeCompare(b));

  return { controlOutcome, exceptionUserIds };
}

export function extractItgcAccessRevocationSubmission(
  submission: TicketSubmission
): ItgcAccessRevocationSubmission | null {
  const controlOutcome = normalizeOutcome(
    submission.controlOutcome ??
      submission.control_outcome ??
      submission.outcome ??
      submission.passFail ??
      submission.pass_fail
  );
  if (!controlOutcome) return null;

  const exceptionUserIds = normalizeStringIds(
    submission.exceptionUserIds ??
      submission.exception_user_ids ??
      submission.exceptions
  );

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'itgc_access_revocation',
    controlOutcome,
    exceptionUserIds,
  };
}

function setDiff(a: string[], b: string[]): string[] {
  const bSet = new Set(b);
  return a.filter((id) => !bSet.has(id)).sort((x, y) => x.localeCompare(y));
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const aSorted = [...a].sort((x, y) => x.localeCompare(y));
  const bSorted = [...b].sort((x, y) => x.localeCompare(y));
  return aSorted.every((id, i) => id === bSorted[i]);
}

export function evaluateItgcAccessRevocationDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: ItgcAccessRevocationSubmission | null;
  structured: ItgcAccessRevocationStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseItgcAccessRevocationExpectedState(ticket.expected_state);
  const parsed = extractItgcAccessRevocationSubmission(submission);

  const expectedOutcome = expected?.controlOutcome ?? null;
  const expectedExceptions = expected?.exceptionUserIds ?? [];

  const structured: ItgcAccessRevocationStructuredResult = {
    style: 'itgc_access_revocation',
    controlOutcome: parsed?.controlOutcome ?? null,
    expectedControlOutcome: expectedOutcome,
    controlOutcomeMatch: false,
    submittedExceptionUserIds: parsed
      ? [...parsed.exceptionUserIds].sort((a, b) => a.localeCompare(b))
      : [],
    expectedExceptionUserIds: expectedExceptions,
    exceptionSetMatch: false,
    missingExceptionUserIds: [],
    extraExceptionUserIds: [],
  };

  if (!expected || !expectedOutcome) {
    structured.reason = 'misconfigured_expected_state';
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        'This ITGC access revocation ticket is missing controlOutcome in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    structured.reason = 'missing_fields';
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include controlOutcome (pass|fail) and exceptionUserIds (array of user IDs).',
    };
  }

  const submittedSorted = [...parsed.exceptionUserIds].sort((a, b) =>
    a.localeCompare(b)
  );
  const missingExceptionUserIds = setDiff(expectedExceptions, submittedSorted);
  const extraExceptionUserIds = setDiff(submittedSorted, expectedExceptions);
  const controlOutcomeMatch = parsed.controlOutcome === expectedOutcome;
  const exceptionSetMatch = setsEqual(submittedSorted, expectedExceptions);

  structured.controlOutcomeMatch = controlOutcomeMatch;
  structured.exceptionSetMatch = exceptionSetMatch;
  structured.missingExceptionUserIds = missingExceptionUserIds;
  structured.extraExceptionUserIds = extraExceptionUserIds;
  structured.submittedExceptionUserIds = submittedSorted;

  if (!controlOutcomeMatch || !exceptionSetMatch) {
    const parts: string[] = [];
    if (!controlOutcomeMatch) {
      parts.push(
        `Control outcome should be "${expectedOutcome}", not "${parsed.controlOutcome}".`
      );
    }
    if (missingExceptionUserIds.length > 0) {
      parts.push(
        `Missing exception user(s): ${missingExceptionUserIds.join(', ')}.`
      );
    }
    if (extraExceptionUserIds.length > 0) {
      parts.push(
        `Incorrectly flagged as exception: ${extraExceptionUserIds.join(', ')}.`
      );
    }
    if (
      controlOutcomeMatch &&
      missingExceptionUserIds.length === 0 &&
      extraExceptionUserIds.length === 0 &&
      !exceptionSetMatch
    ) {
      parts.push('Exception set does not match the evidence exactly.');
    }

    structured.reason = !controlOutcomeMatch
      ? 'wrong_control_outcome'
      : missingExceptionUserIds.length > 0
        ? 'missing_exceptions'
        : 'extra_exceptions';

    return {
      parsed,
      structured,
      ok: false,
      feedback: parts.join(' '),
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Correct control outcome and exception set. Timely access revocation testing matches the seeded evidence.',
  };
}

export const itgcAccessRevocationTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateItgcAccessRevocationDeterministic(
      submission,
      ticket
    );
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
