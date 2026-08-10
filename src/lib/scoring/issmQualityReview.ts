import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * ISSM quality review of an ISSO-submitted SSP / POA&M artifact.
 *
 * Fully deterministic:
 *   - exact set match of selected issueIds vs expected_state.issueIds
 *   - feedback length ≥ minFeedbackLength (from expected_state or initial_state)
 *
 * initial_state:
 *   {
 *     prompt?, role?, artifactType?,
 *     system?: { name?, fismaId? },
 *     isso?: { name?, title? },
 *     artifact?: { title?, body?, weakness?, plannedAction?,
 *                  milestoneDate?, owner?, residualRisk?, ... },
 *     candidateIssues: Array<{ id, label, detail? }>,
 *     minFeedbackLength?: number
 *   }
 *
 * expected_state:
 *   {
 *     issueIds: string[],          // or requiredIssueIds / correctIssueIds
 *     minFeedbackLength?: number
 *   }
 *
 * submission:
 *   {
 *     type: 'issm_quality_review' | 'isso_artifact_review' | 'issm_ssp_poam_feedback',
 *     issueIds: string[],
 *     feedback: string
 *   }
 */

export const ISSM_QUALITY_REVIEW_TICKET_TYPES = [
  'issm_quality_review',
  'isso_artifact_review',
  'issm_ssp_poam_feedback',
] as const;

export type IssmQualityReviewTicketType =
  (typeof ISSM_QUALITY_REVIEW_TICKET_TYPES)[number];

export const ISSM_QUALITY_REVIEW_MIN_FEEDBACK_LENGTH = 150;

export type IssmQualityCandidateIssue = {
  id: string;
  label: string;
  detail?: string;
};

export type IssmQualityArtifact = {
  title: string;
  body: string;
  weakness: string;
  plannedAction: string;
  milestoneDate: string;
  owner: string;
  residualRisk: string;
  controlId: string;
  severity: string;
  resources: string;
};

export type IssmQualityReviewExpectedState = {
  issueIds: string[];
  minFeedbackLength: number;
};

export type IssmQualityReviewSubmission = {
  type?: string;
  issueIds: string[];
  feedback: string;
};

export type IssmQualityReviewStructuredResult = {
  style: 'issm_quality_review';
  submittedIssueIds: string[];
  expectedIssueIds: string[];
  issueSetMatch: boolean;
  missingIssueIds: string[];
  extraIssueIds: string[];
  feedbackLength: number;
  minFeedbackLength: number;
  feedbackLengthOk: boolean;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isIssmQualityReviewTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (ISSM_QUALITY_REVIEW_TICKET_TYPES as readonly string[]).includes(base);
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
      const candidate = entry.id ?? entry.issueId ?? entry.issue_id;
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

export function parseIssmQualityCandidateIssues(
  initialState: Record<string, unknown> | null | undefined
): IssmQualityCandidateIssue[] {
  if (!isPlainObject(initialState)) return [];

  const raw =
    initialState.candidateIssues ??
    initialState.candidate_issues ??
    initialState.issues ??
    initialState.options;
  if (!Array.isArray(raw)) return [];

  const issues: IssmQualityCandidateIssue[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const id =
      typeof entry.id === 'string'
        ? entry.id.trim()
        : typeof entry.issueId === 'string'
          ? entry.issueId.trim()
          : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label =
      typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : typeof entry.title === 'string' && entry.title.trim()
          ? entry.title.trim()
          : typeof entry.description === 'string' && entry.description.trim()
            ? entry.description.trim()
            : id;
    const detail =
      typeof entry.detail === 'string' && entry.detail.trim()
        ? entry.detail.trim()
        : typeof entry.description === 'string' &&
            entry.description.trim() &&
            entry.description.trim() !== label
          ? entry.description.trim()
          : undefined;
    issues.push({ id, label, detail });
  }
  return issues;
}

export function parseIssmQualityArtifact(
  initialState: Record<string, unknown> | null | undefined
): IssmQualityArtifact | null {
  if (!isPlainObject(initialState)) return null;
  const raw = isPlainObject(initialState.artifact)
    ? initialState.artifact
    : isPlainObject(initialState.poam)
      ? initialState.poam
      : isPlainObject(initialState.sspExcerpt)
        ? initialState.sspExcerpt
        : null;
  if (!raw) return null;

  const title =
    typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim()
      : typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : 'ISSO artifact';

  const body =
    typeof raw.body === 'string'
      ? raw.body.trim()
      : typeof raw.text === 'string'
        ? raw.text.trim()
        : typeof raw.narrative === 'string'
          ? raw.narrative.trim()
          : '';

  const weakness =
    typeof raw.weakness === 'string'
      ? raw.weakness.trim()
      : typeof raw.weaknessDescription === 'string'
        ? raw.weaknessDescription.trim()
        : '';

  const plannedAction =
    typeof raw.plannedAction === 'string'
      ? raw.plannedAction.trim()
      : typeof raw.planned_action === 'string'
        ? raw.planned_action.trim()
        : typeof raw.remediation === 'string'
          ? raw.remediation.trim()
          : typeof raw.milestones === 'string'
            ? raw.milestones.trim()
            : '';

  const milestoneDate =
    typeof raw.milestoneDate === 'string'
      ? raw.milestoneDate.trim()
      : typeof raw.milestone_date === 'string'
        ? raw.milestone_date.trim()
        : typeof raw.scheduledCompletionDate === 'string'
          ? raw.scheduledCompletionDate.trim()
          : '';

  const owner =
    typeof raw.owner === 'string'
      ? raw.owner.trim()
      : typeof raw.pointOfContact === 'string'
        ? raw.pointOfContact.trim()
        : typeof raw.poc === 'string'
          ? raw.poc.trim()
          : '';

  const residualRisk =
    typeof raw.residualRisk === 'string'
      ? raw.residualRisk.trim()
      : typeof raw.residual_risk === 'string'
        ? raw.residual_risk.trim()
        : '';

  const controlId =
    typeof raw.controlId === 'string'
      ? raw.controlId.trim()
      : typeof raw.control_id === 'string'
        ? raw.control_id.trim()
        : '';

  const severity =
    typeof raw.severity === 'string'
      ? raw.severity.trim()
      : typeof raw.riskLevel === 'string'
        ? raw.riskLevel.trim()
        : '';

  const resources =
    typeof raw.resources === 'string'
      ? raw.resources.trim()
      : typeof raw.resourcesRequired === 'string'
        ? raw.resourcesRequired.trim()
        : '';

  if (!body && !weakness && !plannedAction) return null;

  return {
    title,
    body,
    weakness,
    plannedAction,
    milestoneDate,
    owner,
    residualRisk,
    controlId,
    severity,
    resources,
  };
}

export function parseIssmQualityReviewExpectedState(
  expectedState: Record<string, unknown> | null | undefined,
  initialState?: Record<string, unknown> | null
): IssmQualityReviewExpectedState | null {
  if (!isPlainObject(expectedState)) return null;

  const issueIds = sortIds(
    normalizeStringIds(
      expectedState.issueIds ??
        expectedState.issue_ids ??
        expectedState.requiredIssueIds ??
        expectedState.required_issue_ids ??
        expectedState.correctIssueIds ??
        expectedState.correct_issue_ids
    )
  );
  if (issueIds.length === 0) return null;

  const minFromExpected = readPositiveInt(
    expectedState.minFeedbackLength ??
      expectedState.min_feedback_length ??
      expectedState.minJustificationLength
  );
  const minFromInitial = isPlainObject(initialState)
    ? readPositiveInt(
        initialState.minFeedbackLength ?? initialState.min_feedback_length
      )
    : undefined;

  return {
    issueIds,
    minFeedbackLength:
      minFromExpected ??
      minFromInitial ??
      ISSM_QUALITY_REVIEW_MIN_FEEDBACK_LENGTH,
  };
}

export function extractIssmQualityReviewSubmission(
  submission: TicketSubmission
): IssmQualityReviewSubmission | null {
  const hasIssueArray = Array.isArray(
    submission.issueIds ??
      submission.issue_ids ??
      submission.selectedIssueIds ??
      submission.selected_issue_ids ??
      submission.issues
  );
  if (!hasIssueArray) return null;

  const issueIds = normalizeStringIds(
    submission.issueIds ??
      submission.issue_ids ??
      submission.selectedIssueIds ??
      submission.selected_issue_ids ??
      submission.issues
  );

  const feedbackRaw =
    submission.feedback ??
    submission.feedbackDraft ??
    submission.feedback_draft ??
    submission.memo ??
    submission.comments ??
    submission.rationale;
  if (typeof feedbackRaw !== 'string') return null;

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'issm_quality_review',
    issueIds,
    feedback: feedbackRaw.trim(),
  };
}

export function evaluateIssmQualityReviewDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: IssmQualityReviewSubmission | null;
  structured: IssmQualityReviewStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const initial = isPlainObject(ticket.initial_state)
    ? ticket.initial_state
    : null;
  const expected = parseIssmQualityReviewExpectedState(
    ticket.expected_state,
    initial
  );
  const candidates = parseIssmQualityCandidateIssues(initial);
  const parsed = extractIssmQualityReviewSubmission(submission);

  const structured: IssmQualityReviewStructuredResult = {
    style: 'issm_quality_review',
    submittedIssueIds: parsed ? sortIds(parsed.issueIds) : [],
    expectedIssueIds: expected?.issueIds ?? [],
    issueSetMatch: false,
    missingIssueIds: [],
    extraIssueIds: [],
    feedbackLength: parsed?.feedback.length ?? 0,
    minFeedbackLength:
      expected?.minFeedbackLength ?? ISSM_QUALITY_REVIEW_MIN_FEEDBACK_LENGTH,
    feedbackLengthOk: false,
  };

  if (!expected) {
    structured.reason = 'misconfigured_expected_state';
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        'This ISSM quality review ticket is missing issueIds in expected_state. Ask an admin to fix the seed.',
    };
  }

  if (candidates.length === 0) {
    structured.reason = 'misconfigured_initial_state';
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        'This ISSM quality review ticket is missing candidateIssues in initial_state.',
    };
  }

  if (!parsed) {
    structured.reason = 'missing_fields';
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include issueIds (array) and feedback (string).',
    };
  }

  const candidateSet = new Set(candidates.map((c) => c.id));
  const submittedSorted = sortIds(parsed.issueIds);
  const unknownIds = submittedSorted.filter((id) => !candidateSet.has(id));
  if (unknownIds.length > 0) {
    structured.submittedIssueIds = submittedSorted;
    structured.extraIssueIds = unknownIds;
    structured.reason = 'unknown_issue_ids';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Unknown issue id(s): ${unknownIds.join(', ')}. Select only from the candidate checklist.`,
    };
  }

  const missingIssueIds = sortIds(setDiff(expected.issueIds, submittedSorted));
  const extraIssueIds = sortIds(setDiff(submittedSorted, expected.issueIds));
  const issueSetMatch = setsEqual(submittedSorted, expected.issueIds);
  const feedbackLength = parsed.feedback.length;
  const feedbackLengthOk = feedbackLength >= expected.minFeedbackLength;

  structured.submittedIssueIds = submittedSorted;
  structured.expectedIssueIds = expected.issueIds;
  structured.issueSetMatch = issueSetMatch;
  structured.missingIssueIds = missingIssueIds;
  structured.extraIssueIds = extraIssueIds;
  structured.feedbackLength = feedbackLength;
  structured.minFeedbackLength = expected.minFeedbackLength;
  structured.feedbackLengthOk = feedbackLengthOk;

  if (!issueSetMatch) {
    const parts: string[] = [
      'Quality-issue selection does not match the seeded answer key.',
    ];
    if (missingIssueIds.length > 0) {
      parts.push(`Missing issue(s): ${missingIssueIds.join(', ')}.`);
    }
    if (extraIssueIds.length > 0) {
      parts.push(
        `Incorrectly flagged (distractor or extra): ${extraIssueIds.join(', ')}.`
      );
    }
    structured.reason =
      missingIssueIds.length > 0 ? 'missing_issues' : 'extra_issues';
    return {
      parsed,
      structured,
      ok: false,
      feedback: parts.join(' '),
    };
  }

  if (!feedbackLengthOk) {
    structured.reason = 'feedback_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Feedback draft must be at least ${expected.minFeedbackLength} characters (currently ${feedbackLength}). Cite the specific quality defects and the correction you expect from the ISSO.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Correct quality issues identified and feedback draft meets the length requirement. ISSM review accepted.',
  };
}

export const issmQualityReviewTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateIssmQualityReviewDeterministic(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
