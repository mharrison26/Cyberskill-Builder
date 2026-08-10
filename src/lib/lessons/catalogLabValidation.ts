import { normalizeControlId } from '@/lib/oscal/parseCatalog';

export const CATALOG_LAB_MIN_EXPLANATION_LENGTH = 40;

export type CatalogLabSubmission = {
  type: 'catalog_lab';
  /** IA-family control IDs from the live catalog shortlist. */
  controlIds: string[];
  /** Authentication-adjacent AC controls (distinct from IA family). */
  adjacentAcControls: string[];
  /** Why AC-family auth-adjacent controls are distinct from IA (e.g. AC-2 vs IA-5). */
  explanation: string;
  submittedAt: string;
};

function parseControlIdList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => normalizeControlId(item))
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[,;\n]+/)
      .map((part) => normalizeControlId(part))
      .filter(Boolean);
  }
  return [];
}

function uniquePreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function isCatalogLabSubmission(
  value: unknown
): value is CatalogLabSubmission {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.type === 'catalog_lab' &&
    Array.isArray(record.controlIds) &&
    typeof record.explanation === 'string'
  );
}

export function validateCatalogLabSubmission(
  body: unknown
):
  | { ok: true; data: CatalogLabSubmission }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const record = body as Record<string, unknown>;

  if (record.type !== 'catalog_lab') {
    return { ok: false, error: 'Submission type must be catalog_lab.' };
  }

  const controlIds = uniquePreserveOrder(
    parseControlIdList(
      record.controlIds ?? record.control_ids ?? record.iaControls
    )
  );

  if (controlIds.length === 0) {
    return {
      ok: false,
      error: 'Submit at least one IA-family control ID from the catalog.',
    };
  }

  const adjacentAcControls = uniquePreserveOrder(
    parseControlIdList(
      record.adjacentAcControls ??
        record.adjacent_ac_controls ??
        record.acAdjacentControls
    )
  );

  if (typeof record.explanation !== 'string') {
    return { ok: false, error: 'Explanation is required.' };
  }

  const explanation = record.explanation.trim();
  if (!explanation) {
    return { ok: false, error: 'Explanation is required.' };
  }

  if (explanation.length < CATALOG_LAB_MIN_EXPLANATION_LENGTH) {
    return {
      ok: false,
      error: `Explanation must be at least ${CATALOG_LAB_MIN_EXPLANATION_LENGTH} characters.`,
    };
  }

  const submittedAt =
    typeof record.submittedAt === 'string' && record.submittedAt.trim()
      ? record.submittedAt.trim()
      : new Date().toISOString();

  return {
    ok: true,
    data: {
      type: 'catalog_lab',
      controlIds,
      adjacentAcControls,
      explanation,
      submittedAt,
    },
  };
}
