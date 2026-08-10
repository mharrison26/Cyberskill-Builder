import type {
  FreeTextRubricDefinition,
  ReviewNextLink,
  RubricDimensionDefinition,
} from '@/lib/feedback/types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDimension(raw: unknown): RubricDimensionDefinition | null {
  if (!isPlainObject(raw)) return null;
  const id =
    typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : typeof raw.key === 'string' && raw.key.trim()
        ? raw.key.trim()
        : '';
  const label =
    typeof raw.label === 'string' && raw.label.trim()
      ? raw.label.trim()
      : typeof raw.title === 'string' && raw.title.trim()
        ? raw.title.trim()
        : id;
  const criteria =
    typeof raw.criteria === 'string' && raw.criteria.trim()
      ? raw.criteria.trim()
      : typeof raw.description === 'string' && raw.description.trim()
        ? raw.description.trim()
        : '';
  if (!id || !label) return null;

  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.filter(
        (k): k is string => typeof k === 'string' && k.trim().length > 0
      )
    : undefined;

  return {
    id,
    label,
    criteria,
    keywords,
    weight:
      typeof raw.weight === 'number' && Number.isFinite(raw.weight)
        ? raw.weight
        : undefined,
    submissionField:
      typeof raw.submissionField === 'string'
        ? raw.submissionField
        : typeof raw.field === 'string'
          ? raw.field
          : undefined,
    modelAnswer:
      typeof raw.modelAnswer === 'string'
        ? raw.modelAnswer
        : typeof raw.model_answer === 'string'
          ? raw.model_answer
          : undefined,
  };
}

export function parseFreeTextRubric(
  expectedState: unknown
): FreeTextRubricDefinition | null {
  if (!isPlainObject(expectedState)) return null;
  const raw = expectedState.rubric ?? expectedState.freeTextRubric;
  if (!isPlainObject(raw)) return null;

  const dimsRaw = raw.dimensions ?? raw.criteria;
  if (!Array.isArray(dimsRaw)) return null;

  const dimensions: RubricDimensionDefinition[] = [];
  for (const entry of dimsRaw) {
    const dim = parseDimension(entry);
    if (dim) dimensions.push(dim);
  }
  if (dimensions.length === 0) return null;

  const passRaw =
    raw.passThresholdPercent ??
    expectedState.passThresholdPercent ??
    expectedState.pass_threshold_percent;

  return {
    dimensions,
    modelAnswer:
      typeof raw.modelAnswer === 'string'
        ? raw.modelAnswer
        : typeof raw.model_answer === 'string'
          ? raw.model_answer
          : undefined,
    passThresholdPercent:
      typeof passRaw === 'number' && Number.isFinite(passRaw)
        ? passRaw
        : undefined,
  };
}

export function parseReviewNext(source: unknown): ReviewNextLink | undefined {
  if (!isPlainObject(source)) return undefined;
  const raw = source.reviewNext ?? source.review_next;
  if (!isPlainObject(raw)) return undefined;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const href = typeof raw.href === 'string' ? raw.href.trim() : '';
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (!title || !href) return undefined;
  return { title, href, reason: reason || 'Review this next to close the gap.' };
}
