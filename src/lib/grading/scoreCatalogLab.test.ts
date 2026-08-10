import { describe, expect, it } from 'vitest';

import { listControlIdsByFamilyPrefix } from '@/lib/oscal/getControl';
import { scoreCatalogLabSubmission } from '@/lib/grading/scoreCatalogLab';
import type { CatalogLabSubmission } from '@/lib/lessons/catalogLabValidation';

function baseSubmission(
  overrides: Partial<CatalogLabSubmission> = {}
): CatalogLabSubmission {
  return {
    type: 'catalog_lab',
    controlIds: listControlIdsByFamilyPrefix('ia', { baseOnly: true }),
    adjacentAcControls: ['ac-7'],
    explanation:
      'IA family covers identification and authentication. AC-2 is account management in the AC family; password authenticators belong under IA-5, while AC-7 is adjacent because it limits unsuccessful logon attempts.',
    submittedAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('listControlIdsByFamilyPrefix', () => {
  it('returns base IA controls from the pinned catalog', () => {
    const base = listControlIdsByFamilyPrefix('ia', { baseOnly: true });
    expect(base).toContain('ia-1');
    expect(base).toContain('ia-5');
    expect(base).toContain('ia-13');
    expect(base.every((id) => /^ia-\d+$/.test(id))).toBe(true);
  });

  it('includes enhancements when baseOnly is false', () => {
    const all = listControlIdsByFamilyPrefix('ia');
    expect(all.length).toBeGreaterThan(
      listControlIdsByFamilyPrefix('ia', { baseOnly: true }).length
    );
    expect(all).toContain('ia-5.1');
  });
});

describe('scoreCatalogLabSubmission', () => {
  it('passes a complete IA shortlist with adjacent AC-7 and AC-2/IA-5 explanation', () => {
    const result = scoreCatalogLabSubmission(baseSubmission());
    expect(result.passed).toBe(true);
    expect(result.findingState).toBe('satisfied');
    expect(result.missingBase).toEqual([]);
    expect(result.includesAc2InIaList).toBe(false);
    expect(result.hasAuthAdjacentAc).toBe(true);
  });

  it('fails when AC-2 is listed as an IA control', () => {
    const result = scoreCatalogLabSubmission(
      baseSubmission({
        controlIds: [...listControlIdsByFamilyPrefix('ia', { baseOnly: true }), 'ac-2'],
      })
    );
    expect(result.passed).toBe(false);
    expect(result.includesAc2InIaList).toBe(true);
    expect(result.falsePositives).toContain('ac-2');
  });

  it('fails when base IA controls are missing', () => {
    const result = scoreCatalogLabSubmission(
      baseSubmission({
        controlIds: ['ia-1', 'ia-5'],
      })
    );
    expect(result.passed).toBe(false);
    expect(result.missingBase).toContain('ia-2');
    expect(result.percentage).toBeLessThan(100);
  });

  it('allows IA enhancements without treating them as false positives', () => {
    const result = scoreCatalogLabSubmission(
      baseSubmission({
        controlIds: [
          ...listControlIdsByFamilyPrefix('ia', { baseOnly: true }),
          'ia-5.1',
        ],
      })
    );
    expect(result.falsePositives).toEqual([]);
    expect(result.passed).toBe(true);
  });
});
