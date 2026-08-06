import type { CCCERValues } from '@/types';

export const CCCER_MIN_LENGTH = 20;

const FIELD_LABELS: Record<keyof CCCERValues, string> = {
  condition: 'Condition',
  criteria: 'Criteria',
  cause: 'Cause',
  effect: 'Effect',
  recommendation: 'Recommendation',
};

const FIELD_KEYS = Object.keys(FIELD_LABELS) as (keyof CCCERValues)[];

export function validateCCCER(body: unknown):
  | {
      ok: true;
      data: CCCERValues;
    }
  | {
      ok: false;
      error: string;
    } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const record = body as Record<string, unknown>;
  const data = {} as CCCERValues;

  for (const key of FIELD_KEYS) {
    const value = record[key];
    if (typeof value !== 'string') {
      return { ok: false, error: `${FIELD_LABELS[key]} is required.` };
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return { ok: false, error: `${FIELD_LABELS[key]} is required.` };
    }

    if (trimmed.length < CCCER_MIN_LENGTH) {
      return {
        ok: false,
        error: `${FIELD_LABELS[key]} must be at least ${CCCER_MIN_LENGTH} characters.`,
      };
    }

    data[key] = trimmed;
  }

  return { ok: true, data };
}
