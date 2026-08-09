import { describe, expect, it } from 'vitest';

import {
  evaluateSspGapReviewDeterministic,
  parseSspCandidateGaps,
  parseSspExcerpt,
  sspGapReviewTicketScorer,
} from '@/lib/scoring/sspGapReview';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

const CANDIDATES = [
  {
    id: 'gap-missing-ac-6',
    label: 'AC-6 Least Privilege is missing from the Access Control family',
  },
  {
    id: 'gap-vague-cm-2',
    label: 'CM-2 narrative is vague ("implemented as required")',
  },
  {
    id: 'gap-wrong-ao-role',
    label: 'Help Desk is incorrectly listed as Authorizing Official',
  },
  {
    id: 'gap-inherited-sc-7',
    label: 'SC-7 is Inherited but no common-control provider is named',
  },
  {
    id: 'distractor-au-2-ok',
    label: 'AU-2 is incomplete because event types are not listed',
  },
  {
    id: 'distractor-ia-2-freq',
    label: 'IA-2 is missing an authentication review frequency',
  },
];

const REQUIRED = [
  'gap-missing-ac-6',
  'gap-vague-cm-2',
  'gap-wrong-ao-role',
  'gap-inherited-sc-7',
];

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-ssp-gap-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'ssp_gap_review',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief: 'SSP gap review: HarborNet draft SSP quality check.',
    initial_state: {
      systemName: 'HarborNet Case Management System',
      sspExcerpt: {
        overview: 'HarborNet CMS processes contractor PII.',
        roles: 'ISSO: Sam Ortiz. AO incorrectly listed as Help Desk.',
        controlImplementations: [
          {
            controlId: 'AC-2',
            title: 'Account Management',
            status: 'Implemented',
            responsibleRole: 'ISSO',
            narrative: 'Accounts provisioned via joiner-mover-leaver.',
          },
          {
            controlId: 'CM-2',
            title: 'Baseline Configuration',
            status: 'Implemented',
            responsibleRole: 'System Admin',
            narrative: 'Configuration management is implemented as required.',
          },
        ],
      },
      candidateGaps: CANDIDATES,
    },
    expected_state: {
      requiredGapIds: REQUIRED,
      passThresholdPercent: 100,
    },
    dcwf_code: '612',
    sort_order: 2,
    ...overrides,
  };
}

describe('sspGapReview', () => {
  it('registers ssp_gap_review aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('ssp_gap_review');
    expect(registered).toContain('ssp_quality_review');
    expect(registered).toContain('draft_ssp_gaps');
    expect(getTicketScorer('ssp_gap_review')).toBeTruthy();
    expect(getTicketScorer('ssp_quality_review')).toBe(
      getTicketScorer('ssp_gap_review')
    );
  });

  it('parses SSP excerpt and candidate gaps', () => {
    const excerpt = parseSspExcerpt(ticket().initial_state);
    expect(excerpt?.controlImplementations).toHaveLength(2);
    expect(excerpt?.controlImplementations[1]?.narrative).toMatch(
      /implemented as required/i
    );

    const gaps = parseSspCandidateGaps(ticket().initial_state);
    expect(gaps).toHaveLength(6);
    expect(gaps[0]?.id).toBe('gap-missing-ac-6');
  });

  it('gives partial credit when some required gaps are found', () => {
    // 2 of 4 required selected, no distractors:
    // options: 2 TP + 2 FN + 2 TN distractors = 4/6 passed → 67%
    const partial = evaluateSspGapReviewDeterministic(
      {
        type: 'ssp_gap_review',
        selectedGapIds: ['gap-missing-ac-6', 'gap-vague-cm-2'],
      },
      ticket()
    );
    expect(partial.ok).toBe(false);
    expect(partial.structured.foundCount).toBe(2);
    expect(partial.structured.requiredCount).toBe(4);
    expect(partial.structured.recallPercent).toBe(50);
    expect(partial.structured.percentage).toBe(67);
    expect(partial.structured.missingRequiredGapIds).toEqual([
      'gap-inherited-sc-7',
      'gap-wrong-ao-role',
    ]);
  });

  it('penalizes distractors and does not resolve', () => {
    const withDistractor = evaluateSspGapReviewDeterministic(
      {
        selectedGapIds: [...REQUIRED, 'distractor-au-2-ok'],
      },
      ticket()
    );
    expect(withDistractor.ok).toBe(false);
    expect(withDistractor.structured.foundCount).toBe(4);
    expect(withDistractor.structured.recallPercent).toBe(100);
    // 4 TP + 1 FP + 1 TN = 5/6 → 83%
    expect(withDistractor.structured.percentage).toBe(83);
    expect(withDistractor.structured.extraGapIds).toContain(
      'distractor-au-2-ok'
    );
  });

  it('resolves when all required gaps are found and no distractors', async () => {
    const scored = await sspGapReviewTicketScorer.score(
      {
        type: 'ssp_gap_review',
        selectedGapIds: [
          'gap-inherited-sc-7',
          'gap-missing-ac-6',
          'gap-wrong-ao-role',
          'gap-vague-cm-2',
        ],
      },
      ticket()
    );
    expect(scored.status).toBe('resolved');
    expect(scored.structuredResult.percentage).toBe(100);
    expect(scored.structuredResult.recallPercent).toBe(100);
    expect(scored.structuredResult.foundCount).toBe(4);
  });

  it('respects a lowered passThresholdPercent for resolve', async () => {
    const softTicket = ticket({
      expected_state: {
        requiredGapIds: REQUIRED,
        passThresholdPercent: 60,
      },
    });
    // 2/4 required, no distractors → 67% checklist, but missing required gaps
    // still blocks resolve (allRequiredFound gate).
    const stillBlocked = await sspGapReviewTicketScorer.score(
      {
        selectedGapIds: ['gap-missing-ac-6', 'gap-vague-cm-2'],
      },
      softTicket
    );
    expect(stillBlocked.status).toBe('needs_revision');
    expect(stillBlocked.structuredResult.percentage).toBe(67);

    // All required + one distractor → 83%, threshold 60, all required found → resolve
    const accepted = await sspGapReviewTicketScorer.score(
      {
        selectedGapIds: [...REQUIRED, 'distractor-ia-2-freq'],
      },
      softTicket
    );
    expect(accepted.status).toBe('resolved');
    expect(accepted.structuredResult.percentage).toBe(83);
  });

  it('rejects unknown gap ids', () => {
    const result = evaluateSspGapReviewDeterministic(
      { selectedGapIds: ['gap-missing-ac-6', 'not-a-real-gap'] },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('unknown_gap_ids');
  });

  it('returns needs_revision for empty selection', async () => {
    const scored = await sspGapReviewTicketScorer.score(
      { selectedGapIds: [] },
      ticket()
    );
    expect(scored.status).toBe('needs_revision');
    expect(scored.structuredResult.foundCount).toBe(0);
    expect(scored.structuredResult.percentage).toBe(33); // 2 distractor TNs / 6
  });
});
