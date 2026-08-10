import { describe, expect, it } from 'vitest';

import { buildSecMaterialityGradingPrompt } from '@/lib/grading/buildSecMaterialityGradingPrompt';
import { retrieveSecMaterialityGuidance } from '@/lib/sec/getSecMaterialityGuidance';

describe('buildSecMaterialityGradingPrompt', () => {
  it('includes retrieved guidance and forbids parametric SEC knowledge', () => {
    const guidance = retrieveSecMaterialityGuidance(
      'reasonable investor materiality operational financial'
    );
    const prompt = buildSecMaterialityGradingPrompt(guidance, {
      determination: 'not_material',
      determinationRationale:
        'Vendor-contained incident affecting a limited customer subset; clock not started pending fuller impact data.',
      factorSections: {
        nature_scope:
          'Payment vendor systems were affected, not Northwind issuer systems.',
      },
      scenarioBrief:
        "A vendor Northwind uses for payment processing just disclosed a breach that exposed a subset of Northwind's customer records.",
    });

    expect(prompt).toContain('Use only the retrieved guidance');
    expect(prompt).toContain('Do not rely on outside knowledge');
    expect(prompt).toContain('Retrieved SEC materiality guidance');
    expect(prompt).toContain('not_material');
    expect(prompt).toContain('subset of Northwind');
  });

  it('preserves deliberate vendor/subset ambiguity as a judgment call', () => {
    const guidance = retrieveSecMaterialityGuidance('materiality factors', {
      requiredSectionIds: [
        'rule-overview',
        'reasonable-investor',
        'nature-scope',
        'data-compromise',
        'operational-impact',
        'financial-impact',
        'reputational-legal',
        'timing-determination',
      ],
    });
    const prompt = buildSecMaterialityGradingPrompt(guidance, {
      determination: 'material',
      determinationRationale:
        'Reasonable investor may care about payment-vendor data exposure and notification risk.',
      factorSections: {
        financial_impact:
          'Direct loss unclear; subset of ~4,000 customers with last-4 card digits.',
      },
      scenarioBrief:
        "A vendor Northwind uses for payment processing just disclosed a breach that exposed a subset of Northwind's customer records. As the person drafting the initial materiality assessment, determine whether this triggers the SEC's 4-business-day 8-K disclosure requirement and draft the determination memo.",
      breachScenarioText:
        "Breach scenario details: systems affected (payment vendor's own systems, not Northwind's), data exposed (names, emails, last-4 card digits), estimated customers impacted (~4,000), vendor's remediation status (contained, forensics ongoing).\nScope: Vendor breach (not a direct Northwind breach); exposed a subset of Northwind's customer records.",
      gradingFocus:
        "RAG-graded against the SEC cybersecurity disclosure rule's materiality factors -- does the memo address each factor (financial impact, reputational impact, operational impact, legal/regulatory exposure), not just assert a conclusion.",
    });

    expect(prompt).toContain('Breach scenario details (ticket facts)');
    expect(prompt).toContain("payment vendor's own systems, not Northwind's");
    expect(prompt).toContain('deliberately ambiguous');
    expect(prompt).toContain('Do NOT grade against a single forced correct');
    expect(prompt).toContain('judgment calls');
    expect(prompt).toContain('not just assert a conclusion');
    expect(prompt).toContain('vendor/subset');
  });
});
