import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * Major-breach incident-command simulation (ISSM).
 *
 * Multi-decision-point ticket: student works ~4 stages of an unfolding breach
 * and chooses/justifies actions at each decision point. Fully deterministic
 * scoring against a seeded answer key.
 *
 * initial_state:
 *   {
 *     prompt?, role?, minJustificationLength?,
 *     incident?: { id?, title?, system?, ... },
 *     stages: Array<{
 *       id, title, brief?,
 *       decisionPoints: Array<{
 *         id, type: 'multi_select'|'single_select', prompt,
 *         options: Array<{ id, label, detail? }>
 *       }>
 *     }>
 *   }
 *
 * expected_state:
 *   {
 *     decisions: {
 *       [decisionPointId]:
 *         | { type: 'multi_select', correctOptionIds: string[] }
 *         | { type: 'single_select', correctOptionId: string }
 *     },
 *     minJustificationLength?: number,
 *     passThresholdPercent?: number,       // default 100
 *     requireAllJustifications?: boolean   // default true
 *   }
 *
 * submission:
 *   {
 *     type: 'breach_incident_command' | ...,
 *     decisions: {
 *       [id]:
 *         | { selectedOptionIds: string[], justification: string }
 *         | { selectedOptionId: string, justification: string }
 *     }
 *   }
 */

export const BREACH_INCIDENT_COMMAND_TICKET_TYPES = [
  'breach_incident_command',
  'major_breach_simulation',
  'issm_incident_decisions',
] as const;

export type BreachIncidentCommandTicketType =
  (typeof BREACH_INCIDENT_COMMAND_TICKET_TYPES)[number];

export const BREACH_INCIDENT_COMMAND_MIN_JUSTIFICATION_LENGTH = 40;
export const BREACH_INCIDENT_COMMAND_DEFAULT_PASS_THRESHOLD = 100;

export type BreachDecisionOption = {
  id: string;
  label: string;
  detail?: string;
};

export type BreachDecisionPointType = 'multi_select' | 'single_select';

export type BreachDecisionPoint = {
  id: string;
  type: BreachDecisionPointType;
  prompt: string;
  options: BreachDecisionOption[];
};

export type BreachIncidentStage = {
  id: string;
  title: string;
  brief: string;
  decisionPoints: BreachDecisionPoint[];
};

export type BreachIncidentFacts = {
  id: string;
  title: string;
  system: string;
};

export type BreachAnswerKeyEntry =
  | { type: 'multi_select'; correctOptionIds: string[] }
  | { type: 'single_select'; correctOptionId: string };

export type BreachIncidentCommandExpectedState = {
  decisions: Record<string, BreachAnswerKeyEntry>;
  minJustificationLength: number;
  passThresholdPercent: number;
  requireAllJustifications: boolean;
};

export type BreachDecisionSubmission =
  | {
      selectedOptionIds: string[];
      selectedOptionId?: undefined;
      justification: string;
    }
  | {
      selectedOptionId: string;
      selectedOptionIds?: undefined;
      justification: string;
    };

export type BreachIncidentCommandSubmission = {
  type?: string;
  decisions: Record<string, BreachDecisionSubmission>;
};

export type BreachDecisionPointResult = {
  decisionPointId: string;
  type: BreachDecisionPointType;
  passed: boolean;
  selectionMatch: boolean;
  justificationOk: boolean;
  justificationLength: number;
  submittedOptionIds: string[];
  expectedOptionIds: string[];
  missingOptionIds: string[];
  extraOptionIds: string[];
  reason?: string;
};

export type BreachIncidentCommandStructuredResult = {
  style: 'breach_incident_command';
  passThresholdPercent: number;
  percentage: number;
  passedCount: number;
  totalCount: number;
  minJustificationLength: number;
  requireAllJustifications: boolean;
  decisionResults: BreachDecisionPointResult[];
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isBreachIncidentCommandTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (BREACH_INCIDENT_COMMAND_TICKET_TYPES as readonly string[]).includes(
    base
  );
}

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
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
      const candidate = entry.id ?? entry.optionId ?? entry.option_id;
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
  return a.filter((id) => !bSet.has(id));
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const aSorted = sortIds(a);
  const bSorted = sortIds(b);
  return aSorted.every((id, i) => id === bSorted[i]);
}

function readPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return undefined;
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDecisionType(value: unknown): BreachDecisionPointType | null {
  if (typeof value !== 'string') return null;
  const t = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (t === 'multi_select' || t === 'multiselect' || t === 'multi') {
    return 'multi_select';
  }
  if (
    t === 'single_select' ||
    t === 'singleselect' ||
    t === 'single' ||
    t === 'enum'
  ) {
    return 'single_select';
  }
  return null;
}

function parseOptions(raw: unknown): BreachDecisionOption[] {
  if (!Array.isArray(raw)) return [];
  const options: BreachDecisionOption[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const id = readTrimmedString(entry.id ?? entry.optionId ?? entry.value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label =
      readTrimmedString(entry.label ?? entry.title ?? entry.name) || id;
    const detail = readTrimmedString(entry.detail ?? entry.description);
    options.push({
      id,
      label,
      detail: detail || undefined,
    });
  }
  return options;
}

function parseDecisionPoint(entry: unknown): BreachDecisionPoint | null {
  if (!isPlainObject(entry)) return null;
  const id = readTrimmedString(
    entry.id ?? entry.decisionPointId ?? entry.decision_point_id
  );
  if (!id) return null;
  const type = normalizeDecisionType(entry.type);
  if (!type) return null;
  const prompt =
    readTrimmedString(entry.prompt ?? entry.question ?? entry.label) || id;
  const options = parseOptions(entry.options ?? entry.choices);
  if (options.length === 0) return null;
  return { id, type, prompt, options };
}

export function parseBreachIncidentStages(
  initialState: Record<string, unknown> | null | undefined
): BreachIncidentStage[] {
  if (!isPlainObject(initialState)) return [];
  const raw = initialState.stages;
  if (!Array.isArray(raw)) return [];

  const stages: BreachIncidentStage[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const id = readTrimmedString(entry.id ?? entry.stageId ?? entry.stage_id);
    if (!id) continue;
    const title =
      readTrimmedString(entry.title ?? entry.name ?? entry.label) || id;
    const brief = readTrimmedString(
      entry.brief ?? entry.narrative ?? entry.description ?? entry.summary
    );
    const decisionPointsRaw =
      entry.decisionPoints ?? entry.decision_points ?? entry.decisions;
    const decisionPoints: BreachDecisionPoint[] = [];
    if (Array.isArray(decisionPointsRaw)) {
      for (const dp of decisionPointsRaw) {
        const parsed = parseDecisionPoint(dp);
        if (parsed) decisionPoints.push(parsed);
      }
    }
    stages.push({ id, title, brief, decisionPoints });
  }
  return stages;
}

export function listBreachDecisionPoints(
  initialState: Record<string, unknown> | null | undefined
): BreachDecisionPoint[] {
  return parseBreachIncidentStages(initialState).flatMap(
    (stage) => stage.decisionPoints
  );
}

export function parseBreachIncidentFacts(
  initialState: Record<string, unknown> | null | undefined
): BreachIncidentFacts | null {
  if (!isPlainObject(initialState)) return null;
  const raw = isPlainObject(initialState.incident)
    ? initialState.incident
    : null;
  if (!raw) return null;
  const id = readTrimmedString(raw.id ?? raw.incidentId ?? raw.incident_id);
  const title = readTrimmedString(raw.title ?? raw.name ?? raw.summary);
  const system = readTrimmedString(
    raw.system ?? raw.systemName ?? raw.system_name
  );
  if (!id && !title && !system) return null;
  return {
    id: id || 'INC',
    title: title || 'Major incident',
    system: system || 'Information system',
  };
}

function parseAnswerKeyEntry(entry: unknown): BreachAnswerKeyEntry | null {
  if (!isPlainObject(entry)) return null;
  const type =
    normalizeDecisionType(entry.type) ??
    (Array.isArray(
      entry.correctOptionIds ??
        entry.correct_option_ids ??
        entry.correctIds ??
        entry.correct_ids
    )
      ? 'multi_select'
      : entry.correctOptionId || entry.correct_option_id || entry.correctId
        ? 'single_select'
        : null);
  if (!type) return null;

  if (type === 'multi_select') {
    const correctOptionIds = sortIds(
      normalizeStringIds(
        entry.correctOptionIds ??
          entry.correct_option_ids ??
          entry.correctIds ??
          entry.correct_ids ??
          entry.optionIds
      )
    );
    if (correctOptionIds.length === 0) return null;
    return { type: 'multi_select', correctOptionIds };
  }

  const correctOptionId = readTrimmedString(
    entry.correctOptionId ??
      entry.correct_option_id ??
      entry.correctId ??
      entry.correct_id ??
      entry.optionId
  );
  if (!correctOptionId) return null;
  return { type: 'single_select', correctOptionId };
}

export function parseBreachIncidentCommandExpectedState(
  expectedState: Record<string, unknown> | null | undefined,
  initialState?: Record<string, unknown> | null
): BreachIncidentCommandExpectedState | null {
  if (!isPlainObject(expectedState)) return null;

  const rawDecisions =
    expectedState.decisions ??
    expectedState.answerKey ??
    expectedState.answer_key;
  if (!isPlainObject(rawDecisions)) return null;

  const decisions: Record<string, BreachAnswerKeyEntry> = {};
  for (const [key, value] of Object.entries(rawDecisions)) {
    const id = key.trim();
    if (!id) continue;
    const parsed = parseAnswerKeyEntry(value);
    if (parsed) decisions[id] = parsed;
  }
  if (Object.keys(decisions).length === 0) return null;

  const minFromExpected = readPositiveInt(
    expectedState.minJustificationLength ??
      expectedState.min_justification_length ??
      expectedState.minDraftLength
  );
  const minFromInitial = isPlainObject(initialState)
    ? readPositiveInt(
        initialState.minJustificationLength ??
          initialState.min_justification_length
      )
    : undefined;

  const passThresholdPercent =
    readPositiveInt(
      expectedState.passThresholdPercent ??
        expectedState.pass_threshold_percent ??
        expectedState.passThreshold
    ) ?? BREACH_INCIDENT_COMMAND_DEFAULT_PASS_THRESHOLD;

  const requireAllJustifications =
    typeof expectedState.requireAllJustifications === 'boolean'
      ? expectedState.requireAllJustifications
      : typeof expectedState.require_all_justifications === 'boolean'
        ? expectedState.require_all_justifications
        : true;

  return {
    decisions,
    minJustificationLength:
      minFromExpected ??
      minFromInitial ??
      BREACH_INCIDENT_COMMAND_MIN_JUSTIFICATION_LENGTH,
    passThresholdPercent: Math.min(100, passThresholdPercent),
    requireAllJustifications,
  };
}

function extractDecisionSubmission(
  entry: unknown
): BreachDecisionSubmission | null {
  if (!isPlainObject(entry)) return null;

  const justificationRaw =
    entry.justification ??
    entry.rationale ??
    entry.reason ??
    entry.memo ??
    entry.notes;
  if (typeof justificationRaw !== 'string') return null;
  const justification = justificationRaw.trim();

  const multiRaw =
    entry.selectedOptionIds ??
    entry.selected_option_ids ??
    entry.optionIds ??
    entry.option_ids ??
    entry.selectedIds;
  if (Array.isArray(multiRaw)) {
    return {
      selectedOptionIds: normalizeStringIds(multiRaw),
      justification,
    };
  }

  const singleRaw =
    entry.selectedOptionId ??
    entry.selected_option_id ??
    entry.optionId ??
    entry.option_id ??
    entry.selectedId;
  if (typeof singleRaw === 'string' && singleRaw.trim()) {
    return {
      selectedOptionId: singleRaw.trim(),
      justification,
    };
  }

  return null;
}

export function extractBreachIncidentCommandSubmission(
  submission: TicketSubmission
): BreachIncidentCommandSubmission | null {
  const raw =
    submission.decisions ??
    submission.answers ??
    submission.decisionPoints ??
    submission.decision_points;
  if (!isPlainObject(raw)) return null;

  const decisions: Record<string, BreachDecisionSubmission> = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = key.trim();
    if (!id) continue;
    const parsed = extractDecisionSubmission(value);
    if (parsed) decisions[id] = parsed;
  }

  if (Object.keys(decisions).length === 0) return null;

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'breach_incident_command',
    decisions,
  };
}

function evaluateDecisionPoint(args: {
  decisionPoint: BreachDecisionPoint;
  answer: BreachAnswerKeyEntry;
  submitted: BreachDecisionSubmission | undefined;
  minJustificationLength: number;
  requireAllJustifications: boolean;
}): BreachDecisionPointResult {
  const { decisionPoint, answer, submitted, minJustificationLength } = args;
  const type = decisionPoint.type;

  const expectedOptionIds =
    answer.type === 'multi_select'
      ? sortIds(answer.correctOptionIds)
      : [answer.correctOptionId];

  const base: BreachDecisionPointResult = {
    decisionPointId: decisionPoint.id,
    type,
    passed: false,
    selectionMatch: false,
    justificationOk: false,
    justificationLength: submitted?.justification.length ?? 0,
    submittedOptionIds: [],
    expectedOptionIds,
    missingOptionIds: [],
    extraOptionIds: [],
  };

  if (!submitted) {
    base.reason = 'missing_decision';
    base.missingOptionIds = expectedOptionIds;
    return base;
  }

  const allowedIds = new Set(decisionPoint.options.map((o) => o.id));
  let submittedOptionIds: string[] = [];

  if (type === 'multi_select') {
    submittedOptionIds = sortIds(submitted.selectedOptionIds ?? []);
  } else {
    const id = submitted.selectedOptionId?.trim() ?? '';
    submittedOptionIds = id ? [id] : [];
  }

  base.submittedOptionIds = submittedOptionIds;

  const unknown = submittedOptionIds.filter((id) => !allowedIds.has(id));
  if (unknown.length > 0) {
    base.extraOptionIds = unknown;
    base.reason = 'unknown_option_ids';
    return base;
  }

  if (type === 'single_select' && submittedOptionIds.length !== 1) {
    base.missingOptionIds =
      submittedOptionIds.length === 0 ? expectedOptionIds : [];
    base.extraOptionIds =
      submittedOptionIds.length > 1 ? submittedOptionIds : [];
    base.reason = 'invalid_single_select';
    return base;
  }

  const missingOptionIds = sortIds(
    setDiff(expectedOptionIds, submittedOptionIds)
  );
  const extraOptionIds = sortIds(
    setDiff(submittedOptionIds, expectedOptionIds)
  );
  const selectionMatch = setsEqual(submittedOptionIds, expectedOptionIds);

  base.missingOptionIds = missingOptionIds;
  base.extraOptionIds = extraOptionIds;
  base.selectionMatch = selectionMatch;

  const justificationLength = submitted.justification.length;
  base.justificationLength = justificationLength;
  const justificationOk =
    !args.requireAllJustifications ||
    justificationLength >= minJustificationLength;
  base.justificationOk = justificationOk;

  if (!selectionMatch) {
    base.reason =
      missingOptionIds.length > 0 ? 'incorrect_selection' : 'extra_options';
    return base;
  }

  if (!justificationOk) {
    base.reason = 'justification_too_short';
    return base;
  }

  base.passed = true;
  return base;
}

export function evaluateBreachIncidentCommandDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: BreachIncidentCommandSubmission | null;
  structured: BreachIncidentCommandStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const initial = isPlainObject(ticket.initial_state)
    ? ticket.initial_state
    : null;
  const expected = parseBreachIncidentCommandExpectedState(
    ticket.expected_state,
    initial
  );
  const decisionPoints = listBreachDecisionPoints(initial);
  const parsed = extractBreachIncidentCommandSubmission(submission);

  const structured: BreachIncidentCommandStructuredResult = {
    style: 'breach_incident_command',
    passThresholdPercent:
      expected?.passThresholdPercent ??
      BREACH_INCIDENT_COMMAND_DEFAULT_PASS_THRESHOLD,
    percentage: 0,
    passedCount: 0,
    totalCount: 0,
    minJustificationLength:
      expected?.minJustificationLength ??
      BREACH_INCIDENT_COMMAND_MIN_JUSTIFICATION_LENGTH,
    requireAllJustifications: expected?.requireAllJustifications ?? true,
    decisionResults: [],
  };

  if (!expected) {
    structured.reason = 'misconfigured_expected_state';
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        'This breach incident-command ticket is missing decisions in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (decisionPoints.length === 0) {
    structured.reason = 'misconfigured_initial_state';
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        'This breach incident-command ticket is missing stages/decisionPoints in initial_state.',
    };
  }

  if (!parsed) {
    structured.reason = 'missing_fields';
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include decisions as a map of decision-point answers (selection + justification).',
    };
  }

  const decisionPointById = new Map(decisionPoints.map((dp) => [dp.id, dp]));
  const answerIds = Object.keys(expected.decisions);
  const decisionResults: BreachDecisionPointResult[] = [];

  for (const answerId of answerIds) {
    const decisionPoint = decisionPointById.get(answerId);
    const answer = expected.decisions[answerId];
    if (!decisionPoint || !answer) {
      decisionResults.push({
        decisionPointId: answerId,
        type: answer?.type ?? 'single_select',
        passed: false,
        selectionMatch: false,
        justificationOk: false,
        justificationLength: 0,
        submittedOptionIds: [],
        expectedOptionIds:
          answer?.type === 'multi_select'
            ? answer.correctOptionIds
            : answer
              ? [answer.correctOptionId]
              : [],
        missingOptionIds: [],
        extraOptionIds: [],
        reason: 'missing_decision_point_definition',
      });
      continue;
    }

    // Type mismatch between seed UI and answer key → fail that point.
    if (decisionPoint.type !== answer.type) {
      decisionResults.push({
        decisionPointId: answerId,
        type: decisionPoint.type,
        passed: false,
        selectionMatch: false,
        justificationOk: false,
        justificationLength: 0,
        submittedOptionIds: [],
        expectedOptionIds:
          answer.type === 'multi_select'
            ? answer.correctOptionIds
            : [answer.correctOptionId],
        missingOptionIds: [],
        extraOptionIds: [],
        reason: 'type_mismatch',
      });
      continue;
    }

    decisionResults.push(
      evaluateDecisionPoint({
        decisionPoint,
        answer,
        submitted: parsed.decisions[answerId],
        minJustificationLength: expected.minJustificationLength,
        requireAllJustifications: expected.requireAllJustifications,
      })
    );
  }

  const passedCount = decisionResults.filter((r) => r.passed).length;
  const totalCount = decisionResults.length;
  const percentage =
    totalCount === 0 ? 0 : Math.round((passedCount / totalCount) * 100);

  structured.decisionResults = decisionResults;
  structured.passedCount = passedCount;
  structured.totalCount = totalCount;
  structured.percentage = percentage;
  structured.passThresholdPercent = expected.passThresholdPercent;
  structured.minJustificationLength = expected.minJustificationLength;
  structured.requireAllJustifications = expected.requireAllJustifications;

  const ok = totalCount > 0 && percentage >= expected.passThresholdPercent;

  if (!ok) {
    const failed = decisionResults.filter((r) => !r.passed);
    const preview = failed
      .slice(0, 3)
      .map((r) => {
        if (r.reason === 'justification_too_short') {
          return `${r.decisionPointId}: justification too short (${r.justificationLength}/${expected.minJustificationLength})`;
        }
        if (r.reason === 'missing_decision') {
          return `${r.decisionPointId}: missing answer`;
        }
        const parts: string[] = [];
        if (r.missingOptionIds.length > 0) {
          parts.push(`missing ${r.missingOptionIds.join(', ')}`);
        }
        if (r.extraOptionIds.length > 0) {
          parts.push(`extra ${r.extraOptionIds.join(', ')}`);
        }
        return `${r.decisionPointId}: ${parts.join('; ') || r.reason || 'incorrect'}`;
      })
      .join(' · ');

    structured.reason =
      failed.some((r) => r.reason === 'justification_too_short') &&
      failed.every(
        (r) => r.selectionMatch || r.reason === 'justification_too_short'
      )
        ? 'justification_too_short'
        : 'below_threshold';

    return {
      parsed,
      structured,
      ok: false,
      feedback: `Incident-command decisions scored ${percentage}% (${passedCount}/${totalCount}); need ${expected.passThresholdPercent}%.${preview ? ` Review: ${preview}.` : ''}`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback: `Incident-command decisions match the seeded best-practice answer key (${percentage}% · ${passedCount}/${totalCount} decision points).`,
  };
}

export const breachIncidentCommandTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateBreachIncidentCommandDeterministic(
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
