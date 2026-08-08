import { describe, expect, it } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer } from '@/lib/scoring';
import {
  computeVulnPriorityScore,
  deriveExpectedOrder,
  evaluateVulnPrioritization,
  extractVulnPrioritizationSubmission,
  isVulnPrioritizationTicketType,
  parseVulnerabilities,
  scoreOrderPairwise,
  vulnPrioritizationTicketScorer,
  type VulnerabilityItem,
} from '@/lib/scoring/vulnPrioritization';

const SAMPLE_VULNS: VulnerabilityItem[] = [
  {
    id: 'VULN-INFO-LDAP',
    title: 'LDAP anonymous bind info leak',
    description: 'Directory discloses user attributes.',
    cveId: 'CVE-2024-1009',
    cvss: 5.3,
    exposedSystem: 'Corporate LDAP',
    exposure: 'internet',
    exploitAvailable: false,
  },
  {
    id: 'VULN-RCE-VPN',
    title: 'VPN concentrator RCE',
    description: 'Unauthenticated remote code execution.',
    cveId: 'CVE-2024-1001',
    cvss: 9.8,
    exposedSystem: 'Corporate VPN',
    exposure: 'internet',
    exploitAvailable: true,
  },
  {
    id: 'VULN-PATH-FILE',
    title: 'File server path traversal',
    description: 'Authenticated path traversal.',
    cveId: 'CVE-2024-1008',
    cvss: 7.2,
    exposedSystem: 'File server',
    exposure: 'internal',
    exploitAvailable: true,
  },
  {
    id: 'VULN-SQLI-PORTAL',
    title: 'Customer portal SQLi',
    description: 'SQL injection in login form.',
    cveId: 'CVE-2024-1002',
    cvss: 9.1,
    exposedSystem: 'Customer portal',
    exposure: 'internet',
    exploitAvailable: true,
  },
  {
    id: 'VULN-DESER-API',
    title: 'API insecure deserialization',
    description: 'Deserialization without exploit PoC.',
    cveId: 'CVE-2024-1007',
    cvss: 8.1,
    exposedSystem: 'Public API gateway',
    exposure: 'internet',
    exploitAvailable: false,
  },
  {
    id: 'VULN-AUTH-SSO',
    title: 'SSO auth bypass',
    description: 'Token validation bypass.',
    cveId: 'CVE-2024-1003',
    cvss: 8.6,
    exposedSystem: 'SSO IdP',
    exposure: 'internet',
    exploitAvailable: true,
  },
  {
    id: 'VULN-PRIV-ERP',
    title: 'ERP privilege escalation',
    description: 'Partner-facing ERP priv-esc.',
    cveId: 'CVE-2024-1006',
    cvss: 8.2,
    exposedSystem: 'ERP partner portal',
    exposure: 'partner',
    exploitAvailable: true,
  },
  {
    id: 'VULN-RCE-JUMP',
    title: 'Jump host RCE',
    description: 'Partner VPN jump host RCE.',
    cveId: 'CVE-2024-1004',
    cvss: 9.8,
    exposedSystem: 'Partner jump host',
    exposure: 'partner',
    exploitAvailable: true,
  },
  {
    id: 'VULN-XSS-CRM',
    title: 'CRM stored XSS',
    description: 'Stored XSS with public exploit.',
    cveId: 'CVE-2024-1005',
    cvss: 7.5,
    exposedSystem: 'CRM web app',
    exposure: 'internet',
    exploitAvailable: true,
  },
];

/** Canonical order from severity + exposure + exploit weighting. */
const CANONICAL_ORDER = [
  'VULN-RCE-VPN', // 14.8
  'VULN-SQLI-PORTAL', // 14.1
  'VULN-AUTH-SSO', // 13.6
  'VULN-RCE-JUMP', // 13.3
  'VULN-XSS-CRM', // 12.5
  'VULN-PRIV-ERP', // 11.7
  'VULN-DESER-API', // 11.1
  'VULN-PATH-FILE', // 9.2
  'VULN-INFO-LDAP', // 8.3
];

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-vuln',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'vuln_prioritization',
    difficulty: 'medium',
    sla_minutes: 30,
    scenario_brief: 'Vuln prioritization: build a patch schedule.',
    initial_state: {
      prompt: 'Order vulnerabilities for patching.',
      vulnerabilities: SAMPLE_VULNS,
    },
    expected_state: {
      expectedOrder: CANONICAL_ORDER,
      passThresholdPercent: 80,
    },
    dcwf_code: null,
    sort_order: 0,
    ...overrides,
  };
}

describe('isVulnPrioritizationTicketType', () => {
  it('accepts canonical type and alias', () => {
    expect(isVulnPrioritizationTicketType('vuln_prioritization')).toBe(true);
    expect(isVulnPrioritizationTicketType('patch_schedule')).toBe(true);
    expect(isVulnPrioritizationTicketType('grc.vuln_prioritization')).toBe(
      true
    );
    expect(isVulnPrioritizationTicketType('triage')).toBe(false);
  });
});

describe('computeVulnPriorityScore / deriveExpectedOrder', () => {
  it('weights CVSS + internet exposure + exploit available', () => {
    expect(
      computeVulnPriorityScore({
        cvss: 9.8,
        exposure: 'internet',
        exploitAvailable: true,
      })
    ).toBe(14.8);

    expect(
      computeVulnPriorityScore({
        cvss: 9.8,
        exposure: 'partner',
        exploitAvailable: true,
      })
    ).toBe(13.3);

    expect(
      computeVulnPriorityScore({
        cvss: 8.1,
        exposure: 'internet',
        exploitAvailable: false,
      })
    ).toBe(11.1);
  });

  it('derives the severity-and-exposure-weighted canonical order', () => {
    expect(deriveExpectedOrder(SAMPLE_VULNS)).toEqual(CANONICAL_ORDER);
  });
});

describe('scoreOrderPairwise', () => {
  it('scores a perfect order at 100%', () => {
    const result = scoreOrderPairwise(CANONICAL_ORDER, CANONICAL_ORDER);
    expect(result.pairCount).toBe(36);
    expect(result.agreeingPairs).toBe(36);
    expect(result.percentage).toBe(100);
  });

  it('scores a full reverse order at 0%', () => {
    const reversed = [...CANONICAL_ORDER].reverse();
    const result = scoreOrderPairwise(reversed, CANONICAL_ORDER);
    expect(result.agreeingPairs).toBe(0);
    expect(result.percentage).toBe(0);
  });

  it('gives partial credit for a single adjacent swap', () => {
    const swapped = [...CANONICAL_ORDER];
    // Swap first two → one disagreeing pair out of 36
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    const result = scoreOrderPairwise(swapped, CANONICAL_ORDER);
    expect(result.agreeingPairs).toBe(35);
    expect(result.percentage).toBeCloseTo((35 / 36) * 100, 5);
  });
});

describe('extractVulnPrioritizationSubmission', () => {
  it('reads orderedIds', () => {
    expect(
      extractVulnPrioritizationSubmission({
        type: 'vuln_prioritization',
        orderedIds: ['A', 'B'],
      })
    ).toEqual({
      type: 'vuln_prioritization',
      orderedIds: ['A', 'B'],
    });
  });

  it('accepts snake_case and nested id objects', () => {
    expect(
      extractVulnPrioritizationSubmission({
        ordered_ids: [{ id: 'A' }, { id: 'B' }],
      })
    ).toEqual({
      type: 'vuln_prioritization',
      orderedIds: ['A', 'B'],
    });
  });

  it('returns null when missing', () => {
    expect(extractVulnPrioritizationSubmission({})).toBeNull();
  });
});

describe('parseVulnerabilities', () => {
  it('parses seeded vulnerability fields', () => {
    const parsed = parseVulnerabilities({
      vulnerabilities: [
        {
          id: 'V1',
          cvss: '9.0',
          exposed_system: 'Web',
          exposure: 'internet_facing',
          exploit_available: 'true',
          cve: 'CVE-1',
          title: 'Test',
        },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: 'V1',
      cvss: 9,
      exposedSystem: 'Web',
      exposure: 'internet',
      exploitAvailable: true,
      cveId: 'CVE-1',
    });
  });
});

describe('evaluateVulnPrioritization', () => {
  it('resolves an exact canonical schedule', () => {
    const result = evaluateVulnPrioritization(
      { type: 'vuln_prioritization', orderedIds: CANONICAL_ORDER },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.exactMatch).toBe(true);
    expect(result.structured.percentage).toBe(100);
  });

  it('resolves a near-correct schedule above the 80% threshold', () => {
    const near = [...CANONICAL_ORDER];
    [near[0], near[1]] = [near[1]!, near[0]!];
    const result = evaluateVulnPrioritization({ orderedIds: near }, ticket());
    expect(result.structured.percentage).toBeGreaterThan(80);
    expect(result.ok).toBe(true);
    expect(result.structured.exactMatch).toBe(false);
  });

  it('needs revision for a badly inverted schedule', () => {
    const reversed = [...CANONICAL_ORDER].reverse();
    const result = evaluateVulnPrioritization(
      { orderedIds: reversed },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.percentage).toBe(0);
    expect(result.structured.reason).toBe('below_threshold');
  });

  it('rejects incomplete permutations', () => {
    const result = evaluateVulnPrioritization(
      { orderedIds: CANONICAL_ORDER.slice(0, 5) },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('incomplete_permutation');
  });

  it('derives expectedOrder from vulnerabilities when omitted', () => {
    const result = evaluateVulnPrioritization(
      { orderedIds: CANONICAL_ORDER },
      ticket({ expected_state: { passThresholdPercent: 80 } })
    );
    expect(result.ok).toBe(true);
    expect(result.structured.expectedOrder).toEqual(CANONICAL_ORDER);
  });
});

describe('vulnPrioritizationTicketScorer', () => {
  it('registers canonical type and alias', () => {
    expect(getTicketScorer('vuln_prioritization')).toBe(
      vulnPrioritizationTicketScorer
    );
    expect(getTicketScorer('patch_schedule')).toBe(
      vulnPrioritizationTicketScorer
    );
  });

  it('returns resolved / needs_revision status', async () => {
    const pass = await vulnPrioritizationTicketScorer.score(
      { orderedIds: CANONICAL_ORDER },
      ticket()
    );
    expect(pass.status).toBe('resolved');

    const fail = await vulnPrioritizationTicketScorer.score(
      { orderedIds: [...CANONICAL_ORDER].reverse() },
      ticket()
    );
    expect(fail.status).toBe('needs_revision');
  });
});
