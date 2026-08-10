import {
  extractControlIdFromText,
  resolveControlLink,
} from '@/lib/feedback/controlLink';
import { parseReviewNext } from '@/lib/feedback/parseRubric';
import type {
  ChecklistOptionFeedback,
  ReviewNextLink,
  TrainingFeedback,
} from '@/lib/feedback/types';
import { optionVerdict } from '@/lib/feedback/verdicts';

export type ChecklistOptionInput = {
  optionId: string;
  label: string;
  selected: boolean;
  shouldSelect: boolean;
  rationale?: string;
  /** Explicit control id; otherwise inferred from label/id. */
  controlId?: string | null;
};

function defaultRationale(option: ChecklistOptionInput): string {
  const verdict = optionVerdict(option.selected, option.shouldSelect);
  switch (verdict) {
    case 'true_positive':
      return `Correct — "${option.label}" should be selected.`;
    case 'false_positive':
      return `Distractor — "${option.label}" should not be selected.`;
    case 'false_negative':
      return `Missed — "${option.label}" is a required selection.`;
    case 'true_negative':
      return `Correct — leaving "${option.label}" unselected was right.`;
  }
}

export function buildChecklistOptionFeedback(
  option: ChecklistOptionInput
): ChecklistOptionFeedback {
  const controlId =
    option.controlId?.trim() ||
    extractControlIdFromText(option.optionId) ||
    extractControlIdFromText(option.label);

  return {
    optionId: option.optionId,
    label: option.label,
    selected: option.selected,
    shouldSelect: option.shouldSelect,
    verdict: optionVerdict(option.selected, option.shouldSelect),
    rationale: option.rationale?.trim() || defaultRationale(option),
    control: resolveControlLink(controlId, {
      titleFallback: option.label,
    }),
  };
}

export function buildChecklistTrainingFeedback(args: {
  options: ChecklistOptionInput[];
  scorePercent: number;
  status: 'resolved' | 'needs_revision';
  summary: string;
  reviewNext?: ReviewNextLink;
  expectedState?: unknown;
  initialState?: unknown;
  percentile?: number | null;
}): TrainingFeedback {
  const reviewNext =
    args.reviewNext ??
    parseReviewNext(args.expectedState) ??
    parseReviewNext(args.initialState);

  return {
    version: 1,
    kind: 'checklist',
    scorePercent: args.scorePercent,
    status: args.status,
    summary: args.summary,
    percentile: args.percentile ?? null,
    sla: null,
    checklist: {
      options: args.options.map(buildChecklistOptionFeedback),
    },
    reviewNext,
  };
}
