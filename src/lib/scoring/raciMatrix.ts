import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * RACI responsibility-matrix scoring.
 *
 * Fully deterministic: compare each activity × role cell in the submission
 * against `expected_state.assignments`. Empty/blank cells match empty expected
 * cells. Optional `passThresholdPercent` (default 100).
 *
 * initial_state:
 *   {
 *     prompt?: string;
 *     activitySummary?: string;
 *     orgUnits: Array<{
 *       id, title, name?, reportsTo?, description?
 *     }>;
 *     roles: Array<{ id, title, name? }> | string[]; // or derived from orgUnits
 *     activities: Array<{ id, label, description? }>;
 *     raciLegend?: Record<'R'|'A'|'C'|'I', string>;
 *   }
 *
 * expected_state:
 *   {
 *     assignments: { [activityId]: { [roleId]: 'R'|'A'|'C'|'I'|'' } };
 *     passThresholdPercent?: number; // default 100
 *     requireSingleAccountable?: boolean; // default true (submission gate)
 *     requireAtLeastOneResponsible?: boolean; // default true (submission gate)
 *   }
 *
 * submission:
 *   {
 *     type: 'raci_matrix' | 'raci' | 'responsibility_matrix';
 *     assignments: { [activityId]: { [roleId]: 'R'|'A'|'C'|'I'|'' } }
 *   }
 */

export const RACI_MATRIX_TICKET_TYPES = [
  'raci_matrix',
  'raci',
  'responsibility_matrix',
] as const;

export type RaciMatrixTicketType = (typeof RACI_MATRIX_TICKET_TYPES)[number];

export const RACI_CODES = ['R', 'A', 'C', 'I'] as const;
export type RaciCode = (typeof RACI_CODES)[number];
export type RaciCellValue = RaciCode | '';

export const RACI_CODE_LABELS: Record<RaciCode, string> = {
  R: 'Responsible',
  A: 'Accountable',
  C: 'Consulted',
  I: 'Informed',
};

export type RaciOrgUnit = {
  id: string;
  title: string;
  name: string;
  reportsTo: string | null;
  description: string;
};

export type RaciRole = {
  id: string;
  title: string;
  name: string;
};

export type RaciActivity = {
  id: string;
  label: string;
  description: string;
};

export type RaciAssignments = Record<string, Record<string, RaciCellValue>>;

export type RaciMatrixExpectedState = {
  assignments: RaciAssignments;
  passThresholdPercent: number;
  requireSingleAccountable: boolean;
  requireAtLeastOneResponsible: boolean;
};

export type RaciMatrixSubmission = {
  type?: string;
  assignments: RaciAssignments;
};

export type RaciCellResult = {
  activityId: string;
  roleId: string;
  submitted: RaciCellValue;
  expected: RaciCellValue;
  passed: boolean;
};

export type RaciMatrixStructuredResult = {
  style: 'raci_matrix';
  passThresholdPercent: number;
  percentage: number;
  passedCount: number;
  totalCount: number;
  cellResults: RaciCellResult[];
  mismatchedCells: Array<{
    activityId: string;
    roleId: string;
    submitted: RaciCellValue;
    expected: RaciCellValue;
  }>;
  structuralIssues: string[];
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isRaciMatrixTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (RACI_MATRIX_TICKET_TYPES as readonly string[]).includes(base);
}

export function isRaciCode(value: string): value is RaciCode {
  return (RACI_CODES as readonly string[]).includes(value);
}

export function normalizeRaciCellValue(value: unknown): RaciCellValue | null {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  if (!trimmed || trimmed === '-' || trimmed === 'NONE' || trimmed === 'N/A') {
    return '';
  }
  if (isRaciCode(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower === 'responsible') return 'R';
  if (lower === 'accountable') return 'A';
  if (lower === 'consulted') return 'C';
  if (lower === 'informed') return 'I';
  return null;
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseRaciOrgUnits(
  initialState: Record<string, unknown> | null | undefined
): RaciOrgUnit[] {
  if (!isPlainObject(initialState)) return [];

  const raw =
    initialState.orgUnits ??
    initialState.org_units ??
    initialState.orgChart ??
    initialState.org_chart;

  if (!Array.isArray(raw)) return [];

  const units: RaciOrgUnit[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const id = readTrimmedString(entry.id ?? entry.roleId ?? entry.role_id);
    if (!id) continue;
    const title =
      readTrimmedString(entry.title ?? entry.role ?? entry.label) || id;
    const name = readTrimmedString(
      entry.name ?? entry.person ?? entry.occupant
    );
    const reportsToRaw = entry.reportsTo ?? entry.reports_to ?? entry.parentId;
    const reportsTo =
      typeof reportsToRaw === 'string' && reportsToRaw.trim()
        ? reportsToRaw.trim()
        : null;
    const description = readTrimmedString(
      entry.description ?? entry.notes ?? entry.summary
    );
    units.push({ id, title, name, reportsTo, description });
  }
  return units;
}

export function parseRaciRoles(
  initialState: Record<string, unknown> | null | undefined
): RaciRole[] {
  if (!isPlainObject(initialState)) return [];

  const raw = initialState.roles ?? initialState.roleColumns;
  if (Array.isArray(raw) && raw.length > 0) {
    const roles: RaciRole[] = [];
    for (const entry of raw) {
      if (typeof entry === 'string' && entry.trim()) {
        const id = entry.trim();
        roles.push({ id, title: id, name: '' });
        continue;
      }
      if (!isPlainObject(entry)) continue;
      const id = readTrimmedString(entry.id ?? entry.roleId ?? entry.role_id);
      if (!id) continue;
      roles.push({
        id,
        title:
          readTrimmedString(entry.title ?? entry.label ?? entry.role) || id,
        name: readTrimmedString(entry.name ?? entry.person),
      });
    }
    if (roles.length > 0) return roles;
  }

  // Fall back to org chart order when roles are not listed separately.
  return parseRaciOrgUnits(initialState).map((unit) => ({
    id: unit.id,
    title: unit.title,
    name: unit.name,
  }));
}

export function parseRaciActivities(
  initialState: Record<string, unknown> | null | undefined
): RaciActivity[] {
  if (!isPlainObject(initialState)) return [];

  const raw =
    initialState.activities ??
    initialState.tasks ??
    initialState.securityActivities;

  if (!Array.isArray(raw)) return [];

  const activities: RaciActivity[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.trim()) {
      const id = entry.trim();
      activities.push({ id, label: id, description: '' });
      continue;
    }
    if (!isPlainObject(entry)) continue;
    const id = readTrimmedString(entry.id ?? entry.activityId ?? entry.key);
    if (!id) continue;
    activities.push({
      id,
      label:
        readTrimmedString(
          entry.label ?? entry.title ?? entry.name ?? entry.activity
        ) || id,
      description: readTrimmedString(entry.description ?? entry.notes),
    });
  }
  return activities;
}

function parseAssignmentsObject(
  raw: unknown,
  options: { allowInvalidCells?: boolean } = {}
): RaciAssignments | null {
  if (!isPlainObject(raw)) return null;

  const assignments: RaciAssignments = {};
  for (const [activityIdRaw, roleMapRaw] of Object.entries(raw)) {
    const activityId = activityIdRaw.trim();
    if (!activityId || !isPlainObject(roleMapRaw)) continue;

    const roleMap: Record<string, RaciCellValue> = {};
    for (const [roleIdRaw, cellRaw] of Object.entries(roleMapRaw)) {
      const roleId = roleIdRaw.trim();
      if (!roleId) continue;
      const cell = normalizeRaciCellValue(cellRaw);
      if (cell === null) {
        if (options.allowInvalidCells) continue;
        return null;
      }
      roleMap[roleId] = cell;
    }
    assignments[activityId] = roleMap;
  }

  return assignments;
}

export function parseRaciMatrixExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): RaciMatrixExpectedState | null {
  if (!isPlainObject(expectedState)) return null;

  const assignments = parseAssignmentsObject(
    expectedState.assignments ??
      expectedState.expectedAssignments ??
      expectedState.raci ??
      expectedState.matrix,
    { allowInvalidCells: true }
  );
  if (!assignments || Object.keys(assignments).length === 0) return null;

  let passThresholdPercent = 100;
  const thresholdRaw = expectedState.passThresholdPercent;
  if (
    typeof thresholdRaw === 'number' &&
    Number.isFinite(thresholdRaw) &&
    thresholdRaw >= 0 &&
    thresholdRaw <= 100
  ) {
    passThresholdPercent = thresholdRaw;
  }

  const requireSingleAccountable =
    expectedState.requireSingleAccountable !== false;
  const requireAtLeastOneResponsible =
    expectedState.requireAtLeastOneResponsible !== false;

  return {
    assignments,
    passThresholdPercent,
    requireSingleAccountable,
    requireAtLeastOneResponsible,
  };
}

export function extractRaciMatrixSubmission(
  submission: TicketSubmission
): RaciMatrixSubmission | null {
  const nested =
    submission.assignments ??
    submission.raci ??
    submission.matrix ??
    submission.answers;

  const assignments = parseAssignmentsObject(nested);
  if (!assignments) return null;

  return {
    type: typeof submission.type === 'string' ? submission.type : 'raci_matrix',
    assignments,
  };
}

function collectScoredCells(args: {
  activities: RaciActivity[];
  roles: RaciRole[];
  expected: RaciAssignments;
  submitted: RaciAssignments;
}): RaciCellResult[] {
  const activityIds =
    args.activities.length > 0
      ? args.activities.map((a) => a.id)
      : Object.keys(args.expected);

  const roleIds =
    args.roles.length > 0
      ? args.roles.map((r) => r.id)
      : Array.from(
          new Set(
            Object.values(args.expected).flatMap((row) => Object.keys(row))
          )
        );

  const results: RaciCellResult[] = [];
  for (const activityId of activityIds) {
    for (const roleId of roleIds) {
      const expected = args.expected[activityId]?.[roleId] ?? '';
      const submitted = args.submitted[activityId]?.[roleId] ?? '';
      results.push({
        activityId,
        roleId,
        submitted,
        expected,
        passed: submitted === expected,
      });
    }
  }
  return results;
}

function structuralIssuesForSubmission(args: {
  activities: RaciActivity[];
  roles: RaciRole[];
  submitted: RaciAssignments;
  requireSingleAccountable: boolean;
  requireAtLeastOneResponsible: boolean;
}): string[] {
  const issues: string[] = [];
  const activityIds =
    args.activities.length > 0
      ? args.activities.map((a) => a.id)
      : Object.keys(args.submitted);
  const roleIds =
    args.roles.length > 0
      ? args.roles.map((r) => r.id)
      : Array.from(
          new Set(
            Object.values(args.submitted).flatMap((row) => Object.keys(row))
          )
        );

  for (const activityId of activityIds) {
    const row = args.submitted[activityId] ?? {};
    let accountableCount = 0;
    let responsibleCount = 0;
    for (const roleId of roleIds) {
      const cell = row[roleId] ?? '';
      if (cell === 'A') accountableCount += 1;
      if (cell === 'R') responsibleCount += 1;
    }
    if (args.requireSingleAccountable && accountableCount !== 1) {
      issues.push(
        `Activity "${activityId}" must have exactly one Accountable (A); found ${accountableCount}.`
      );
    }
    if (args.requireAtLeastOneResponsible && responsibleCount < 1) {
      issues.push(
        `Activity "${activityId}" must have at least one Responsible (R).`
      );
    }
  }

  return issues;
}

export function evaluateRaciMatrixDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: RaciMatrixSubmission | null;
  structured: RaciMatrixStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseRaciMatrixExpectedState(ticket.expected_state);
  const activities = parseRaciActivities(ticket.initial_state);
  const roles = parseRaciRoles(ticket.initial_state);
  const parsed = extractRaciMatrixSubmission(submission);

  const structured: RaciMatrixStructuredResult = {
    style: 'raci_matrix',
    passThresholdPercent: expected?.passThresholdPercent ?? 100,
    percentage: 0,
    passedCount: 0,
    totalCount: 0,
    cellResults: [],
    mismatchedCells: [],
    structuralIssues: [],
  };

  if (!expected) {
    structured.reason = 'misconfigured_expected_state';
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        'This RACI matrix ticket is missing assignments in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    structured.reason = 'missing_fields';
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include assignments as an activity → role → R/A/C/I map.',
    };
  }

  const structuralIssues = structuralIssuesForSubmission({
    activities,
    roles,
    submitted: parsed.assignments,
    requireSingleAccountable: expected.requireSingleAccountable,
    requireAtLeastOneResponsible: expected.requireAtLeastOneResponsible,
  });
  structured.structuralIssues = structuralIssues;

  if (structuralIssues.length > 0) {
    structured.reason = 'structural_rules_failed';
    return {
      parsed,
      structured,
      ok: false,
      feedback: structuralIssues.join(' '),
    };
  }

  const cellResults = collectScoredCells({
    activities,
    roles,
    expected: expected.assignments,
    submitted: parsed.assignments,
  });

  const passedCount = cellResults.filter((c) => c.passed).length;
  const totalCount = cellResults.length;
  const percentage =
    totalCount === 0 ? 0 : Math.round((passedCount / totalCount) * 100);
  const mismatchedCells = cellResults
    .filter((c) => !c.passed)
    .map((c) => ({
      activityId: c.activityId,
      roleId: c.roleId,
      submitted: c.submitted,
      expected: c.expected,
    }));

  structured.cellResults = cellResults;
  structured.passedCount = passedCount;
  structured.totalCount = totalCount;
  structured.percentage = percentage;
  structured.mismatchedCells = mismatchedCells;
  structured.passThresholdPercent = expected.passThresholdPercent;

  const ok = totalCount > 0 && percentage >= expected.passThresholdPercent;

  if (!ok) {
    structured.reason =
      totalCount === 0 ? 'no_scorable_cells' : 'below_threshold';
    const preview = mismatchedCells
      .slice(0, 4)
      .map(
        (c) =>
          `${c.activityId}/${c.roleId}: expected ${c.expected || '(blank)'}, got ${c.submitted || '(blank)'}`
      )
      .join('; ');
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        totalCount === 0
          ? 'No scorable RACI cells were configured for this ticket.'
          : `RACI mapping scored ${percentage}% (${passedCount}/${totalCount}); need ${expected.passThresholdPercent}%.${preview ? ` Review: ${preview}.` : ''}`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback: `RACI mapping matches the seeded answer key (${percentage}% · ${passedCount}/${totalCount} cells).`,
  };
}

export const raciMatrixTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateRaciMatrixDeterministic(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
