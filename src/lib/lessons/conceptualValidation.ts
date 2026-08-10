export const CONCEPTUAL_MIN_MEMO_LENGTH = 120;

export type ConceptualSubmission = {
  type: 'conceptual';
  memo: string;
  submittedAt: string;
};

export function isConceptualSubmission(
  value: unknown
): value is ConceptualSubmission {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.type === 'conceptual' && typeof record.memo === 'string';
}

export function validateConceptualSubmission(
  body: unknown
): { ok: true; data: ConceptualSubmission } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const record = body as Record<string, unknown>;

  if (record.type !== 'conceptual') {
    return { ok: false, error: 'Submission type must be conceptual.' };
  }

  if (typeof record.memo !== 'string') {
    return { ok: false, error: 'Memo is required.' };
  }

  const memo = record.memo.trim();
  if (!memo) {
    return { ok: false, error: 'Memo is required.' };
  }

  if (memo.length < CONCEPTUAL_MIN_MEMO_LENGTH) {
    return {
      ok: false,
      error: `Memo must be at least ${CONCEPTUAL_MIN_MEMO_LENGTH} characters.`,
    };
  }

  const submittedAt =
    typeof record.submittedAt === 'string' && record.submittedAt.trim()
      ? record.submittedAt.trim()
      : new Date().toISOString();

  return {
    ok: true,
    data: {
      type: 'conceptual',
      memo,
      submittedAt,
    },
  };
}
