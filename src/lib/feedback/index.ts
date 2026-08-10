export {
  buildFreeTextTrainingFeedback,
  evaluateFreeTextRubric,
  mergeHybridTrainingFeedback,
  submissionRecord,
} from '@/lib/feedback/buildFreeTextFeedback';
export { enrichTrainingFeedback } from '@/lib/feedback/enrichTrainingFeedback';
// Checklist / control-link builders use Node fs (OSCAL catalog) — import from
// `@/lib/feedback/server` in server-only modules, not this barrel.
export {
  computeScorePercentile,
  extractScorePercent,
} from '@/lib/feedback/percentile';
export {
  parseFreeTextRubric,
  parseReviewNext,
} from '@/lib/feedback/parseRubric';
export { buildSlaMetrics } from '@/lib/feedback/slaMetrics';
export {
  extractTrainingFeedback,
  isTrainingFeedback,
  type ChecklistOptionFeedback,
  type ControlLinkRef,
  type FreeTextRubricDefinition,
  type OptionVerdict,
  type ReviewNextLink,
  type RubricDimensionDefinition,
  type RubricDimensionFeedback,
  type TrainingFeedback,
  type TrainingFeedbackSla,
} from '@/lib/feedback/types';
export {
  OPTION_VERDICT_HINTS,
  OPTION_VERDICT_LABELS,
  optionVerdict,
} from '@/lib/feedback/verdicts';
