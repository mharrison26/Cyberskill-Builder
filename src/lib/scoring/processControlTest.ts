import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { PROCESS_CONTROL_TEST_MIN_NOTES_LENGTH } from '@/lib/scoring/ticketUi';

/**
 * Process control test scoring (PI-02 stage — deterministic).
 *
 * Student reviews seeded sample items (e.g. invoice approvals), calls
 * pass/fail, and lists exception item IDs. Scored against expected_state.
 */

export { PROCESS_CONTROL_TEST_MIN_NOTES_LENGTH } from '@/lib/scoring/ticketUi';

export const PROCESS_CONTROL_TEST_TICKET_TYPES = [
  'process_control_test',
  'control_sample_test',
] as const;

export type ProcessControlTestTicketType =
  (typeof PROCESS_CONTROL_TEST_TICKET_TYPES)[number];

export const PROCESS_CONTROL_OUTCOMES = ['pass', 'fail'] as const;
export type ProcessControlOutcome = (typeof PROCESS_CONTROL_OUTCOMES)[number];

export type ProcessControlSampleItem = {
  id: string;
  label: string;
  amount?: string;
  attributes: Record<string, string>;
  notes?: string;
};

export type ProcessControlTestExpectedState = {
  controlOutcome: ProcessControlOutcome;
  exceptionItemIds: string[];
  minNotesLength?: number;
};

export type ProcessControlTestSubmission = {
  type?: string;
  controlOutcome: ProcessControlOutcome;
  exceptionItemIds: string[];
  notes: string;
};

export type ProcessControlTestStructuredResult = {
  style: 'process_control_test';
  controlOutcome: ProcessControlOutcome | null;
  expectedControlOutcome: ProcessControlOutcome | null;
  controlOutcomeMatch: boolean;
  submittedExceptionItemIds: string[];
  expectedExceptionItemIds: string[];
  exceptionSetMatch: boolean;
  missingExceptionItemIds: string[];
  extraExceptionItemIds: string[];
  notesLength: number;
  minNotesLength: number;
  notesOk: boolean;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isProcessControlTestTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (PROCESS_CONTROL_TEST_TICKET_TYPES as readonly string[]).includes(
    base
  );
}

export function isProcessControlOutcome(
  value: string
): value is ProcessControlOutcome {
  return (PROCESS_CONTROL_OUTCOMES as readonly string[]).includes(value);
}

function normalizeOutcome(value: unknown): ProcessControlOutcome | null {
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
  return isProcessControlOutcome(normalized) ? normalized : null;
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
      const candidate = entry.itemId ?? entry.item_id ?? entry.id;
      if (typeof candidate === 'string') id = candidate.trim();
    }
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function setEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

export function parseProcessControlSampleItems(
  initialState: Record<string, unknown> | null | undefined
): ProcessControlSampleItem[] {
  if (!isPlainObject(initialState)) return [];
  const raw =
    initialState.sampleItems ??
    initialState.sample_items ??
    initialState.items ??
    initialState.samples;
  if (!Array.isArray(raw)) return [];

  const items: ProcessControlSampleItem[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const id =
      typeof entry.id === 'string'
        ? entry.id.trim()
        : typeof entry.itemId === 'string'
          ? entry.itemId.trim()
          : '';
    if (!id) continue;

    const label =
      typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : typeof entry.description === 'string' && entry.description.trim()
          ? entry.description.trim()
          : id;

    const attributes: Record<string, string> = {};
    const attrsRaw = entry.attributes;
    if (isPlainObject(attrsRaw)) {
      for (const [key, value] of Object.entries(attrsRaw)) {
        if (typeof value === 'string' && value.trim()) {
          attributes[key] = value.trim();
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          attributes[key] = String(value);
        }
      }
    }

    // Promote common flat fields into attributes for the UI table.
    for (const key of [
      'vendor',
      'invoiceNumber',
      'invoice_number',
      'poNumber',
      'po_number',
      'approver',
      'approvalStatus',
      'approval_status',
      'matchStatus',
      'match_status',
      'amount',
    ] as const) {
      const value = entry[key];
      if (typeof value === 'string' && value.trim() && !attributes[key]) {
        attributes[key] = value.trim();
      }
    }

    items.push({
      id,
      label,
      amount:
        typeof entry.amount === 'string'
          ? entry.amount
          : typeof entry.amount === 'number'
            ? String(entry.amount)
            : attributes.amount,
      attributes,
      notes:
        typeof entry.notes === 'string' && entry.notes.trim()
          ? entry.notes.trim()
          : undefined,
    });
  }
  return items;
}

export function parseProcessControlTestExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): ProcessControlTestExpectedState | null {
  if (!isPlainObject(expectedState)) return null;
  const controlOutcome = normalizeOutcome(
    expectedState.controlOutcome ??
      expectedState.control_outcome ??
      expectedState.expectedOutcome
  );
  if (!controlOutcome) return null;

  const exceptionItemIds = normalizeStringIds(
    expectedState.exceptionItemIds ??
      expectedState.exception_item_ids ??
      expectedState.exceptions
  );

  const minNotes =
    expectedState.minNotesLength ?? expectedState.min_notes_length;

  return {
    controlOutcome,
    exceptionItemIds,
    minNotesLength:
      typeof minNotes === 'number' && Number.isFinite(minNotes) && minNotes >= 0
        ? Math.floor(minNotes)
        : undefined,
  };
}

export function extractProcessControlTestSubmission(
  submission: TicketSubmission
): ProcessControlTestSubmission | null {
  const controlOutcome = normalizeOutcome(
    submission.controlOutcome ?? submission.control_outcome
  );
  if (!controlOutcome) return null;

  const exceptionItemIds = normalizeStringIds(
    submission.exceptionItemIds ??
      submission.exception_item_ids ??
      submission.exceptions
  );

  const notesRaw = submission.notes ?? submission.testingNotes;
  const notes = typeof notesRaw === 'string' ? notesRaw.trim() : '';

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'process_control_test',
    controlOutcome,
    exceptionItemIds,
    notes,
  };
}

export function evaluateProcessControlTestDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: ProcessControlTestSubmission | null;
  structured: ProcessControlTestStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseProcessControlTestExpectedState(ticket.expected_state);
  const minNotesLength =
    expected?.minNotesLength ?? PROCESS_CONTROL_TEST_MIN_NOTES_LENGTH;
  const parsed = extractProcessControlTestSubmission(submission);

  const base: ProcessControlTestStructuredResult = {
    style: 'process_control_test',
    controlOutcome: parsed?.controlOutcome ?? null,
    expectedControlOutcome: expected?.controlOutcome ?? null,
    controlOutcomeMatch: false,
    submittedExceptionItemIds: parsed?.exceptionItemIds ?? [],
    expectedExceptionItemIds: expected?.exceptionItemIds ?? [],
    exceptionSetMatch: false,
    missingExceptionItemIds: [],
    extraExceptionItemIds: [],
    notesLength: parsed?.notes.length ?? 0,
    minNotesLength,
    notesOk: false,
  };

  if (!expected) {
    return {
      parsed,
      structured: { ...base, reason: 'misconfigured_expected_state' },
      ok: false,
      feedback:
        'This process control ticket is missing controlOutcome / exceptionItemIds in expected_state.',
    };
  }

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...base, reason: 'missing_fields' },
      ok: false,
      feedback:
        'Submission must include controlOutcome (pass/fail), exceptionItemIds, and notes.',
    };
  }

  const notesOk = parsed.notes.length >= minNotesLength;
  const controlOutcomeMatch =
    parsed.controlOutcome === expected.controlOutcome;

  const expectedSet = new Set(expected.exceptionItemIds);
  const submittedSet = new Set(parsed.exceptionItemIds);
  const missingExceptionItemIds = expected.exceptionItemIds.filter(
    (id) => !submittedSet.has(id)
  );
  const extraExceptionItemIds = parsed.exceptionItemIds.filter(
    (id) => !expectedSet.has(id)
  );
  const exceptionSetMatch = setEqual(
    parsed.exceptionItemIds,
    expected.exceptionItemIds
  );

  // Pass with no exceptions: empty sets must match.
  if (expected.controlOutcome === 'pass' && expected.exceptionItemIds.length === 0) {
    // already handled by setEqual
  }

  const structured: ProcessControlTestStructuredResult = {
    ...base,
    controlOutcome: parsed.controlOutcome,
    controlOutcomeMatch,
    submittedExceptionItemIds: parsed.exceptionItemIds,
    exceptionSetMatch,
    missingExceptionItemIds,
    extraExceptionItemIds,
    notesLength: parsed.notes.length,
    notesOk,
  };

  if (!notesOk) {
    structured.reason = 'notes_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Testing notes must be at least ${minNotesLength} characters.`,
    };
  }

  if (!controlOutcomeMatch || !exceptionSetMatch) {
    const parts: string[] = [];
    if (!controlOutcomeMatch) {
      parts.push(
        `Control outcome should be "${expected.controlOutcome}" based on the sample evidence.`
      );
    }
    if (!exceptionSetMatch) {
      if (missingExceptionItemIds.length > 0) {
        parts.push(
          `Missing exception item(s): ${missingExceptionItemIds.join(', ')}.`
        );
      }
      if (extraExceptionItemIds.length > 0) {
        parts.push(
          `Unexpected exception item(s): ${extraExceptionItemIds.join(', ')}.`
        );
      }
      if (
        missingExceptionItemIds.length === 0 &&
        extraExceptionItemIds.length === 0 &&
        expected.exceptionItemIds.length === 0
      ) {
        parts.push('Exception list should be empty for a pass outcome.');
      }
    }
    structured.reason = 'incorrect_control_test';
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
    feedback: `Correct control conclusion (${expected.controlOutcome}) with matching exception set.`,
  };
}

export const processControlTestTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateProcessControlTestDeterministic(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
