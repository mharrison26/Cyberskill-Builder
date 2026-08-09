import { describe, expect, it } from 'vitest';

import {
  auditPlanningMemoTicketScorer,
  evaluateAuditPlanningMemoDeterministic,
} from '@/lib/scoring/auditPlanningMemo';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-plan-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'audit_planning_memo',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief: 'Draft the HarborForge planning memo.',
    initial_state: {
      prompt: 'Draft the planning memo.',
    },
    expected_state: { minFieldLength: 40 },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const long =
  'This section describes a non-trivial planning narrative for HarborForge FY2026.';

describe('auditPlanningMemo', () => {
  it('registers audit_planning_memo aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('audit_planning_memo');
    expect(registered).toContain('planning_memo');
    expect(getTicketScorer('audit_planning_memo')).toBeTruthy();
  });

  it('rejects incomplete memos', () => {
    const result = evaluateAuditPlanningMemoDeterministic(
      { objective: long },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('resolves complete memos', async () => {
    const submission = {
      type: 'audit_planning_memo',
      objective: long,
      scope: long,
      riskFocus: long,
      plannedProcedures: long,
    };
    const evaluated = evaluateAuditPlanningMemoDeterministic(
      submission,
      ticket()
    );
    expect(evaluated.ok).toBe(true);

    const scored = await auditPlanningMemoTicketScorer.score(
      submission,
      ticket()
    );
    expect(scored.status).toBe('resolved');
    expect(scored.structuredResult.style).toBe('audit_planning_memo');
  });
});
