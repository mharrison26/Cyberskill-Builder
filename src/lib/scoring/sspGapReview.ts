import type { TrainingFeedback } from '@/lib/feedback/types';
import { buildChecklistTrainingFeedback } from '@/lib/feedback/server';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { parseSspCandidateGaps } from '@/lib/scoring/sspGapReviewParse';

export {
  parseSspCandidateGaps,
  parseSspExcerpt,
  type SspCandidateGap,
  type SspControlImplementation,
  type SspExcerpt,
} from '@/lib/scoring/sspGapReviewParse';

/**
 * Draft SSP quality / gap review scoring (deterministic).
 *
 * Student reads a seeded SSP excerpt with intentional defects and selects
 * matching findings from a checklist that includes distractors.
 *
 * Scoring rule (partial credit):
 *   - Each candidate finding is scored as a binary option check
 *     (select required gaps; leave distractors unselected).
 *   - percentage = correctOptions / totalCandidates × 100
 *   - Also report recall = foundRequired / totalRequired × 100
 *   - status = resolved when percentage ≥ passThresholdPercent (default 100)
 *     AND every required gap is selected (no missing required gaps).
 *   - Selecting distractors lowers percentage and blocks resolve at 100%.
 *   - Finding only some required gaps → needs_revision with partial percentage.
 *
 * initial_state:
 *   {
 *     prompt?, systemName?, sspTitle?,
 *     sspExcerpt: { overview?, roles?, controlImplementations: [...] },
 *     candidateGaps: Array<{ id, label, detail? }>
 *   }
 *
 * expected_state:
 *   {
 *     requiredGapIds: string[],   // or gaps: [{ id }] / gapIds
 *     passThresholdPercent?: number  // default 100
 *   }
 *
 * submission:
 *   {
 *     type: 'ssp_gap_review' | 'ssp_quality_review' | 'draft_ssp_gaps',
 *     selectedGapIds: string[]
 *   }
 */

export const SSP_GAP_REVIEW_TICKET_TYPES = [
  'ssp_gap_review',
  'ssp_quality_review',
  'draft_ssp_gaps',
] as const;

export type SspGapReviewTicketType =
  (typeof SSP_GAP_REVIEW_TICKET_TYPES)[number];

export type SspGapReviewExpectedState = {
  requiredGapIds: string[];
  passThresholdPercent: number;
};

export type SspGapReviewSubmission = {
  type?: string;
  selectedGapIds: string[];
};

export type SspGapOptionResult = {
  gapId: string;
  label: string;
  shouldSelect: boolean;
  selected: boolean;
  passed: boolean;
  rationale?: string;
  controlId?: string;
};

export type SspGapReviewStructuredResult = {
  style: 'ssp_gap_review';
  selectedGapIds: string[];
  requiredGapIds: string[];
  foundRequiredGapIds: string[];
  missingRequiredGapIds: string[];
  distractorGapIds: string[];
  extraGapIds: string[];
  optionResults: SspGapOptionResult[];
  foundCount: number;
  requiredCount: number;
  recallPercent: number;
  percentage: number;
  passThresholdPercent: number;
  trainingFeedback?: TrainingFeedback;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isSspGapReviewTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (SSP_GAP_REVIEW_TICKET_TYPES as readonly string[]).includes(base);
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
      const candidate = entry.id ?? entry.gapId ?? entry.gap_id;
      if (typeof candidate === 'string') id = candidate.trim();
    }
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export function parseSspGapReviewExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): SspGapReviewExpectedState | null {
  if (!isPlainObject(expectedState)) return null;

  let requiredGapIds = normalizeStringIds(
    expectedState.requiredGapIds ??
      expectedState.required_gap_ids ??
      expectedState.gapIds ??
      expectedState.gap_ids
  );

  if (requiredGapIds.length === 0) {
    requiredGapIds = normalizeStringIds(expectedState.gaps);
  }

  if (requiredGapIds.length === 0) return null;

  const thresholdRaw =
    expectedState.passThresholdPercent ??
    expectedState.pass_threshold_percent ??
    expectedState.thresholdPercent;
  let passThresholdPercent = 100;
  if (
    typeof thresholdRaw === 'number' &&
    Number.isFinite(thresholdRaw) &&
    thresholdRaw >= 0 &&
    thresholdRaw <= 100
  ) {
    passThresholdPercent = thresholdRaw;
  }

  return {
    requiredGapIds: sortIds(requiredGapIds),
    passThresholdPercent,
  };
}

export function extractSspGapReviewSubmission(
  submission: TicketSubmission
): SspGapReviewSubmission | null {
  const selectedGapIds = normalizeStringIds(
    submission.selectedGapIds ??
      submission.selected_gap_ids ??
      submission.gapIds ??
      submission.gaps
  );

  // Empty selection is a valid (incorrect) attempt — still parseable.
  if (
    !Array.isArray(
      submission.selectedGapIds ??
        submission.selected_gap_ids ??
        submission.gapIds ??
        submission.gaps
    )
  ) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string' ? submission.type : 'ssp_gap_review',
    selectedGapIds: sortIds(selectedGapIds),
  };
}

export function evaluateSspGapReviewDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: SspGapReviewSubmission | null;
  structured: SspGapReviewStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseSspGapReviewExpectedState(ticket.expected_state);
  const candidates = parseSspCandidateGaps(
    isPlainObject(ticket.initial_state) ? ticket.initial_state : null
  );
  const parsed = extractSspGapReviewSubmission(submission);

  const base: SspGapReviewStructuredResult = {
    style: 'ssp_gap_review',
    selectedGapIds: parsed?.selectedGapIds ?? [],
    requiredGapIds: expected?.requiredGapIds ?? [],
    foundRequiredGapIds: [],
    missingRequiredGapIds: [],
    distractorGapIds: [],
    extraGapIds: [],
    optionResults: [],
    foundCount: 0,
    requiredCount: expected?.requiredGapIds.length ?? 0,
    recallPercent: 0,
    percentage: 0,
    passThresholdPercent: expected?.passThresholdPercent ?? 100,
  };

  if (!expected) {
    return {
      parsed,
      structured: { ...base, reason: 'misconfigured_expected_state' },
      ok: false,
      feedback:
        'This SSP gap review ticket is missing requiredGapIds in expected_state.',
    };
  }

  if (candidates.length === 0) {
    return {
      parsed,
      structured: { ...base, reason: 'misconfigured_initial_state' },
      ok: false,
      feedback:
        'This SSP gap review ticket is missing candidateGaps in initial_state.',
    };
  }

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...base, reason: 'missing_fields' },
      ok: false,
      feedback:
        'Submission must include selectedGapIds (array of candidate gap ids).',
    };
  }

  const requiredSet = new Set(expected.requiredGapIds);
  const candidateIds = candidates.map((c) => c.id);
  const candidateSet = new Set(candidateIds);
  const selectedSet = new Set(parsed.selectedGapIds);

  const unknownIds = parsed.selectedGapIds.filter(
    (id) => !candidateSet.has(id)
  );
  if (unknownIds.length > 0) {
    return {
      parsed,
      structured: {
        ...base,
        selectedGapIds: parsed.selectedGapIds,
        reason: 'unknown_gap_ids',
        extraGapIds: unknownIds,
      },
      ok: false,
      feedback: `Unknown gap id(s): ${unknownIds.join(', ')}. Select only from the candidate checklist.`,
    };
  }

  const distractorGapIds = sortIds(
    candidateIds.filter((id) => !requiredSet.has(id))
  );
  const foundRequiredGapIds = sortIds(
    expected.requiredGapIds.filter((id) => selectedSet.has(id))
  );
  const missingRequiredGapIds = sortIds(
    expected.requiredGapIds.filter((id) => !selectedSet.has(id))
  );
  const extraGapIds = sortIds(
    parsed.selectedGapIds.filter((id) => !requiredSet.has(id))
  );

  const optionResults: SspGapOptionResult[] = candidates.map((gap) => {
    const shouldSelect = requiredSet.has(gap.id);
    const selected = selectedSet.has(gap.id);
    return {
      gapId: gap.id,
      label: gap.label,
      shouldSelect,
      selected,
      passed: shouldSelect === selected,
      rationale: gap.rationale ?? gap.detail,
      controlId: gap.controlId,
    };
  });

  const passedCount = optionResults.filter((r) => r.passed).length;
  const totalCount = optionResults.length;
  const percentage =
    totalCount === 0 ? 0 : Math.round((passedCount / totalCount) * 100);

  const foundCount = foundRequiredGapIds.length;
  const requiredCount = expected.requiredGapIds.length;
  const recallPercent =
    requiredCount === 0 ? 0 : Math.round((foundCount / requiredCount) * 100);

  const allRequiredFound = missingRequiredGapIds.length === 0;
  const meetsThreshold = percentage >= expected.passThresholdPercent;
  // Resolve requires threshold met AND every required gap found (partial
  // recall alone never resolves even if distractor avoidance inflates %).
  const ok = meetsThreshold && allRequiredFound;

  const structured: SspGapReviewStructuredResult = {
    ...base,
    selectedGapIds: parsed.selectedGapIds,
    requiredGapIds: expected.requiredGapIds,
    foundRequiredGapIds,
    missingRequiredGapIds,
    distractorGapIds,
    extraGapIds,
    optionResults,
    foundCount,
    requiredCount,
    recallPercent,
    percentage,
    passThresholdPercent: expected.passThresholdPercent,
    reason: ok ? undefined : 'below_threshold_or_incomplete',
  };

  if (ok) {
    return {
      parsed,
      structured,
      ok: true,
      feedback:
        percentage === 100
          ? `All ${requiredCount} SSP gaps identified with no false positives (${percentage}% checklist accuracy).`
          : `SSP gap review accepted (${percentage}% checklist accuracy; recall ${recallPercent}%; need ≥ ${expected.passThresholdPercent}%).`,
    };
  }

  const parts: string[] = [
    `SSP gap review needs revision (${percentage}% checklist accuracy, ${foundCount}/${requiredCount} required gaps found; need ≥ ${expected.passThresholdPercent}% and all required gaps).`,
  ];
  if (missingRequiredGapIds.length > 0) {
    parts.push(`Missing gap(s): ${missingRequiredGapIds.join(', ')}.`);
  }
  if (extraGapIds.length > 0) {
    parts.push(
      `False positive(s) / distractor(s) selected: ${extraGapIds.join(', ')}.`
    );
  }
  return {
    parsed,
    structured,
    ok: false,
    feedback: parts.join(' '),
  };
}

export const sspGapReviewTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateSspGapReviewDeterministic(submission, ticket);
    const status = result.ok ? 'resolved' : 'needs_revision';
    const trainingFeedback = buildChecklistTrainingFeedback({
      options: result.structured.optionResults.map((option) => ({
        optionId: option.gapId,
        label: option.label,
        selected: option.selected,
        shouldSelect: option.shouldSelect,
        rationale: option.rationale,
        controlId: option.controlId,
      })),
      scorePercent: result.structured.percentage,
      status,
      summary: result.feedback,
      expectedState: ticket.expected_state,
      initialState: ticket.initial_state,
    });

    return {
      status,
      structuredResult: {
        ...result.structured,
        trainingFeedback,
      },
      feedback: result.feedback,
    };
  },
};
