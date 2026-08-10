import { describe, expect, it } from 'vitest';

import {
  validateCatalogLabSubmission,
  CATALOG_LAB_MIN_EXPLANATION_LENGTH,
} from '@/lib/lessons/catalogLabValidation';

describe('validateCatalogLabSubmission', () => {
  it('accepts a well-formed catalog_lab payload', () => {
    const result = validateCatalogLabSubmission({
      type: 'catalog_lab',
      controlIds: ['IA-1', 'ia-5', 'IA-5(1)'],
      adjacentAcControls: 'ac-7, AC-11',
      explanation:
        'IA shortlist from the catalog; AC-7 is adjacent but not IA family.',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.controlIds).toEqual(['ia-1', 'ia-5', 'ia-5.1']);
    expect(result.data.adjacentAcControls).toEqual(['ac-7', 'ac-11']);
    expect(result.data.type).toBe('catalog_lab');
  });

  it('rejects missing control IDs', () => {
    const result = validateCatalogLabSubmission({
      type: 'catalog_lab',
      controlIds: [],
      explanation: 'x'.repeat(CATALOG_LAB_MIN_EXPLANATION_LENGTH),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/control ID/i);
  });

  it('rejects short explanations', () => {
    const result = validateCatalogLabSubmission({
      type: 'catalog_lab',
      controlIds: ['ia-1'],
      explanation: 'too short',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/at least/i);
  });
});
