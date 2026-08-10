import { parseFreeTextRubric, parseReviewNext } from '@/lib/feedback/parseRubric';
import type {
  FreeTextRubricDefinition,
  RubricDimensionFeedback,
  TrainingFeedback,
} from '@/lib/feedback/types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fieldText(
  submission: Record<string, unknown>,
  field: string | undefined,
  fallbackId: string
): string {
  const keys = [field, fallbackId, camelToSnake(fallbackId)].filter(
    (k): k is string => typeof k === 'string' && k.length > 0
  );
  for (const key of keys) {
    const value = submission[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  // Whole-memo free text
  for (const key of ['memo', 'narrative', 'text', 'body', 'response']) {
    const value = submission[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function camelToSnake(value: string): string {
  return value.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function quoteAroundMatch(text: string, keyword: string): string | null {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(keyword.toLowerCase());
  if (idx < 0) return null;
  const start = Math.max(0, text.lastIndexOf('.', idx) + 1);
  const endCandidate = text.indexOf('.', idx + keyword.length);
  const end = endCandidate >= 0 ? endCandidate + 1 : Math.min(text.length, idx + 120);
  const snippet = text.slice(start, end).trim();
  if (!snippet) return null;
  return snippet.length > 160 ? `${snippet.slice(0, 159)}…` : snippet;
}

function scoreDimension(args: {
  text: string;
  criteria: string;
  keywords?: string[];
}): Pick<RubricDimensionFeedback, 'score' | 'strengths' | 'omissions'> {
  const { text, criteria, keywords } = args;
  if (!text) {
    return {
      score: 0,
      strengths: [],
      omissions: [criteria || 'No response provided for this dimension.'],
    };
  }

  const terms =
    keywords && keywords.length > 0
      ? keywords
      : criteria
          .split(/[,;]/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 4)
          .slice(0, 6);

  if (terms.length === 0) {
    // Length-based fallback when rubric has no keywords.
    const lenScore = Math.min(100, Math.round((text.length / 180) * 100));
    return {
      score: lenScore,
      strengths:
        text.length >= 40
          ? [text.length > 140 ? `${text.slice(0, 139)}…` : text]
          : [],
      omissions:
        lenScore < 70
          ? ['Expand this section with concrete, scenario-specific detail.']
          : [],
    };
  }

  const strengths: string[] = [];
  const omissions: string[] = [];
  let hits = 0;

  for (const term of terms) {
    const quote = quoteAroundMatch(text, term);
    if (quote) {
      hits += 1;
      if (strengths.length < 3 && !strengths.includes(quote)) {
        strengths.push(quote);
      }
    } else {
      omissions.push(`Missing coverage of: ${term}`);
    }
  }

  const score = Math.round((hits / terms.length) * 100);
  return { score, strengths, omissions };
}

export function evaluateFreeTextRubric(args: {
  rubric: FreeTextRubricDefinition;
  submission: Record<string, unknown>;
}): {
  dimensions: RubricDimensionFeedback[];
  scorePercent: number;
} {
  const dimensions: RubricDimensionFeedback[] = [];
  let weightedSum = 0;
  let weightTotal = 0;

  for (const dim of args.rubric.dimensions) {
    const text = fieldText(args.submission, dim.submissionField, dim.id);
    const scored = scoreDimension({
      text,
      criteria: dim.criteria,
      keywords: dim.keywords,
    });
    const weight = dim.weight && dim.weight > 0 ? dim.weight : 1;
    weightedSum += scored.score * weight;
    weightTotal += weight;
    dimensions.push({
      id: dim.id,
      label: dim.label,
      score: scored.score,
      maxScore: 100,
      strengths: scored.strengths,
      omissions: scored.omissions,
      modelAnswer: dim.modelAnswer,
      criteria: dim.criteria,
    });
  }

  const scorePercent =
    weightTotal === 0 ? 0 : Math.round(weightedSum / weightTotal);

  return { dimensions, scorePercent };
}

export function buildFreeTextTrainingFeedback(args: {
  expectedState: unknown;
  submission: Record<string, unknown>;
  status: 'resolved' | 'needs_revision';
  summary: string;
  scorePercent?: number;
  initialState?: unknown;
  percentile?: number | null;
}): TrainingFeedback | null {
  const rubric = parseFreeTextRubric(args.expectedState);
  if (!rubric) return null;

  const evaluated = evaluateFreeTextRubric({
    rubric,
    submission: args.submission,
  });

  const scorePercent = args.scorePercent ?? evaluated.scorePercent;
  const reviewNext =
    parseReviewNext(args.expectedState) ?? parseReviewNext(args.initialState);

  return {
    version: 1,
    kind: 'free_text',
    scorePercent,
    status: args.status,
    summary: args.summary,
    percentile: args.percentile ?? null,
    sla: null,
    rubric: {
      dimensions: evaluated.dimensions,
      modelAnswer: rubric.modelAnswer,
    },
    reviewNext,
  };
}

/** Merge checklist + free-text feedback into a hybrid payload. */
export function mergeHybridTrainingFeedback(
  checklist: TrainingFeedback | null | undefined,
  freeText: TrainingFeedback | null | undefined,
  summary: string,
  status: 'resolved' | 'needs_revision'
): TrainingFeedback | null {
  if (!checklist && !freeText) return null;
  if (checklist && !freeText) return checklist;
  if (freeText && !checklist) return freeText;

  const scorePercent = Math.round(
    ((checklist!.scorePercent ?? 0) + (freeText!.scorePercent ?? 0)) / 2
  );

  return {
    version: 1,
    kind: 'hybrid',
    scorePercent,
    status,
    summary,
    percentile: checklist!.percentile ?? freeText!.percentile ?? null,
    sla: checklist!.sla ?? freeText!.sla ?? null,
    checklist: checklist!.checklist,
    rubric: freeText!.rubric,
    reviewNext: checklist!.reviewNext ?? freeText!.reviewNext,
  };
}

export function submissionRecord(
  submission: unknown
): Record<string, unknown> {
  return isPlainObject(submission) ? submission : {};
}
