import { describe, expect, it } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer } from '@/lib/scoring';
import {
  computePoamRiskScore,
  crossSystemPoamPriorityTicketScorer,
  derivePoamExpectedOrder,
  evaluateCrossSystemPoamPriority,
  extractCrossSystemPoamPrioritySubmission,
  flattenPoamItems,
  isCrossSystemPoamPriorityTicketType,
  parseCrossSystemPoamSystems,
  type CrossSystemPoamItem,
  type CrossSystemPoamSystem,
} from '@/lib/scoring/crossSystemPoamPriority';

const SAMPLE_SYSTEMS: CrossSystemPoamSystem[] = [
  {
    id: 'SYS-AEGIS',
    name: 'AEGIS Payment Gateway',
    impactLevel: 'high',
    description: 'Card-not-present authorization path.',
    poamItems: [
      {
        id: 'AEGIS-POAM-01',
        title: 'MFA gap on break-glass admins',
        weakness:
          'Privileged break-glass accounts lack phishing-resistant MFA.',
        severity: 'critical',
        dueDate: '2026-09-01',
      },
      {
        id: 'AEGIS-POAM-02',
        title: 'Incomplete TLS cipher hardening',
        weakness: 'Legacy TLS 1.0 still accepted on one edge VIP.',
        severity: 'high',
        dueDate: '2026-10-15',
      },
    ],
  },
  {
    id: 'SYS-IAM',
    name: 'Meridian Identity Broker',
    impactLevel: 'moderate',
    description: 'Workforce SSO / federation.',
    poamItems: [
      {
        id: 'IAM-POAM-01',
        title: 'Orphaned privileged roles',
        weakness: 'Quarterly access review left orphaned admin roles active.',
        severity: 'critical',
        dueDate: '2026-09-15',
      },
      {
        id: 'IAM-POAM-02',
        title: 'Session timeout too long',
        weakness: 'Idle SSO sessions persist beyond policy.',
        severity: 'moderate',
        dueDate: '2026-11-01',
      },
    ],
  },
  {
    id: 'SYS-COLLAB',
    name: 'Nexus Collaboration Suite',
    impactLevel: 'high',
    description: 'Enterprise messaging holding CUI.',
    poamItems: [
      {
        id: 'COLLAB-POAM-01',
        title: 'External sharing defaults open',
        weakness: 'Guest sharing enabled org-wide without DLP gates.',
        severity: 'moderate',
        dueDate: '2026-10-01',
      },
    ],
  },
  {
    id: 'SYS-WIKI',
    name: 'HarborForge Intranet Wiki',
    impactLevel: 'low',
    description: 'Internal knowledge base; no CUI.',
    poamItems: [
      {
        id: 'WIKI-POAM-01',
        title: 'Outdated CMS plugin',
        weakness: 'Known XSS in wiki plugin; internal-only exposure.',
        severity: 'high',
        dueDate: '2026-12-01',
      },
      {
        id: 'WIKI-POAM-02',
        title: 'Missing security headers',
        weakness: 'CSP / HSTS not set on wiki vhost.',
        severity: 'low',
        dueDate: '2027-01-15',
      },
    ],
  },
];

/** riskScore = impact × severity → unambiguous descending order. */
const CANONICAL_ORDER = [
  'AEGIS-POAM-01', // high×critical = 12
  'AEGIS-POAM-02', // high×high = 9
  'IAM-POAM-01', // moderate×critical = 8
  'COLLAB-POAM-01', // high×moderate = 6
  'IAM-POAM-02', // moderate×moderate = 4
  'WIKI-POAM-01', // low×high = 3
  'WIKI-POAM-02', // low×low = 1
];

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-poam-port',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'cross_system_poam_priority',
    difficulty: 'medium',
    sla_minutes: 35,
    scenario_brief: 'Cross-system POA&M: prioritize remediation portfolio.',
    initial_state: {
      prompt: 'Produce one prioritized cross-system remediation order.',
      systems: SAMPLE_SYSTEMS,
    },
    expected_state: {
      expectedOrder: CANONICAL_ORDER,
      scoringMode: 'exact_order',
      minPrefixCorrect: null,
      weights: {
        impact: { low: 1, moderate: 2, high: 3 },
        severity: { low: 1, moderate: 2, high: 3, critical: 4 },
      },
    },
    dcwf_code: null,
    sort_order: 0,
    ...overrides,
  };
}

describe('isCrossSystemPoamPriorityTicketType', () => {
  it('accepts canonical type and aliases', () => {
    expect(
      isCrossSystemPoamPriorityTicketType('cross_system_poam_priority')
    ).toBe(true);
    expect(
      isCrossSystemPoamPriorityTicketType('enterprise_poam_prioritization')
    ).toBe(true);
    expect(isCrossSystemPoamPriorityTicketType('isso_poam_portfolio')).toBe(
      true
    );
    expect(
      isCrossSystemPoamPriorityTicketType('grc.cross_system_poam_priority')
    ).toBe(true);
    expect(isCrossSystemPoamPriorityTicketType('vuln_prioritization')).toBe(
      false
    );
  });
});

describe('computePoamRiskScore / derivePoamExpectedOrder', () => {
  it('weights impact × severity', () => {
    expect(
      computePoamRiskScore({ impactLevel: 'high', severity: 'critical' })
    ).toBe(12);
    expect(
      computePoamRiskScore({ impactLevel: 'moderate', severity: 'critical' })
    ).toBe(8);
    expect(computePoamRiskScore({ impactLevel: 'low', severity: 'high' })).toBe(
      3
    );
  });

  it('derives unambiguous risk-weighted order', () => {
    const items = flattenPoamItems(SAMPLE_SYSTEMS);
    expect(derivePoamExpectedOrder(items)).toEqual(CANONICAL_ORDER);
  });

  it('tie-breaks equal risk scores by dueDate then id', () => {
    const tied: CrossSystemPoamItem[] = [
      {
        id: 'B-ITEM',
        systemId: 'S1',
        systemName: 'S1',
        impactLevel: 'high',
        title: 'B',
        weakness: '',
        severity: 'moderate',
        dueDate: '2026-11-01',
      },
      {
        id: 'A-ITEM',
        systemId: 'S2',
        systemName: 'S2',
        impactLevel: 'moderate',
        title: 'A',
        weakness: '',
        severity: 'high',
        dueDate: '2026-10-01',
      },
    ];
    // both score 6; earlier dueDate wins
    expect(derivePoamExpectedOrder(tied)).toEqual(['A-ITEM', 'B-ITEM']);
  });
});

describe('parseCrossSystemPoamSystems', () => {
  it('parses seeded systems and snake_case fields', () => {
    const parsed = parseCrossSystemPoamSystems({
      systems: [
        {
          id: 'SYS-1',
          name: 'Test',
          impact_level: 'High',
          poam_items: [
            {
              id: 'P-1',
              title: 'Finding',
              severity: 'Critical',
              due_date: '2026-09-01',
              description: 'Weakness text',
            },
          ],
        },
      ],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      id: 'SYS-1',
      impactLevel: 'high',
    });
    expect(parsed[0]!.poamItems[0]).toMatchObject({
      id: 'P-1',
      severity: 'critical',
      dueDate: '2026-09-01',
      weakness: 'Weakness text',
    });
  });
});

describe('extractCrossSystemPoamPrioritySubmission', () => {
  it('reads orderedIds', () => {
    expect(
      extractCrossSystemPoamPrioritySubmission({
        type: 'cross_system_poam_priority',
        orderedIds: ['A', 'B'],
      })
    ).toEqual({
      type: 'cross_system_poam_priority',
      orderedIds: ['A', 'B'],
    });
  });

  it('accepts snake_case and nested id objects', () => {
    expect(
      extractCrossSystemPoamPrioritySubmission({
        ordered_ids: [{ id: 'A' }, { poamId: 'B' }],
      })
    ).toEqual({
      type: 'cross_system_poam_priority',
      orderedIds: ['A', 'B'],
    });
  });

  it('returns null when missing', () => {
    expect(extractCrossSystemPoamPrioritySubmission({})).toBeNull();
  });
});

describe('evaluateCrossSystemPoamPriority', () => {
  it('resolves an exact canonical order', () => {
    const result = evaluateCrossSystemPoamPriority(
      { type: 'cross_system_poam_priority', orderedIds: CANONICAL_ORDER },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.exactMatch).toBe(true);
    expect(result.structured.percentage).toBe(100);
    expect(result.structured.partialScore).toBe(100);
    expect(result.structured.firstMismatchIndex).toBeNull();
  });

  it('needs revision on adjacent swap and reports first mismatch', () => {
    const swapped = [...CANONICAL_ORDER];
    [swapped[0], swapped[1]] = [swapped[1]!, swapped[0]!];
    const result = evaluateCrossSystemPoamPriority(
      { orderedIds: swapped },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.exactMatch).toBe(false);
    expect(result.structured.firstMismatchIndex).toBe(0);
    expect(result.structured.partialScore).toBeGreaterThan(0);
    expect(result.feedback).toContain('First mismatch at position 1');
    expect(result.feedback).toContain('AEGIS-POAM-01');
  });

  it('rejects incomplete permutations', () => {
    const result = evaluateCrossSystemPoamPriority(
      { orderedIds: CANONICAL_ORDER.slice(0, 4) },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('incomplete_permutation');
  });

  it('derives expectedOrder from systems when omitted', () => {
    const result = evaluateCrossSystemPoamPriority(
      { orderedIds: CANONICAL_ORDER },
      ticket({ expected_state: { scoringMode: 'exact_order' } })
    );
    expect(result.ok).toBe(true);
    expect(result.structured.expectedOrder).toEqual(CANONICAL_ORDER);
  });
});

describe('crossSystemPoamPriorityTicketScorer', () => {
  it('registers canonical type and aliases', () => {
    expect(getTicketScorer('cross_system_poam_priority')).toBe(
      crossSystemPoamPriorityTicketScorer
    );
    expect(getTicketScorer('enterprise_poam_prioritization')).toBe(
      crossSystemPoamPriorityTicketScorer
    );
    expect(getTicketScorer('isso_poam_portfolio')).toBe(
      crossSystemPoamPriorityTicketScorer
    );
  });

  it('returns resolved / needs_revision status', async () => {
    const pass = await crossSystemPoamPriorityTicketScorer.score(
      { orderedIds: CANONICAL_ORDER },
      ticket()
    );
    expect(pass.status).toBe('resolved');

    const fail = await crossSystemPoamPriorityTicketScorer.score(
      { orderedIds: [...CANONICAL_ORDER].reverse() },
      ticket()
    );
    expect(fail.status).toBe('needs_revision');
    expect(fail.structuredResult).toMatchObject({
      style: 'cross_system_poam_priority',
      exactMatch: false,
    });
  });
});
