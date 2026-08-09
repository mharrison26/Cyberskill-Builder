import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  AUDIT_WORKPAPER_MIN_FIELD_LENGTH,
  evaluateAuditWorkpaperDeterministic,
  extractAuditWorkpaperSubmission,
  resolveStatedTestObjective,
  auditWorkpaperTicketScorer,
} from '@/lib/scoring/auditWorkpaper';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

vi.mock('@/lib/grading/callClaudeGrading', () => {
  class MissingAnthropicApiKeyError extends Error {
    constructor() {
      super('ANTHROPIC_API_KEY is not configured');
      this.name = 'MissingAnthropicApiKeyError';
    }
  }

  return {
    MissingAnthropicApiKeyError,
    callClaudeGrading: vi.fn(),
  };
});

import { callClaudeGrading } from '@/lib/grading/callClaudeGrading';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-workpaper-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'audit_workpaper',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      'Workpaper: Document termination account-disablement testing for AC-2',
    initial_state: {
      controlId: 'AC-2',
      controlTitle: 'Account Management',
      testObjective:
        'Determine whether terminated user accounts are disabled or removed within 24 hours of the HR termination effective date.',
      scenario: {
        organization: 'North Pier Logistics (regional freight broker)',
        system: 'Okta workforce IAM + BambooHR',
      },
    },
    expected_state: {
      minFieldLength: 40,
      minIdentityLength: 2,
      minConclusionLength: 40,
      guidanceTopics: [
        'stated-objective',
        'conclusion-quality',
        'objective-alignment',
      ],
      topKGuidanceSections: 5,
    },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const solidSubmission = {
  type: 'audit_workpaper',
  objective:
    'Determine whether terminated user accounts are disabled or removed within 24 hours of the HR termination effective date.',
  procedurePerformed:
    'Obtained the Q2 BambooHR termination export (n=47). Selected a haphazard sample of 15 terminations spanning both offices. For each sample item, compared the HR effective date to the Okta account disable timestamp and noted any ticket references.',
  evidenceObtained:
    'BambooHR termination CSV for 2026-04-01 through 2026-06-30; Okta user export dated 2026-07-02 with status and last updated fields; three Jira disablement tickets linked from IAM.',
  conclusion:
    'Based on the sample of 15 terminations, the control is not operating effectively: 3 of 15 accounts remained enabled 2–5 days after the HR effective date, exceeding the 24-hour requirement. Remaining sample items were disabled same day.',
  preparer: 'Alex Rivera',
  reviewer: 'Jordan Lee',
};

describe('auditWorkpaper scorer shape', () => {
  it('registers audit_workpaper and workpaper aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('audit_workpaper');
    expect(registered).toContain('workpaper');
    expect(getTicketScorer('audit_workpaper')).toBeTruthy();
    expect(getTicketScorer('workpaper')).toBe(
      getTicketScorer('audit_workpaper')
    );
  });

  it('resolves stated test objective from initial_state', () => {
    expect(resolveStatedTestObjective(ticket())).toMatch(/terminated user/i);
    expect(
      resolveStatedTestObjective(
        ticket({
          initial_state: {},
          expected_state: {
            testObjective: 'Determine whether MFA is enforced for admins.',
          },
        })
      )
    ).toBe('Determine whether MFA is enforced for admins.');
  });

  it('extracts camelCase and snake_case fields', () => {
    expect(extractAuditWorkpaperSubmission(solidSubmission)).toMatchObject({
      objective: solidSubmission.objective,
      procedurePerformed: solidSubmission.procedurePerformed,
      evidenceObtained: solidSubmission.evidenceObtained,
      conclusion: solidSubmission.conclusion,
      preparer: solidSubmission.preparer,
      reviewer: solidSubmission.reviewer,
    });

    const snake = extractAuditWorkpaperSubmission({
      objective: solidSubmission.objective,
      procedure_performed: solidSubmission.procedurePerformed,
      evidence_obtained: solidSubmission.evidenceObtained,
      conclusion: solidSubmission.conclusion,
      prepared_by: solidSubmission.preparer,
      reviewed_by: solidSubmission.reviewer,
    });
    expect(snake?.procedurePerformed).toBe(solidSubmission.procedurePerformed);
    expect(snake?.preparer).toBe(solidSubmission.preparer);
  });

  it('fails when required fields are missing or short', () => {
    const missing = evaluateAuditWorkpaperDeterministic({}, ticket());
    expect(missing.ok).toBe(false);
    expect(missing.structured.style).toBe('audit_workpaper');
    expect(missing.structured.reason).toBe('missing_fields');

    const short = evaluateAuditWorkpaperDeterministic(
      {
        ...solidSubmission,
        objective: 'too short',
      },
      ticket()
    );
    expect(short.ok).toBe(false);
    expect(short.structured.reason).toBe('fields_too_short');
    expect(short.feedback).toMatch(/objective/i);
  });

  it('fails when preparer/reviewer are non-trivial but too short', () => {
    const result = evaluateAuditWorkpaperDeterministic(
      {
        ...solidSubmission,
        preparer: 'A',
        reviewer: 'B',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('fields_too_short');
    expect(result.feedback).toMatch(/preparer/i);
  });

  it('passes deterministic gates with a complete workpaper', () => {
    const result = evaluateAuditWorkpaperDeterministic(
      solidSubmission,
      ticket()
    );

    expect(result.ok).toBe(true);
    expect(result.statedTestObjective).toMatch(/24 hours/i);
    expect(result.structured).toMatchObject({
      style: 'audit_workpaper',
      fieldsOk: true,
      minFieldLength: AUDIT_WORKPAPER_MIN_FIELD_LENGTH,
      guidancePath: null,
    });
    expect(result.structured.objectiveLength).toBeGreaterThanOrEqual(
      AUDIT_WORKPAPER_MIN_FIELD_LENGTH
    );
  });

  it('requires a stated test objective on the ticket', () => {
    const result = evaluateAuditWorkpaperDeterministic(
      solidSubmission,
      ticket({ initial_state: {}, expected_state: { minFieldLength: 40 } })
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_test_objective');
  });
});

describe('auditWorkpaperTicketScorer RAG path', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves when Claude returns satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback: 'Conclusion clearly answers the stated test objective.',
      strengths: ['Clear exception quantification'],
      gaps: [],
    });

    const result = await auditWorkpaperTicketScorer.score(
      solidSubmission,
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'audit_workpaper',
      fieldsOk: true,
      grading: { finding_state: 'satisfied' },
    });
    expect(callClaudeGrading).toHaveBeenCalledOnce();
  });

  it('needs revision when Claude finds gaps', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'not_satisfied',
      feedback:
        'Conclusion does not answer the disablement timeframe objective.',
      strengths: [],
      gaps: ['Discusses password policy instead of termination timing'],
    });

    const result = await auditWorkpaperTicketScorer.score(
      solidSubmission,
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toMatch(/password policy/i);
  });
});
