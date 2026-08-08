import { describe, expect, it } from 'vitest';

import { buildRiskJustificationGradingPrompt } from '@/lib/grading/buildRiskJustificationGradingPrompt';
import { retrieveSp80030Guidance } from '@/lib/nist/getSp80030Guidance';

describe('buildRiskJustificationGradingPrompt', () => {
  it('includes retrieved SP 800-30 text and forbids parametric knowledge', () => {
    const guidance = retrieveSp80030Guidance(
      'likelihood impact mission confidentiality'
    );
    const prompt = buildRiskJustificationGradingPrompt(guidance, {
      riskRegisterId: '14',
      justification:
        'Likelihood is elevated due to exposed admin services; impact includes mission disruption and confidentiality loss.',
      scenarioBrief: 'Log a SimpleRisk entry for exposed RDP.',
    });

    expect(prompt).toContain('Use only the retrieved SP 800-30 guidance');
    expect(prompt).toContain('Do not rely on outside knowledge');
    expect(prompt).toContain('### likelihood');
    expect(prompt).toContain('**Risk register entry ID**');
    expect(prompt).toContain('14');
    expect(prompt).toContain('Log a SimpleRisk entry for exposed RDP.');
  });
});
