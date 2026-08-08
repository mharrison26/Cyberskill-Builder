import { describe, expect, it } from 'vitest';

import {
  formatRetrievedCmmcPractices,
  getCmmcPractice,
  listCmmcPractices,
  retrieveCmmcPractices,
} from '@/lib/cmmc/getCmmcPractices';

describe('getCmmcPractices', () => {
  it('loads pinned CMMC L2 practices', () => {
    const practices = listCmmcPractices();
    expect(practices.length).toBeGreaterThanOrEqual(8);

    const mfa = getCmmcPractice('IA.L2-3.5.3');
    expect(mfa.domain).toMatch(/Identification/i);
    expect(mfa.text.toLowerCase()).toContain('multifactor');
  });

  it('retrieves required practices plus query-relevant text', () => {
    const retrieved = retrieveCmmcPractices(
      'MFA is missing for privileged admin and patching is ad hoc with no SLA',
      {
        requiredPracticeIds: ['AC.L2-3.1.1', 'IA.L2-3.5.3'],
        topK: 6,
      }
    );

    const ids = retrieved.practices.map((practice) => practice.id);
    expect(ids).toContain('AC.L2-3.1.1');
    expect(ids).toContain('IA.L2-3.5.3');
    expect(ids).toContain('SI.L2-3.14.1');
    expect(retrieved.catalogPath).toContain('cmmc-l2-practices');

    const formatted = formatRetrievedCmmcPractices(retrieved);
    expect(formatted).toContain('IA.L2-3.5.3');
    expect(formatted).toContain('Domain:');
  });
});
