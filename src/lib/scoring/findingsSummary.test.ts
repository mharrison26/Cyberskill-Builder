import { describe, expect, it } from 'vitest';

import {
  evaluateFindingsSummaryDeterministic,
  findingsSummaryTicketScorer,
} from '@/lib/scoring/findingsSummary';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-find-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'findings_summary',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief: 'Compile HarborForge findings.',
    initial_state: {
      priorStageOutcomes: [
        {
          title: 'Access revocation',
          detail: 'Failed — late and missing revocations.',
        },
      ],
    },
    expected_state: {
      minFieldLength: 40,
      requiredThemes: ['access revocation', 'three-way match'],
    },
    dcwf_code: '612',
    sort_order: 4,
    ...overrides,
  };
}

const pad = (theme: string) =>
  `This narrative covers ${theme} with enough detail for the engagement wrap-up.`;

describe('findingsSummary', () => {
  it('registers findings_summary aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('findings_summary');
    expect(registered).toContain('engagement_findings');
    expect(getTicketScorer('findings_summary')).toBeTruthy();
  });

  it('requires theme keywords from expected findings', () => {
    const result = evaluateFindingsSummaryDeterministic(
      {
        executiveSummary: pad('general control gaps'),
        findingsDetail: pad('general control gaps'),
        recommendations: pad('remediate promptly'),
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.themesMissing.length).toBeGreaterThan(0);
  });

  it('resolves when structure and themes are present', async () => {
    const submission = {
      type: 'findings_summary',
      executiveSummary: pad('access revocation and invoice controls'),
      findingsDetail: pad(
        'access revocation delays and three-way match failures'
      ),
      recommendations: pad('tighten joiner-mover-leaver and AP match rules'),
    };
    const scored = await findingsSummaryTicketScorer.score(
      submission,
      ticket()
    );
    expect(scored.status).toBe('resolved');
    expect(scored.structuredResult.themesOk).toBe(true);
  });
});
