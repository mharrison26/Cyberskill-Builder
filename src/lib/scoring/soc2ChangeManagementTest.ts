import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * SOC 2 change-management exception testing (CC8.1).
 *
 * Fully deterministic: students apply a written test procedure to a seeded
 * batch of change tickets and report exceptionCount + exceptionRate. When
 * exception IDs are submitted (or required), the exact exception ID set must
 * also match for full credit.
 *
 * initial_state:
 *   {
 *     criterion: { id, title, description? },
 *     testProcedure: string | string[],
 *     exceptionDefinition: string,
 *     changeTickets: Array<{
 *       id, title, changeType, requester?, approver?, approved,
 *       testEvidence?, requiresCab, cabApproved, retroApproval?,
 *       deployedAt?, environment?
 *     }>
 *   }
 *
 * expected_state:
 *   {
 *     exceptionCount: number,
 *     exceptionRate: number,          // percent 0–100 (e.g. 40) or fraction ≤1
 *     exceptionIds?: string[],
 *     rateTolerance?: number,         // absolute percent points (default 0)
 *     requireExceptionIds?: boolean   // default true when exceptionIds seeded
 *   }
 *
 * submission:
 *   {
 *     type: 'soc2_change_management_test' | 'soc2_exception_testing',
 *     exceptionCount: number,
 *     exceptionRate: number,
 *     exceptionIds?: string[]
 *   }
 */

export const SOC2_CHANGE_MANAGEMENT_TEST_TICKET_TYPES = [
  'soc2_change_management_test',
  'soc2_exception_testing',
] as const;

export type Soc2ChangeManagementTestTicketType =
  (typeof SOC2_CHANGE_MANAGEMENT_TEST_TICKET_TYPES)[number];

export type Soc2ChangeType = 'standard' | 'normal' | 'emergency';

export type Soc2ChangeTicket = {
  id: string;
  title: string;
  changeType: Soc2ChangeType;
  requester: string;
  approver: string | null;
  approved: boolean;
  testEvidence: string | null;
  requiresCab: boolean;
  cabApproved: boolean;
  retroApproval: boolean | null;
  deployedAt: string | null;
  environment: string | null;
};

export type Soc2Criterion = {
  id: string;
  title: string;
  description: string;
};

export type Soc2ChangeManagementTestExpectedState = {
  exceptionCount: number;
  /** Percent 0–100 when > 1, otherwise treated as a fraction (0–1). */
  exceptionRate: number;
  exceptionIds: string[];
  rateTolerance: number;
  requireExceptionIds: boolean;
};

export type Soc2ChangeManagementTestSubmission = {
  type?: string;
  exceptionCount: number;
  exceptionRate: number;
  exceptionIds: string[];
};

export type Soc2ChangeManagementTestStructuredResult = {
  style: 'soc2_change_management_test';
  populationSize: number | null;
  submittedExceptionCount: number | null;
  expectedExceptionCount: number | null;
  countMatch: boolean;
  submittedExceptionRate: number | null;
  expectedExceptionRate: number | null;
  rateMatch: boolean;
  submittedExceptionIds: string[];
  expectedExceptionIds: string[];
  exceptionSetMatch: boolean | null;
  missingExceptionIds: string[];
  extraExceptionIds: string[];
  requireExceptionIds: boolean;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isSoc2ChangeManagementTestTicketType(
  ticketType: string
): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    SOC2_CHANGE_MANAGEMENT_TEST_TICKET_TYPES as readonly string[]
  ).includes(base);
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const cleaned = value.trim().replace(/%$/, '');
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asNonNegInt(value: unknown): number | null {
  const n = asFiniteNumber(value);
  if (n === null || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

/** Normalize rate to percent points (0–100). Fractions ≤1 become percent. */
export function normalizeExceptionRatePercent(value: unknown): number | null {
  const n = asFiniteNumber(value);
  if (n === null || n < 0) return null;
  if (n <= 1) return Math.round(n * 10000) / 100;
  return Math.round(n * 100) / 100;
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
      const candidate = entry.id ?? entry.changeId ?? entry.change_id;
      if (typeof candidate === 'string') id = candidate.trim();
    }
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
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

function normalizeChangeType(value: unknown): Soc2ChangeType | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'standard' || normalized === 'std') return 'standard';
  if (normalized === 'normal' || normalized === 'routine') return 'normal';
  if (normalized === 'emergency' || normalized === 'urgent') return 'emergency';
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === 'yes' || v === 'y' || v === '1') return true;
    if (v === 'false' || v === 'no' || v === 'n' || v === '0') return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return null;
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseSoc2Criterion(
  initialState: Record<string, unknown> | null | undefined
): Soc2Criterion | null {
  if (!isPlainObject(initialState)) return null;
  const nested = isPlainObject(initialState.criterion)
    ? initialState.criterion
    : isPlainObject(initialState.tsc)
      ? initialState.tsc
      : null;
  if (!nested) return null;

  const id =
    readOptionalString(nested.id) ??
    readOptionalString(nested.code) ??
    readOptionalString(nested.criterionId);
  const title =
    readOptionalString(nested.title) ??
    readOptionalString(nested.name) ??
    readOptionalString(nested.label);
  if (!id || !title) return null;

  return {
    id,
    title,
    description:
      readOptionalString(nested.description) ??
      readOptionalString(nested.text) ??
      readOptionalString(nested.summary) ??
      '',
  };
}

export function parseSoc2TestProcedure(
  initialState: Record<string, unknown> | null | undefined
): string[] {
  if (!isPlainObject(initialState)) return [];
  const raw =
    initialState.testProcedure ??
    initialState.test_procedure ??
    initialState.procedure;

  if (typeof raw === 'string' && raw.trim()) {
    return raw
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function parseSoc2ExceptionDefinition(
  initialState: Record<string, unknown> | null | undefined
): string {
  if (!isPlainObject(initialState)) return '';
  return (
    readOptionalString(initialState.exceptionDefinition) ??
    readOptionalString(initialState.exception_definition) ??
    readOptionalString(initialState.exceptionCriteria) ??
    ''
  );
}

export function parseSoc2ChangeTickets(
  initialState: Record<string, unknown> | null | undefined
): Soc2ChangeTicket[] {
  if (!isPlainObject(initialState)) return [];

  const raw =
    initialState.changeTickets ??
    initialState.change_tickets ??
    initialState.evidence ??
    initialState.tickets;

  if (!Array.isArray(raw)) return [];

  const tickets: Soc2ChangeTicket[] = [];

  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;

    const id =
      readOptionalString(entry.id) ??
      readOptionalString(entry.changeId) ??
      readOptionalString(entry.change_id);
    if (!id) continue;

    const changeType = normalizeChangeType(
      entry.changeType ?? entry.change_type ?? entry.type
    );
    if (!changeType) continue;

    const approved =
      asBoolean(entry.approved) ??
      asBoolean(entry.isApproved) ??
      asBoolean(entry.is_approved) ??
      false;

    const requiresCab =
      asBoolean(entry.requiresCab) ??
      asBoolean(entry.requires_cab) ??
      asBoolean(entry.cabRequired) ??
      false;

    const cabApproved =
      asBoolean(entry.cabApproved) ??
      asBoolean(entry.cab_approved) ??
      asBoolean(entry.cabApproval) ??
      false;

    const retroRaw =
      entry.retroApproval ?? entry.retro_approval ?? entry.retroApproved;
    const retroApproval =
      retroRaw === null || retroRaw === undefined
        ? null
        : (asBoolean(retroRaw) ?? null);

    const testEvidence =
      readOptionalString(entry.testEvidence) ??
      readOptionalString(entry.test_evidence) ??
      readOptionalString(entry.testingEvidence) ??
      null;

    tickets.push({
      id,
      title:
        readOptionalString(entry.title) ??
        readOptionalString(entry.summary) ??
        id,
      changeType,
      requester:
        readOptionalString(entry.requester) ??
        readOptionalString(entry.requestedBy) ??
        '',
      approver:
        readOptionalString(entry.approver) ??
        readOptionalString(entry.approvedBy) ??
        null,
      approved,
      testEvidence,
      requiresCab,
      cabApproved,
      retroApproval,
      deployedAt:
        readOptionalString(entry.deployedAt) ??
        readOptionalString(entry.deployed_at) ??
        null,
      environment: readOptionalString(entry.environment),
    });
  }

  return tickets;
}

export function parseSoc2ChangeManagementTestExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): Soc2ChangeManagementTestExpectedState | null {
  if (!isPlainObject(expectedState)) return null;

  const exceptionCount = asNonNegInt(
    expectedState.exceptionCount ?? expectedState.exception_count
  );
  const exceptionRate = normalizeExceptionRatePercent(
    expectedState.exceptionRate ?? expectedState.exception_rate
  );
  if (exceptionCount === null || exceptionRate === null) return null;

  const exceptionIds = normalizeStringIds(
    expectedState.exceptionIds ??
      expectedState.exception_ids ??
      expectedState.exceptions
  ).sort((a, b) => a.localeCompare(b));

  const rateToleranceRaw = asFiniteNumber(
    expectedState.rateTolerance ?? expectedState.rate_tolerance
  );
  const rateTolerance =
    rateToleranceRaw !== null && rateToleranceRaw >= 0
      ? rateToleranceRaw
      : 0;

  const requireExceptionIds =
    typeof expectedState.requireExceptionIds === 'boolean'
      ? expectedState.requireExceptionIds
      : typeof expectedState.require_exception_ids === 'boolean'
        ? expectedState.require_exception_ids
        : exceptionIds.length > 0;

  return {
    exceptionCount,
    exceptionRate,
    exceptionIds,
    rateTolerance,
    requireExceptionIds,
  };
}

export function extractSoc2ChangeManagementTestSubmission(
  submission: TicketSubmission
): Soc2ChangeManagementTestSubmission | null {
  const exceptionCount = asNonNegInt(
    submission.exceptionCount ?? submission.exception_count
  );
  const exceptionRate = normalizeExceptionRatePercent(
    submission.exceptionRate ?? submission.exception_rate
  );
  if (exceptionCount === null || exceptionRate === null) return null;

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'soc2_change_management_test',
    exceptionCount,
    exceptionRate,
    exceptionIds: normalizeStringIds(
      submission.exceptionIds ??
        submission.exception_ids ??
        submission.exceptions
    ),
  };
}

export function evaluateSoc2ChangeManagementTestDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: Soc2ChangeManagementTestSubmission | null;
  structured: Soc2ChangeManagementTestStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseSoc2ChangeManagementTestExpectedState(
    ticket.expected_state
  );
  const evidence = parseSoc2ChangeTickets(
    ticket.initial_state as Record<string, unknown> | null | undefined
  );
  const parsed = extractSoc2ChangeManagementTestSubmission(submission);

  const requireExceptionIds = expected?.requireExceptionIds ?? false;

  const structured: Soc2ChangeManagementTestStructuredResult = {
    style: 'soc2_change_management_test',
    populationSize: evidence.length > 0 ? evidence.length : null,
    submittedExceptionCount: parsed?.exceptionCount ?? null,
    expectedExceptionCount: expected?.exceptionCount ?? null,
    countMatch: false,
    submittedExceptionRate: parsed?.exceptionRate ?? null,
    expectedExceptionRate: expected?.exceptionRate ?? null,
    rateMatch: false,
    submittedExceptionIds: parsed
      ? [...parsed.exceptionIds].sort((a, b) => a.localeCompare(b))
      : [],
    expectedExceptionIds: expected?.exceptionIds ?? [],
    exceptionSetMatch: requireExceptionIds ? false : null,
    missingExceptionIds: [],
    extraExceptionIds: [],
    requireExceptionIds,
  };

  if (!expected) {
    structured.reason = 'misconfigured_expected_state';
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        'This SOC 2 change-management ticket is missing exceptionCount/exceptionRate in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    structured.reason = 'missing_fields';
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include exceptionCount and exceptionRate (percent). Optionally include exceptionIds for the flagged change tickets.',
    };
  }

  const countMatch = parsed.exceptionCount === expected.exceptionCount;
  const rateMatch =
    Math.abs(parsed.exceptionRate - expected.exceptionRate) <=
    expected.rateTolerance;

  structured.countMatch = countMatch;
  structured.rateMatch = rateMatch;

  const submittedSorted = [...parsed.exceptionIds].sort((a, b) =>
    a.localeCompare(b)
  );
  const expectedSorted = expected.exceptionIds;
  const missingExceptionIds = setDiff(expectedSorted, submittedSorted);
  const extraExceptionIds = setDiff(submittedSorted, expectedSorted);
  const exceptionSetMatch = setsEqual(submittedSorted, expectedSorted);

  structured.submittedExceptionIds = submittedSorted;
  structured.missingExceptionIds = missingExceptionIds;
  structured.extraExceptionIds = extraExceptionIds;
  if (requireExceptionIds) {
    structured.exceptionSetMatch = exceptionSetMatch;
  } else if (submittedSorted.length > 0) {
    structured.exceptionSetMatch = exceptionSetMatch;
  }

  const setRequired = requireExceptionIds;
  const setOk = !setRequired || exceptionSetMatch;

  if (!countMatch || !rateMatch || !setOk) {
    const parts: string[] = [];
    if (!countMatch) {
      parts.push(
        `Exception count should be ${expected.exceptionCount}, not ${parsed.exceptionCount}.`
      );
    }
    if (!rateMatch) {
      parts.push(
        `Exception rate should be ${expected.exceptionRate}%, not ${parsed.exceptionRate}%.`
      );
    }
    if (setRequired) {
      if (missingExceptionIds.length > 0) {
        parts.push(
          `Missing exception change ticket(s): ${missingExceptionIds.join(', ')}.`
        );
      }
      if (extraExceptionIds.length > 0) {
        parts.push(
          `Incorrectly flagged as exception: ${extraExceptionIds.join(', ')}.`
        );
      }
      if (
        countMatch &&
        rateMatch &&
        missingExceptionIds.length === 0 &&
        extraExceptionIds.length === 0 &&
        !exceptionSetMatch
      ) {
        parts.push('Exception ID set does not match the seeded exceptions.');
      }
      if (submittedSorted.length === 0 && expectedSorted.length > 0) {
        parts.push(
          'Select the change tickets that are exceptions (exact set required for full credit).'
        );
      }
    }

    structured.reason = !countMatch
      ? 'wrong_exception_count'
      : !rateMatch
        ? 'wrong_exception_rate'
        : missingExceptionIds.length > 0
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
      'Exception count, rate, and identified change tickets match the seeded CC8.1 test results.',
  };
}

export const soc2ChangeManagementTestTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateSoc2ChangeManagementTestDeterministic(
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
