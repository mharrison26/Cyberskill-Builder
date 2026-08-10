/**
 * Unified training feedback DTO persisted on ticket score results
 * (`structured_result.trainingFeedback`) and reopened from the portfolio ledger.
 */

export type OptionVerdict =
  'true_positive' | 'false_positive' | 'false_negative' | 'true_negative';

export type ControlLinkRef = {
  controlId: string;
  title: string;
  /** Short excerpt of the control statement for inline teaching. */
  statementExcerpt: string;
  /** Deep link into the Control Catalog (search + expand). */
  catalogHref: string;
};

export type ChecklistOptionFeedback = {
  optionId: string;
  label: string;
  selected: boolean;
  shouldSelect: boolean;
  verdict: OptionVerdict;
  /** Authored explanation of why this option is correct or a distractor. */
  rationale: string;
  control?: ControlLinkRef;
};

export type RubricDimensionDefinition = {
  id: string;
  label: string;
  weight?: number;
  /** What a strong answer should cover. */
  criteria: string;
  /** Optional keywords used for deterministic strength/omission detection. */
  keywords?: string[];
  /** Field key on the student submission to evaluate (e.g. objective). */
  submissionField?: string;
  modelAnswer?: string;
};

export type FreeTextRubricDefinition = {
  dimensions: RubricDimensionDefinition[];
  /** Overall model answer shown for comparison (optional). */
  modelAnswer?: string;
  passThresholdPercent?: number;
};

export type RubricDimensionFeedback = {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  /** Short quotes drawn from the learner's own text. */
  strengths: string[];
  omissions: string[];
  modelAnswer?: string;
  criteria?: string;
};

export type ReviewNextLink = {
  title: string;
  href: string;
  reason: string;
};

export type TrainingFeedbackSla = {
  minutesAllowed: number;
  minutesTaken: number | null;
  withinSla: boolean | null;
};

export type TrainingFeedback = {
  version: 1;
  kind: 'checklist' | 'free_text' | 'hybrid';
  scorePercent: number;
  status: 'resolved' | 'needs_revision';
  summary: string;
  /** Cohort percentile (0–100); null when cohort is too small. */
  percentile: number | null;
  sla: TrainingFeedbackSla | null;
  checklist?: {
    options: ChecklistOptionFeedback[];
  };
  rubric?: {
    dimensions: RubricDimensionFeedback[];
    modelAnswer?: string;
  };
  reviewNext?: ReviewNextLink;
};

export function isTrainingFeedback(value: unknown): value is TrainingFeedback {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.version === 1 &&
    (obj.kind === 'checklist' ||
      obj.kind === 'free_text' ||
      obj.kind === 'hybrid') &&
    typeof obj.scorePercent === 'number' &&
    typeof obj.summary === 'string'
  );
}

export function extractTrainingFeedback(
  structuredResult: Record<string, unknown> | null | undefined
): TrainingFeedback | null {
  if (!structuredResult) return null;
  const nested = structuredResult.trainingFeedback;
  return isTrainingFeedback(nested) ? nested : null;
}
