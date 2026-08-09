import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  POAM_STATUS_UPDATE_MIN_JUSTIFICATION_LENGTH,
  POAM_STATUS_UPDATE_STATUSES,
  type PoamStatusUpdateStatus,
} from '@/lib/scoring/ticketUi';

/**
 * POA&M mid-remediation status update scoring (deterministic).
 *
 * Student reviews a seeded POA&M item (weakness, milestones, evidence, dates,
 * owner), chooses on_track | delayed | closed, and justifies the update.
 *
 * Gates:
 *   1. Status matches expected_state.expectedStatus
 *   2. Evidence-before-closure: closed requires scenario evidence that is
 *      provided + verified (and optional student citation of evidence IDs)
 *   3. Justification min-length
 */

export {
  POAM_STATUS_UPDATE_STATUSES,
  POAM_STATUS_UPDATE_STATUS_LABELS,
  POAM_STATUS_UPDATE_MIN_JUSTIFICATION_LENGTH,
  type PoamStatusUpdateStatus,
} from '@/lib/scoring/ticketUi';

export const POAM_STATUS_UPDATE_TICKET_TYPES = [
  'poam_status_update',
  'poam_remediation_status',
  'poam_midpoint_update',
] as const;

export type PoamStatusUpdateTicketType =
  (typeof POAM_STATUS_UPDATE_TICKET_TYPES)[number];

export type PoamStatusUpdateMilestone = {
  id: string;
  description: string;
  dueDate?: string;
  status?: string;
};

export type PoamStatusUpdateEvidence = {
  id: string;
  label: string;
  provided: boolean;
  verified: boolean;
};

export type PoamStatusUpdateItem = {
  id: string;
  weakness: string;
  controlId?: string;
  title?: string;
  owner?: string;
  scheduledCompletionDate?: string;
  currentStatus?: string;
  milestones: PoamStatusUpdateMilestone[];
};

export type PoamStatusUpdateExpectedState = {
  expectedStatus: PoamStatusUpdateStatus;
  minJustificationLength?: number;
  requireEvidenceForClosed?: boolean;
  /** Evidence IDs that may support closure when present + verified in scenario. */
  allowedClosedEvidenceIds?: string[];
};

export type PoamStatusUpdateSubmission = {
  type?: string;
  status: PoamStatusUpdateStatus;
  justification: string;
  /** Optional citations when closing; required if expectedStatus is closed. */
  citedEvidenceIds: string[];
};

export type PoamStatusUpdateStructuredResult = {
  style: 'poam_status_update';
  status: PoamStatusUpdateStatus | null;
  expectedStatus: PoamStatusUpdateStatus | null;
  statusMatch: boolean;
  justificationLength: number;
  minJustificationLength: number;
  justificationOk: boolean;
  evidenceBeforeClosureOk: boolean;
  scenarioAllowsClosure: boolean;
  citedEvidenceIds: string[];
  missingClosureEvidenceIds: string[];
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isPoamStatusUpdateTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (POAM_STATUS_UPDATE_TICKET_TYPES as readonly string[]).includes(base);
}

export function isPoamStatusUpdateStatus(
  value: string
): value is PoamStatusUpdateStatus {
  return (POAM_STATUS_UPDATE_STATUSES as readonly string[]).includes(value);
}

export function normalizePoamStatusUpdateStatus(
  value: unknown
): PoamStatusUpdateStatus | null {
  if (typeof value !== 'string') return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (
    normalized === 'on_track' ||
    normalized === 'ontrack' ||
    normalized === 'ongoing' ||
    normalized === 'in_progress' ||
    normalized === 'inprogress'
  ) {
    return 'on_track';
  }
  if (
    normalized === 'delayed' ||
    normalized === 'behind' ||
    normalized === 'late'
  ) {
    return 'delayed';
  }
  if (
    normalized === 'closed' ||
    normalized === 'completed' ||
    normalized === 'complete' ||
    normalized === 'done'
  ) {
    return 'closed';
  }
  return isPoamStatusUpdateStatus(normalized) ? normalized : null;
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
      const candidate = entry.id ?? entry.evidenceId ?? entry.evidence_id;
      if (typeof candidate === 'string') id = candidate.trim();
    }
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function readBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const n = value.trim().toLowerCase();
    if (n === 'true' || n === 'yes' || n === '1') return true;
    if (n === 'false' || n === 'no' || n === '0') return false;
  }
  return fallback;
}

export function parsePoamStatusUpdateEvidence(
  initialState: Record<string, unknown> | null | undefined
): PoamStatusUpdateEvidence[] {
  if (!isPlainObject(initialState)) return [];
  const raw = initialState.evidence ?? initialState.evidenceItems;
  if (!Array.isArray(raw)) return [];

  const items: PoamStatusUpdateEvidence[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    if (!id) continue;
    const label =
      typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : typeof entry.title === 'string' && entry.title.trim()
          ? entry.title.trim()
          : typeof entry.description === 'string' && entry.description.trim()
            ? entry.description.trim()
            : id;
    items.push({
      id,
      label,
      provided: readBool(entry.provided ?? entry.isProvided, false),
      verified: readBool(
        entry.verified ?? entry.isVerified ?? entry.verificationComplete,
        false
      ),
    });
  }
  return items;
}

export function parsePoamStatusUpdateItem(
  initialState: Record<string, unknown> | null | undefined
): PoamStatusUpdateItem | null {
  if (!isPlainObject(initialState)) return null;
  const raw = isPlainObject(initialState.poamItem)
    ? initialState.poamItem
    : isPlainObject(initialState.poam_item)
      ? initialState.poam_item
      : isPlainObject(initialState.item)
        ? initialState.item
        : null;
  if (!raw) return null;

  const id =
    typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : typeof raw.poamId === 'string' && raw.poamId.trim()
        ? raw.poamId.trim()
        : '';
  const weakness =
    typeof raw.weakness === 'string' && raw.weakness.trim()
      ? raw.weakness.trim()
      : typeof raw.weaknessDescription === 'string' &&
          raw.weaknessDescription.trim()
        ? raw.weaknessDescription.trim()
        : typeof raw.description === 'string' && raw.description.trim()
          ? raw.description.trim()
          : '';
  if (!id || !weakness) return null;

  const milestonesRaw = Array.isArray(raw.milestones) ? raw.milestones : [];
  const milestones: PoamStatusUpdateMilestone[] = [];
  for (const entry of milestonesRaw) {
    if (!isPlainObject(entry)) continue;
    const mid =
      typeof entry.id === 'string' && entry.id.trim()
        ? entry.id.trim()
        : `m-${milestones.length + 1}`;
    const description =
      typeof entry.description === 'string' && entry.description.trim()
        ? entry.description.trim()
        : typeof entry.title === 'string' && entry.title.trim()
          ? entry.title.trim()
          : '';
    if (!description) continue;
    milestones.push({
      id: mid,
      description,
      dueDate:
        typeof entry.dueDate === 'string'
          ? entry.dueDate.trim()
          : typeof entry.due_date === 'string'
            ? entry.due_date.trim()
            : undefined,
      status:
        typeof entry.status === 'string' ? entry.status.trim() : undefined,
    });
  }

  return {
    id,
    weakness,
    controlId:
      typeof raw.controlId === 'string'
        ? raw.controlId.trim()
        : typeof raw.control_id === 'string'
          ? raw.control_id.trim()
          : undefined,
    title: typeof raw.title === 'string' ? raw.title.trim() : undefined,
    owner: typeof raw.owner === 'string' ? raw.owner.trim() : undefined,
    scheduledCompletionDate:
      typeof raw.scheduledCompletionDate === 'string'
        ? raw.scheduledCompletionDate.trim()
        : typeof raw.scheduled_completion_date === 'string'
          ? raw.scheduled_completion_date.trim()
          : undefined,
    currentStatus:
      typeof raw.currentStatus === 'string'
        ? raw.currentStatus.trim()
        : typeof raw.current_status === 'string'
          ? raw.current_status.trim()
          : typeof raw.status === 'string'
            ? raw.status.trim()
            : undefined,
    milestones,
  };
}

export function parsePoamStatusUpdateExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): PoamStatusUpdateExpectedState | null {
  if (!isPlainObject(expectedState)) return null;

  const expectedStatus = normalizePoamStatusUpdateStatus(
    expectedState.expectedStatus ??
      expectedState.expected_status ??
      expectedState.status ??
      expectedState.answer
  );
  if (!expectedStatus) return null;

  const minRaw =
    expectedState.minJustificationLength ??
    expectedState.min_justification_length;
  const minJustificationLength =
    typeof minRaw === 'number' && Number.isFinite(minRaw) && minRaw >= 0
      ? Math.floor(minRaw)
      : undefined;

  const requireEvidenceForClosed = readBool(
    expectedState.requireEvidenceForClosed ??
      expectedState.require_evidence_for_closed,
    true
  );

  const allowedClosedEvidenceIds = normalizeStringIds(
    expectedState.allowedClosedEvidenceIds ??
      expectedState.allowed_closed_evidence_ids ??
      expectedState.closureEvidenceIds
  );

  return {
    expectedStatus,
    minJustificationLength,
    requireEvidenceForClosed,
    allowedClosedEvidenceIds:
      allowedClosedEvidenceIds.length > 0
        ? allowedClosedEvidenceIds
        : undefined,
  };
}

export function extractPoamStatusUpdateSubmission(
  submission: TicketSubmission
): PoamStatusUpdateSubmission | null {
  const status = normalizePoamStatusUpdateStatus(
    submission.status ??
      submission.poamStatus ??
      submission.poam_status ??
      submission.decision
  );
  if (!status) return null;

  const justificationRaw =
    submission.justification ??
    submission.rationale ??
    submission.reason ??
    submission.notes;
  if (typeof justificationRaw !== 'string') return null;

  const citedEvidenceIds = normalizeStringIds(
    submission.citedEvidenceIds ??
      submission.cited_evidence_ids ??
      submission.evidenceIds ??
      submission.evidence_ids ??
      submission.closureEvidenceIds
  );

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'poam_status_update',
    status,
    justification: justificationRaw.trim(),
    citedEvidenceIds,
  };
}

/**
 * Scenario-side evidence-before-closure check: required evidence IDs must be
 * present in initial_state with provided=true and verified=true.
 */
export function evaluateScenarioClosureEvidence(
  initialState: Record<string, unknown> | null | undefined,
  expected: PoamStatusUpdateExpectedState
): {
  allowsClosure: boolean;
  missingClosureEvidenceIds: string[];
  verifiedAllowedIds: string[];
} {
  const evidence = parsePoamStatusUpdateEvidence(initialState);
  const byId = new Map(evidence.map((item) => [item.id, item]));

  const requiredIds =
    expected.allowedClosedEvidenceIds &&
    expected.allowedClosedEvidenceIds.length > 0
      ? expected.allowedClosedEvidenceIds
      : evidence.filter((e) => e.provided && e.verified).map((e) => e.id);

  // When allow-list is configured, every listed ID must be provided+verified.
  const missingClosureEvidenceIds: string[] = [];
  const verifiedAllowedIds: string[] = [];

  if (requiredIds.length === 0) {
    return {
      allowsClosure: false,
      missingClosureEvidenceIds: [],
      verifiedAllowedIds: [],
    };
  }

  for (const id of requiredIds) {
    const item = byId.get(id);
    if (item?.provided && item.verified) {
      verifiedAllowedIds.push(id);
    } else {
      missingClosureEvidenceIds.push(id);
    }
  }

  return {
    allowsClosure: missingClosureEvidenceIds.length === 0,
    missingClosureEvidenceIds,
    verifiedAllowedIds,
  };
}

export function evaluatePoamStatusUpdateDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: PoamStatusUpdateSubmission | null;
  structured: PoamStatusUpdateStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parsePoamStatusUpdateExpectedState(ticket.expected_state);
  const minJustificationLength =
    expected?.minJustificationLength ??
    POAM_STATUS_UPDATE_MIN_JUSTIFICATION_LENGTH;
  const parsed = extractPoamStatusUpdateSubmission(submission);

  const closureCheck = expected
    ? evaluateScenarioClosureEvidence(ticket.initial_state, expected)
    : {
        allowsClosure: false,
        missingClosureEvidenceIds: [] as string[],
        verifiedAllowedIds: [] as string[],
      };

  const requireEvidenceForClosed = expected?.requireEvidenceForClosed ?? true;

  const base: PoamStatusUpdateStructuredResult = {
    style: 'poam_status_update',
    status: parsed?.status ?? null,
    expectedStatus: expected?.expectedStatus ?? null,
    statusMatch: false,
    justificationLength: parsed?.justification.length ?? 0,
    minJustificationLength,
    justificationOk: false,
    evidenceBeforeClosureOk: true,
    scenarioAllowsClosure: closureCheck.allowsClosure,
    citedEvidenceIds: parsed?.citedEvidenceIds ?? [],
    missingClosureEvidenceIds: closureCheck.missingClosureEvidenceIds,
  };

  if (!expected) {
    return {
      parsed,
      structured: { ...base, reason: 'misconfigured_expected_state' },
      ok: false,
      feedback:
        'This POA&M status ticket is missing expectedStatus in expected_state.',
    };
  }

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...base, reason: 'missing_fields' },
      ok: false,
      feedback:
        'Submission must include status (on_track | delayed | closed) and justification.',
    };
  }

  const justificationOk = parsed.justification.length >= minJustificationLength;
  const statusMatch = parsed.status === expected.expectedStatus;

  let evidenceBeforeClosureOk = true;
  if (parsed.status === 'closed' && requireEvidenceForClosed) {
    if (!closureCheck.allowsClosure) {
      evidenceBeforeClosureOk = false;
    } else if (expected.expectedStatus === 'closed') {
      // When the key expects closed, student must cite at least one verified ID.
      const citedOk = parsed.citedEvidenceIds.some((id) =>
        closureCheck.verifiedAllowedIds.includes(id)
      );
      if (!citedOk) evidenceBeforeClosureOk = false;
    } else if (parsed.citedEvidenceIds.length > 0) {
      // Closing against a non-closed key still fails status match; citations
      // must still be in the verified allow-list if provided.
      const citedOk = parsed.citedEvidenceIds.every((id) =>
        closureCheck.verifiedAllowedIds.includes(id)
      );
      if (!citedOk) evidenceBeforeClosureOk = false;
    }
  }

  const structured: PoamStatusUpdateStructuredResult = {
    ...base,
    status: parsed.status,
    statusMatch,
    justificationLength: parsed.justification.length,
    justificationOk,
    evidenceBeforeClosureOk,
    citedEvidenceIds: parsed.citedEvidenceIds,
  };

  if (!justificationOk) {
    structured.reason = 'justification_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Justification must be at least ${minJustificationLength} characters.`,
    };
  }

  if (!evidenceBeforeClosureOk) {
    structured.reason = 'evidence_before_closure';
    const missing =
      closureCheck.missingClosureEvidenceIds.length > 0
        ? ` Missing or unverified required evidence: ${closureCheck.missingClosureEvidenceIds.join(', ')}.`
        : '';
    const citeHint =
      expected.expectedStatus === 'closed' && closureCheck.allowsClosure
        ? ' Cite a verified evidence ID from the scenario when closing.'
        : '';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Cannot close this POA&M item without required verification evidence.${missing}${citeHint}`,
    };
  }

  if (!statusMatch) {
    structured.reason = 'incorrect_status';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Status should be "${expected.expectedStatus}" based on milestones, dates, and evidence in the scenario.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback: `Correct POA&M status update (${expected.expectedStatus}) with adequate justification.`,
  };
}

export const poamStatusUpdateTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluatePoamStatusUpdateDeterministic(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
