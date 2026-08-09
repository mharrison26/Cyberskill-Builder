import { describe, expect, it } from 'vitest';

import {
  buildEngagementFlowView,
  formatEngagementScopeLines,
  groupTicketsByEngagement,
  isEngagementStageUnlocked,
  isEngagementTicket,
  sortEngagementTickets,
  type EngagementSummary,
  type EngagementTicket,
} from '@/lib/tickets/engagement';

const engagement: EngagementSummary = {
  id: 'eng-1',
  slug: 'harborforge-fy26',
  title: 'HarborForge FY2026 ITGC engagement',
  scope: {
    company: 'HarborForge Systems',
    period: 'FY2026',
    system: 'ERP / IAM',
    inScopeProcesses: ['Procure-to-pay'],
    inScopeItgcs: ['Timely access revocation'],
  },
  sort_order: 0,
};

function ticket(
  stage: number,
  overrides: Partial<EngagementTicket> = {}
): EngagementTicket {
  return {
    id: `t-${stage}`,
    ticket_type: 'audit_planning_memo',
    scenario_brief: `Stage ${stage}`,
    difficulty: 'medium',
    sla_minutes: 45,
    sort_order: stage,
    tier: 2,
    engagement_id: 'eng-1',
    engagement_stage: stage,
    ...overrides,
  };
}

describe('engagement sequencing helpers', () => {
  it('detects engagement membership', () => {
    expect(isEngagementTicket(ticket(1))).toBe(true);
    expect(
      isEngagementTicket({
        engagement_id: null,
        engagement_stage: null,
      })
    ).toBe(false);
  });

  it('unlocks stage 1 always and later stages only after prior resolved', () => {
    const stages = [
      { stage: 1, status: 'resolved' as const },
      { stage: 2, status: 'new' as const },
      { stage: 3, status: 'new' as const },
    ];
    expect(isEngagementStageUnlocked(1, stages)).toBe(true);
    expect(isEngagementStageUnlocked(2, stages)).toBe(true);
    expect(isEngagementStageUnlocked(3, stages)).toBe(false);

    stages[1]!.status = 'resolved';
    expect(isEngagementStageUnlocked(3, stages)).toBe(true);
  });

  it('forceUnlock opens all stages', () => {
    const stages = [
      { stage: 1, status: 'new' as const },
      { stage: 2, status: 'new' as const },
    ];
    expect(
      isEngagementStageUnlocked(2, stages, { forceUnlock: true })
    ).toBe(true);
  });

  it('builds a flow with progress and current stage', () => {
    const progress = new Map([
      ['t-1', 'resolved' as const],
      ['t-2', 'in_progress' as const],
    ]);
    const flow = buildEngagementFlowView({
      engagement,
      tickets: [ticket(3), ticket(1), ticket(2)],
      progressByTicketId: progress,
      trackSlug: 'grc',
    });

    expect(flow.stages.map((s) => s.stage)).toEqual([1, 2, 3]);
    expect(flow.stages[0]?.unlocked).toBe(true);
    expect(flow.stages[1]?.unlocked).toBe(true);
    expect(flow.stages[2]?.unlocked).toBe(false);
    expect(flow.resolvedCount).toBe(1);
    expect(flow.currentStage).toBe(2);
    expect(flow.stages[1]?.href).toBe('/tracks/grc/tickets/t-2');
  });

  it('groups engagement tickets and leaves standalone separate', () => {
    const { flows, standalone } = groupTicketsByEngagement({
      engagements: [engagement],
      tickets: [
        ticket(1),
        {
          id: 'solo',
          ticket_type: 'triage',
          scenario_brief: 'Standalone',
          difficulty: 'low',
          sla_minutes: 30,
          sort_order: 99,
          tier: 1,
          engagement_id: null,
          engagement_stage: null,
        },
        ticket(2),
      ],
      progressByTicketId: new Map(),
      trackSlug: 'grc',
    });

    expect(flows).toHaveLength(1);
    expect(flows[0]?.totalCount).toBe(2);
    expect(standalone).toHaveLength(1);
    expect(standalone[0]?.id).toBe('solo');
  });

  it('formats scope lines for headers', () => {
    const lines = formatEngagementScopeLines(engagement.scope);
    expect(lines.some((l) => l.includes('HarborForge'))).toBe(true);
    expect(lines.some((l) => l.includes('FY2026'))).toBe(true);
    expect(lines.some((l) => l.includes('Procure-to-pay'))).toBe(true);
  });

  it('sorts by engagement_stage', () => {
    const sorted = sortEngagementTickets([ticket(3), ticket(1), ticket(2)]);
    expect(sorted.map((t) => t.engagement_stage)).toEqual([1, 2, 3]);
  });
});
