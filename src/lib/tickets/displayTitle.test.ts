import { describe, expect, it } from 'vitest';

import {
  humanizeTicketType,
  looksLikeScenarioBrief,
  resolveTicketDisplayTitle,
} from '@/lib/tickets/displayTitle';

describe('humanizeTicketType', () => {
  it('formats snake_case ticket types', () => {
    expect(humanizeTicketType('control_mapping')).toBe('Control Mapping');
    expect(humanizeTicketType('ssp_gap_review')).toBe('SSP Gap Review');
    expect(humanizeTicketType('fips_199_impact_categorization')).toBe(
      'FIPS 199 Impact Categorization'
    );
  });
});

describe('looksLikeScenarioBrief', () => {
  it('flags long or multi-line text', () => {
    expect(looksLikeScenarioBrief('Short title')).toBe(false);
    expect(looksLikeScenarioBrief('Line one\nLine two')).toBe(true);
    expect(looksLikeScenarioBrief('x'.repeat(91))).toBe(true);
  });
});

describe('resolveTicketDisplayTitle', () => {
  it('prefers scenario.displayTitle over longer fields', () => {
    expect(
      resolveTicketDisplayTitle({
        ticket_type: 'control_mapping',
        scenario_brief: 'A'.repeat(200),
        initial_state: {
          title: 'Legacy title',
          scenario: { displayTitle: 'Cross-framework control mapping' },
        },
      })
    ).toBe('Cross-framework control mapping');
  });

  it('uses top-level title when short', () => {
    expect(
      resolveTicketDisplayTitle({
        ticket_type: 'poam',
        scenario_brief: 'Two findings from prior work need a POA&M.',
        initial_state: { title: 'POA&M management' },
      })
    ).toBe('POA&M management');
  });

  it('does not use scenario_brief as the list title', () => {
    const brief =
      "Northwind's new enterprise customer wants written assurance that Northwind's existing SOC 2 report also covers ISO 27001.";
    expect(
      resolveTicketDisplayTitle({
        ticket_type: 'control_mapping',
        scenario_brief: brief,
        initial_state: {},
      })
    ).toBe('Control Mapping');
  });

  it('rejects brief-length title strings', () => {
    expect(
      resolveTicketDisplayTitle({
        ticket_type: 'vendor_risk_rating',
        scenario_brief: 'Vendor risk rating brief',
        initial_state: {
          title: 'x'.repeat(100),
        },
      })
    ).toBe('Vendor Risk Rating');
  });
});
