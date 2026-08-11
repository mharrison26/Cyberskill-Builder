import { describe, expect, it } from 'vitest';

import {
  extractControlRefs,
  referencesControl,
} from '@/lib/catalog/extractControlRefs';

describe('extractControlRefs', () => {
  it('extracts controlId and control_id fields', () => {
    expect(
      extractControlRefs({
        controlId: 'AC-2',
        nested: { control_id: 'ia-5.1' },
      })
    ).toEqual(['ac-2', 'ia-5.1']);
  });

  it('extracts parenthetical enhancements from prose', () => {
    const refs = extractControlRefs(
      'Draft procedures for IA-5(1) before the auditor arrives.'
    );
    expect(refs).toContain('ia-5.1');
  });

  it('extracts arrays of control ids', () => {
    expect(
      extractControlRefs({
        controlIds: ['IA-1', 'ia-5', 'IA-5(1)'],
      })
    ).toEqual(['ia-1', 'ia-5', 'ia-5.1']);
  });

  it('referencesControl matches normalized forms', () => {
    expect(referencesControl('AC-2', { source_control_id: 'ac-2' })).toBe(true);
    expect(referencesControl('ac-2', { title: 'Unrelated' })).toBe(false);
  });
});
