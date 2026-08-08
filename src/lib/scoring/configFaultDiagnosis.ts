import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { CONFIG_FAULT_DIAGNOSIS_MIN_IMPACT_LENGTH } from '@/lib/scoring/ticketUi';

/**
 * Config fault diagnosis scoring (named.conf / dhcpd.conf line ID).
 *
 * Fully deterministic on the identified fault line. Impact explanation is a
 * light min-length check (advisory free-text; not RAG-graded).
 *
 * initial_state:
 *   {
 *     prompt?: string,
 *     configFileName?: string,   // e.g. "named.conf"
 *     configText: string,        // full snippet shown read-only
 *     configKind?: string,       // "named.conf" | "dhcpd.conf"
 *   }
 *
 * expected_state:
 *   {
 *     faultLineNumber: number,           // 1-based line in configText
 *     faultLineContent?: string,         // optional content match / aliases
 *     acceptedLineNumbers?: number[],    // optional extras
 *     minImpactLength?: number,
 *   }
 *
 * submission:
 *   {
 *     type: 'config_fault_diagnosis',
 *     faultLineNumber: number,
 *     impactExplanation: string,
 *   }
 */

export {
  CONFIG_FAULT_DIAGNOSIS_MIN_IMPACT_LENGTH,
  isConfigFaultDiagnosisTicketType,
} from '@/lib/scoring/ticketUi';

export type ConfigFaultDiagnosisExpectedState = {
  faultLineNumber?: number;
  faultLineContent?: string;
  acceptedLineNumbers?: number[];
  minImpactLength?: number;
};

export type ConfigFaultDiagnosisSubmission = {
  type?: string;
  faultLineNumber: number;
  impactExplanation: string;
};

export type ConfigFaultDiagnosisStructuredResult = {
  style: 'config_fault_diagnosis';
  faultLineNumber: number | null;
  expectedFaultLineNumber: number | null;
  acceptedLineNumbers: number[];
  lineMatch: boolean;
  impactLength: number;
  minImpactLength: number;
  impactLengthOk: boolean;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.floor(value);
    return n >= 1 ? n : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(n) && n >= 1) return n;
  }
  return null;
}

/** Collapse whitespace and strip trailing comments for line-content compare. */
export function normalizeConfigLine(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const withoutComment = value.replace(/#.*$/, '').replace(/\/\/.*$/, '');
  const normalized = withoutComment.replace(/\s+/g, ' ').trim().toLowerCase();
  return normalized || null;
}

export function parseConfigFaultDiagnosisExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): ConfigFaultDiagnosisExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }

  const faultLineNumber = parsePositiveInt(
    expectedState.faultLineNumber ??
      expectedState.fault_line_number ??
      expectedState.expectedFaultLineNumber ??
      expectedState.expected_fault_line_number ??
      expectedState.lineNumber ??
      expectedState.line_number
  );

  const faultLineContentRaw =
    expectedState.faultLineContent ??
    expectedState.fault_line_content ??
    expectedState.expectedFaultLineContent ??
    expectedState.expected_line;

  const faultLineContent =
    typeof faultLineContentRaw === 'string' && faultLineContentRaw.trim()
      ? faultLineContentRaw.trim()
      : undefined;

  const acceptedRaw =
    expectedState.acceptedLineNumbers ??
    expectedState.accepted_line_numbers ??
    expectedState.acceptedLines;

  const acceptedLineNumbers: number[] = [];
  if (Array.isArray(acceptedRaw)) {
    for (const item of acceptedRaw) {
      const n = parsePositiveInt(item);
      if (n !== null) acceptedLineNumbers.push(n);
    }
  }

  const minImpactLength =
    typeof expectedState.minImpactLength === 'number' &&
    Number.isFinite(expectedState.minImpactLength) &&
    expectedState.minImpactLength > 0
      ? Math.floor(expectedState.minImpactLength)
      : typeof expectedState.min_impact_length === 'number' &&
          Number.isFinite(expectedState.min_impact_length) &&
          expectedState.min_impact_length > 0
        ? Math.floor(expectedState.min_impact_length)
        : CONFIG_FAULT_DIAGNOSIS_MIN_IMPACT_LENGTH;

  return {
    faultLineNumber: faultLineNumber ?? undefined,
    faultLineContent,
    acceptedLineNumbers:
      acceptedLineNumbers.length > 0 ? acceptedLineNumbers : undefined,
    minImpactLength,
  };
}

export function extractConfigFaultDiagnosisSubmission(
  submission: TicketSubmission
): ConfigFaultDiagnosisSubmission | null {
  const faultLineNumber = parsePositiveInt(
    submission.faultLineNumber ??
      submission.fault_line_number ??
      submission.lineNumber ??
      submission.line_number ??
      submission.identifiedLine ??
      submission.identified_line
  );

  const impactRaw =
    submission.impactExplanation ??
    submission.impact_explanation ??
    submission.impact ??
    submission.explanation;

  const impactExplanation =
    typeof impactRaw === 'string' ? impactRaw.trim() : '';

  if (faultLineNumber === null) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'config_fault_diagnosis',
    faultLineNumber,
    impactExplanation,
  };
}

function resolveAcceptedLineNumbers(
  expected: ConfigFaultDiagnosisExpectedState
): number[] {
  const set = new Set<number>();
  if (expected.faultLineNumber != null) {
    set.add(expected.faultLineNumber);
  }
  for (const n of expected.acceptedLineNumbers ?? []) {
    set.add(n);
  }
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Optional secondary match: submission line number maps into ticket configText
 * and that line's content equals expected faultLineContent (normalized).
 */
function lineContentMatchesAtNumber(
  ticket: ScorableTicket,
  lineNumber: number,
  expectedContent: string | undefined
): boolean {
  if (!expectedContent) return false;
  const initial = isPlainObject(ticket.initial_state)
    ? ticket.initial_state
    : {};
  const configText =
    typeof initial.configText === 'string'
      ? initial.configText
      : typeof initial.config_text === 'string'
        ? initial.config_text
        : typeof initial.config === 'string'
          ? initial.config
          : '';
  if (!configText) return false;

  const lines = configText.replace(/\r\n/g, '\n').split('\n');
  const line = lines[lineNumber - 1];
  if (line === undefined) return false;

  const actual = normalizeConfigLine(line);
  const expected = normalizeConfigLine(expectedContent);
  return Boolean(actual && expected && actual === expected);
}

export function evaluateConfigFaultDiagnosis(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: ConfigFaultDiagnosisSubmission | null;
  structured: ConfigFaultDiagnosisStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseConfigFaultDiagnosisExpectedState(
    ticket.expected_state
  );
  const acceptedLineNumbers = resolveAcceptedLineNumbers(expected);
  const expectedFaultLineNumber = expected.faultLineNumber ?? null;
  const minImpactLength =
    expected.minImpactLength ?? CONFIG_FAULT_DIAGNOSIS_MIN_IMPACT_LENGTH;
  const parsed = extractConfigFaultDiagnosisSubmission(submission);

  const baseStructured: ConfigFaultDiagnosisStructuredResult = {
    style: 'config_fault_diagnosis',
    faultLineNumber: parsed?.faultLineNumber ?? null,
    expectedFaultLineNumber,
    acceptedLineNumbers,
    lineMatch: false,
    impactLength: parsed?.impactExplanation.length ?? 0,
    minImpactLength,
    impactLengthOk: false,
  };

  if (acceptedLineNumbers.length === 0) {
    return {
      parsed,
      structured: {
        ...baseStructured,
        reason: 'misconfigured_expected_state',
      },
      ok: false,
      feedback:
        'This config fault ticket is missing faultLineNumber in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...baseStructured, reason: 'missing_fields' },
      ok: false,
      feedback:
        'Submission must include faultLineNumber (1-based line of the misconfiguration).',
    };
  }

  const impactLength = parsed.impactExplanation.length;
  const impactLengthOk = impactLength >= minImpactLength;

  const lineMatchByNumber = acceptedLineNumbers.includes(
    parsed.faultLineNumber
  );
  const lineMatchByContent = lineContentMatchesAtNumber(
    ticket,
    parsed.faultLineNumber,
    expected.faultLineContent
  );
  const lineMatch = lineMatchByNumber || lineMatchByContent;

  const structured: ConfigFaultDiagnosisStructuredResult = {
    ...baseStructured,
    faultLineNumber: parsed.faultLineNumber,
    lineMatch,
    impactLength,
    impactLengthOk,
  };

  if (!lineMatch) {
    const expectedLine = expectedFaultLineNumber ?? acceptedLineNumbers[0];
    structured.reason = 'incorrect_line';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Incorrect fault line. The misconfigured line is line ${expectedLine}. Re-read the config snippet and identify the specific bad directive.`,
    };
  }

  if (!impactLengthOk) {
    structured.reason = 'impact_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Correct fault line (${parsed.faultLineNumber}), but expand the impact explanation to at least ${minImpactLength} characters.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback: `Correct: you identified the misconfigured line (${parsed.faultLineNumber}). Impact explanation recorded.`,
  };
}

export const configFaultDiagnosisTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateConfigFaultDiagnosis(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
