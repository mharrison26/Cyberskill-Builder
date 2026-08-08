import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  DEFAULT_TRIAGE_PRIORITY_MATRIX,
  isTriageImpactLevel,
  isTriagePriority,
  type TriageImpactLevel,
  type TriagePriority,
  type TriageUrgencyLevel,
  TRIAGE_CATEGORIES,
} from '@/lib/scoring/ticketUi';

/**
 * Tier 1 triage scoring.
 *
 * Deterministic: student assigns priority (P1–P4) and category for a raw
 * inbound request. Expected priority is derived from an impact × urgency
 * rubric seeded on the ticket (`expected_state`), unless `expectedPriority`
 * is set explicitly.
 */

export {
  TRIAGE_PRIORITIES,
  TRIAGE_PRIORITY_LABELS,
  TRIAGE_IMPACT_LEVELS,
  TRIAGE_URGENCY_LEVELS,
  DEFAULT_TRIAGE_PRIORITY_MATRIX,
  TRIAGE_CATEGORIES,
  TRIAGE_CATEGORY_LABELS,
  isTriagePriority,
  isTriageCategory,
  type TriagePriority,
  type TriageCategory,
  type TriageImpactLevel,
  type TriageUrgencyLevel,
} from '@/lib/scoring/ticketUi';

export type TriageExpectedState = {
  impact?: TriageImpactLevel;
  urgency?: TriageUrgencyLevel;
  /** Explicit answer key; when omitted, derived from impact × urgency. */
  expectedPriority?: TriagePriority;
  expectedCategory?: string;
  /** Optional override of the default impact × urgency matrix. */
  priorityMatrix?: Partial<
    Record<TriageImpactLevel, Partial<Record<TriageUrgencyLevel, TriagePriority>>>
  >;
  /** Allowed category values for this ticket (defaults to TRIAGE_CATEGORIES). */
  categoryOptions?: string[];
};

export type TriageSubmission = {
  type?: string;
  priority: TriagePriority;
  category: string;
};

export type TriageStructuredResult = {
  style: 'triage';
  priority: TriagePriority | null;
  category: string | null;
  expectedPriority: TriagePriority | null;
  expectedCategory: string | null;
  impact: TriageImpactLevel | null;
  urgency: TriageUrgencyLevel | null;
  derivedPriority: TriagePriority | null;
  priorityMatch: boolean;
  categoryMatch: boolean;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePriority(value: unknown): TriagePriority | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toUpperCase();
  const compact = raw.replace(/\s+/g, '');
  if (isTriagePriority(compact)) return compact;
  // Accept "1" / "priority 2" style inputs.
  const digit = compact.match(/^(?:P|PRIORITY)?([1-4])$/);
  if (digit) {
    const mapped = `P${digit[1]}` as TriagePriority;
    return isTriagePriority(mapped) ? mapped : null;
  }
  return null;
}

function normalizeCategory(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, '_');
  return trimmed || null;
}

function normalizeLevel(
  value: unknown
): TriageImpactLevel | TriageUrgencyLevel | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (isTriageImpactLevel(normalized)) return normalized;
  return null;
}

export function parseTriageExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): TriageExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }

  const impact = normalizeLevel(expectedState.impact);
  const urgency = normalizeLevel(
    expectedState.urgency ?? expectedState.urgencyLevel
  );
  const expectedPriority = normalizePriority(
    expectedState.expectedPriority ??
      expectedState.priority ??
      expectedState.expected_priority
  );
  const expectedCategory = normalizeCategory(
    expectedState.expectedCategory ??
      expectedState.category ??
      expectedState.expected_category
  );

  let categoryOptions: string[] | undefined;
  const rawOptions =
    expectedState.categoryOptions ?? expectedState.categories;
  if (Array.isArray(rawOptions)) {
    const opts = rawOptions
      .map((item) => normalizeCategory(item))
      .filter((item): item is string => Boolean(item));
    if (opts.length > 0) categoryOptions = opts;
  }

  let priorityMatrix: TriageExpectedState['priorityMatrix'];
  const rawMatrix = expectedState.priorityMatrix;
  if (isPlainObject(rawMatrix)) {
    const matrix: NonNullable<TriageExpectedState['priorityMatrix']> = {};
    for (const impactKey of ['high', 'medium', 'low'] as const) {
      const row = rawMatrix[impactKey];
      if (!isPlainObject(row)) continue;
      const parsedRow: Partial<Record<TriageUrgencyLevel, TriagePriority>> = {};
      for (const urgencyKey of ['high', 'medium', 'low'] as const) {
        const cell = normalizePriority(row[urgencyKey]);
        if (cell) parsedRow[urgencyKey] = cell;
      }
      if (Object.keys(parsedRow).length > 0) {
        matrix[impactKey] = parsedRow;
      }
    }
    if (Object.keys(matrix).length > 0) priorityMatrix = matrix;
  }

  return {
    impact: impact ?? undefined,
    urgency: (urgency as TriageUrgencyLevel | null) ?? undefined,
    expectedPriority: expectedPriority ?? undefined,
    expectedCategory: expectedCategory ?? undefined,
    categoryOptions,
    priorityMatrix,
  };
}

export function resolvePriorityFromRubric(
  impact: TriageImpactLevel,
  urgency: TriageUrgencyLevel,
  matrixOverride?: TriageExpectedState['priorityMatrix']
): TriagePriority {
  const fromOverride = matrixOverride?.[impact]?.[urgency];
  if (fromOverride && isTriagePriority(fromOverride)) {
    return fromOverride;
  }
  return DEFAULT_TRIAGE_PRIORITY_MATRIX[impact][urgency];
}

export function resolveExpectedPriority(
  expected: TriageExpectedState
): TriagePriority | null {
  if (expected.expectedPriority) {
    return expected.expectedPriority;
  }
  if (expected.impact && expected.urgency) {
    return resolvePriorityFromRubric(
      expected.impact,
      expected.urgency,
      expected.priorityMatrix
    );
  }
  return null;
}

export function extractTriageSubmission(
  submission: TicketSubmission
): TriageSubmission | null {
  const priority = normalizePriority(
    submission.priority ?? submission.assignedPriority ?? submission.priorityLevel
  );
  const category = normalizeCategory(
    submission.category ?? submission.ticketCategory ?? submission.assignedCategory
  );

  if (!priority || !category) {
    return null;
  }

  return {
    type: typeof submission.type === 'string' ? submission.type : 'triage',
    priority,
    category,
  };
}

function allowedCategories(expected: TriageExpectedState): string[] {
  if (expected.categoryOptions && expected.categoryOptions.length > 0) {
    return expected.categoryOptions;
  }
  return [...TRIAGE_CATEGORIES];
}

export function evaluateTriage(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: TriageSubmission | null;
  structured: TriageStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseTriageExpectedState(ticket.expected_state);
  const derivedPriority =
    expected.impact && expected.urgency
      ? resolvePriorityFromRubric(
          expected.impact,
          expected.urgency,
          expected.priorityMatrix
        )
      : null;
  const expectedPriority = resolveExpectedPriority(expected);
  const expectedCategory = expected.expectedCategory ?? null;
  const parsed = extractTriageSubmission(submission);

  const baseStructured: TriageStructuredResult = {
    style: 'triage',
    priority: parsed?.priority ?? null,
    category: parsed?.category ?? null,
    expectedPriority,
    expectedCategory,
    impact: expected.impact ?? null,
    urgency: expected.urgency ?? null,
    derivedPriority,
    priorityMatch: false,
    categoryMatch: false,
  };

  if (!expectedPriority || !expectedCategory) {
    return {
      parsed,
      structured: { ...baseStructured, reason: 'misconfigured_expected_state' },
      ok: false,
      feedback:
        'This triage ticket is missing expectedPriority/impact×urgency or expectedCategory in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...baseStructured, reason: 'missing_fields' },
      ok: false,
      feedback:
        'Submission must include priority (P1–P4) and category.',
    };
  }

  const allowed = allowedCategories(expected);
  if (
    !allowed.includes(parsed.category) &&
    parsed.category !== expectedCategory
  ) {
    return {
      parsed,
      structured: {
        ...baseStructured,
        priority: parsed.priority,
        category: parsed.category,
        reason: 'invalid_category',
      },
      ok: false,
      feedback: `Category must be one of: ${allowed.join(', ')}.`,
    };
  }

  const priorityMatch = parsed.priority === expectedPriority;
  const categoryMatch = parsed.category === expectedCategory;

  const structured: TriageStructuredResult = {
    ...baseStructured,
    priority: parsed.priority,
    category: parsed.category,
    priorityMatch,
    categoryMatch,
  };

  if (!priorityMatch || !categoryMatch) {
    const parts: string[] = [];
    if (!priorityMatch) {
      const rubricHint =
        expected.impact && expected.urgency
          ? ` Rubric: ${expected.impact} impact × ${expected.urgency} urgency → ${expectedPriority}.`
          : ` Expected priority: ${expectedPriority}.`;
      parts.push(`Priority should be ${expectedPriority}.${rubricHint}`);
    }
    if (!categoryMatch) {
      parts.push(`Category should be "${expectedCategory}".`);
    }
    structured.reason = 'incorrect_triage';
    return {
      parsed,
      structured,
      ok: false,
      feedback: parts.join(' '),
    };
  }

  const rubricNote =
    expected.impact && expected.urgency
      ? ` (${expected.impact} impact × ${expected.urgency} urgency)`
      : '';

  return {
    parsed,
    structured,
    ok: true,
    feedback: `Correct triage: ${expectedPriority}${rubricNote}, category "${expectedCategory}".`,
  };
}

export const triageTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateTriage(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
