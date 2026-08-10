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

  it('includes vendor profile facts and pinned threat-sources when required', () => {
    const guidance = retrieveSp80030Guidance(
      'threat sources likelihood impact customer PII OAuth',
      {
        topK: 5,
        requiredSectionIds: [
          'threat-sources',
          'likelihood',
          'impact',
          'risk-determination',
        ],
      }
    );
    const prompt = buildRiskJustificationGradingPrompt(guidance, {
      riskRegisterId: 'RISK-9',
      justification:
        'Two threat sources: external attacker targeting the OAuth API and accidental insider misconfiguration. Likelihood is elevated by Type I-only assurance and no pen-test history; impact is high for customer PII confidentiality.',
      scenarioBrief:
        'SimpleRisk: Northwind is onboarding a new SaaS vendor that will have API access to customer PII.',
      vendorProfileText:
        'organization: Northwind\ndata types: customer PII\nintegration: REST API with OAuth\nvendor posture: SOC 2 Type I only, no penetration test history',
    });

    expect(prompt).toContain('### threat-sources');
    expect(prompt).toContain('Vendor profile (ticket scenario data)');
    expect(prompt).toContain('customer PII');
    expect(prompt).toContain('REST API with OAuth');
    expect(prompt).toContain('SOC 2 Type I only, no penetration test history');
    expect(prompt).toContain('Do not rely on outside knowledge');
  });
});
