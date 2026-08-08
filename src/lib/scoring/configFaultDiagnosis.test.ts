import { describe, expect, it } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';
import {
  evaluateConfigFaultDiagnosis,
  extractConfigFaultDiagnosisSubmission,
  normalizeConfigLine,
  parseConfigFaultDiagnosisExpectedState,
} from '@/lib/scoring/configFaultDiagnosis';

const SAMPLE_NAMED_CONF = `options {
    directory "/var/named";
    recursion no;
    allow-query { any; };
};

zone "corp.example.com" IN {
    type master;
    file "corp.example.com.zone";
    allow-transfer { any; };
};

zone "." IN {
    type hint;
    file "named.ca";
};
`;

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-cfg-fault-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'config_fault_diagnosis',
    difficulty: 'medium',
    sla_minutes: 25,
    scenario_brief: 'Config fault: unrestricted zone transfer in named.conf',
    initial_state: {
      prompt: 'Identify the misconfigured line in named.conf.',
      configFileName: 'named.conf',
      configKind: 'named.conf',
      configText: SAMPLE_NAMED_CONF,
    },
    expected_state: {
      faultLineNumber: 10,
      faultLineContent: 'allow-transfer { any; };',
      minImpactLength: 40,
    },
    dcwf_code: null,
    sort_order: 0,
    ...overrides,
  };
}

describe('configFaultDiagnosis scorer', () => {
  it('registers config_fault_diagnosis and aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('config_fault_diagnosis');
    expect(registered).toContain('named_conf_fault');
    expect(registered).toContain('dns_config_fault');
    expect(registered).toContain('config_line_diagnosis');
    expect(getTicketScorer('config_fault_diagnosis')).toBeTruthy();
    expect(getTicketScorer('named_conf_fault')).toBe(
      getTicketScorer('config_fault_diagnosis')
    );
  });

  it('normalizes config lines for content compare', () => {
    expect(normalizeConfigLine('  allow-transfer   { any; };  # bad')).toBe(
      'allow-transfer { any; };'
    );
  });

  it('parses expected_state aliases', () => {
    expect(
      parseConfigFaultDiagnosisExpectedState({
        fault_line_number: '10',
        fault_line_content: 'allow-transfer { any; };',
        accepted_line_numbers: [10, 11],
        min_impact_length: 50,
      })
    ).toEqual({
      faultLineNumber: 10,
      faultLineContent: 'allow-transfer { any; };',
      acceptedLineNumbers: [10, 11],
      minImpactLength: 50,
    });
  });

  it('extracts submission fields with snake_case aliases', () => {
    const parsed = extractConfigFaultDiagnosisSubmission({
      type: 'config_fault_diagnosis',
      fault_line_number: 10,
      impact_explanation: 'Anyone can AXFR the zone.',
    });

    expect(parsed).toEqual({
      type: 'config_fault_diagnosis',
      faultLineNumber: 10,
      impactExplanation: 'Anyone can AXFR the zone.',
    });
  });

  it('fails when expected_state is misconfigured', () => {
    const result = evaluateConfigFaultDiagnosis(
      {
        faultLineNumber: 10,
        impactExplanation:
          'Zone transfers are open to the internet, enabling enumeration.',
      },
      ticket({ expected_state: {} })
    );

    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('misconfigured_expected_state');
  });

  it('fails when faultLineNumber is missing', () => {
    const result = evaluateConfigFaultDiagnosis(
      {
        impactExplanation:
          'Zone transfers are open to the internet, enabling enumeration.',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('fails when the wrong line is identified', () => {
    const result = evaluateConfigFaultDiagnosis(
      {
        faultLineNumber: 8,
        impactExplanation:
          'Zone transfers are open to the internet, enabling enumeration.',
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.structured).toMatchObject({
      style: 'config_fault_diagnosis',
      lineMatch: false,
      reason: 'incorrect_line',
      expectedFaultLineNumber: 10,
    });
    expect(result.feedback).toMatch(/line 10/i);
  });

  it('fails when impact explanation is too short', () => {
    const result = evaluateConfigFaultDiagnosis(
      {
        faultLineNumber: 10,
        impactExplanation: 'Too short.',
      },
      ticket()
    );

    expect(result.ok).toBe(false);
    expect(result.structured).toMatchObject({
      lineMatch: true,
      impactLengthOk: false,
      reason: 'impact_too_short',
    });
  });

  it('resolves when line and impact length match expected_state', () => {
    const result = evaluateConfigFaultDiagnosis(
      {
        type: 'config_fault_diagnosis',
        faultLineNumber: 10,
        impactExplanation:
          'allow-transfer { any; } lets any host AXFR corp.example.com, exposing the full zone for reconnaissance.',
      },
      ticket()
    );

    expect(result.ok).toBe(true);
    expect(result.structured).toMatchObject({
      style: 'config_fault_diagnosis',
      faultLineNumber: 10,
      expectedFaultLineNumber: 10,
      lineMatch: true,
      impactLengthOk: true,
    });
    expect(result.feedback).toMatch(/correct/i);

    const scored = getTicketScorer('config_fault_diagnosis')!.score(
      {
        faultLineNumber: 10,
        impactExplanation:
          'allow-transfer { any; } lets any host AXFR corp.example.com, exposing the full zone for reconnaissance.',
      },
      ticket()
    );
    expect(scored).toMatchObject({ status: 'resolved' });
  });

  it('accepts alternate acceptedLineNumbers', () => {
    const result = evaluateConfigFaultDiagnosis(
      {
        faultLineNumber: 11,
        impactExplanation:
          'Closing brace context aside, accepted alternate line number for this seed variant.',
      },
      ticket({
        expected_state: {
          faultLineNumber: 10,
          acceptedLineNumbers: [11],
          minImpactLength: 40,
        },
      })
    );

    expect(result.ok).toBe(true);
    expect(result.structured.lineMatch).toBe(true);
  });
});
