import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  CONTINUOUS_AUDITING_MIN_EXCEPTION_LENGTH,
  CONTINUOUS_AUDITING_MIN_FIELD_LENGTH,
  evaluateContinuousAuditingDeterministic,
  extractContinuousAuditingSubmission,
  resolveControlArea,
  continuousAuditingTicketScorer,
} from '@/lib/scoring/continuousAuditing';
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
    id: 't-ca-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'continuous_auditing',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      'ContinuousAuditing: Design monthly exception reporting for timely access revocation',
    initial_state: {
      controlArea: 'Timely access revocation',
      controlId: 'AC-2',
      controlTitle: 'Account Management — timely access revocation',
      scenario: {
        organization:
          'North Pier Logistics — regional freight broker with Okta + BambooHR.',
        currentTest:
          'Annual manual sample of 25 terminations; results lag by months.',
      },
    },
    expected_state: {
      minFieldLength: 40,
      minExceptionLength: 80,
      guidanceTopics: [
        'frequency-design',
        'data-source-design',
        'exception-handling',
        'design-completeness',
      ],
      topKGuidanceSections: 5,
    },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const solidSubmission = {
  type: 'continuous_auditing',
  controlArea: 'Timely access revocation',
  frequency:
    'Monthly automated exception report reviewed by Internal Audit within five business days of each month-end run.',
  dataSource:
    'BambooHR termination effective dates joined to Okta account status and disable timestamps via a scheduled export/API join for the prior calendar month population.',
  exceptionHandling:
    'IAM analyst triages each exception within 2 business days, opens a Jira ticket for late disables, documents root cause and remediation evidence, and Internal Audit samples closed tickets quarterly. Open items older than 10 days escalate to the IAM manager and audit lead.',
  automationMethod:
    'Nightly Python job builds a month-to-date join; month-end snapshot emailed as CSV + dashboard.',
  owners: 'Internal Audit owns the analytic; IAM owns remediation.',
};

describe('continuousAuditing scorer shape', () => {
  it('registers continuous_auditing and continuous_audit_design aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('continuous_auditing');
    expect(registered).toContain('continuous_audit_design');
    expect(getTicketScorer('continuous_auditing')).toBeTruthy();
    expect(getTicketScorer('continuous_audit_design')).toBe(
      getTicketScorer('continuous_auditing')
    );
  });

  it('resolves control area from initial_state when submission omits it', () => {
    expect(resolveControlArea(ticket(), null)).toMatch(/access revocation/i);
    expect(
      resolveControlArea(
        ticket({
          initial_state: {},
          expected_state: { controlArea: 'Change management' },
        }),
        null
      )
    ).toBe('Change management');
  });

  it('extracts camelCase and snake_case fields', () => {
    expect(extractContinuousAuditingSubmission(solidSubmission)).toMatchObject({
      controlArea: solidSubmission.controlArea,
      frequency: solidSubmission.frequency,
      dataSource: solidSubmission.dataSource,
      exceptionHandling: solidSubmission.exceptionHandling,
      automationMethod: solidSubmission.automationMethod,
      owners: solidSubmission.owners,
    });

    const snake = extractContinuousAuditingSubmission({
      control_area: solidSubmission.controlArea,
      frequency: solidSubmission.frequency,
      data_source: solidSubmission.dataSource,
      exception_handling: solidSubmission.exceptionHandling,
      automation_method: solidSubmission.automationMethod,
    });
    expect(snake?.dataSource).toBe(solidSubmission.dataSource);
    expect(snake?.exceptionHandling).toBe(solidSubmission.exceptionHandling);
    expect(snake?.automationMethod).toBe(solidSubmission.automationMethod);
  });

  it('fails when required fields are missing', () => {
    const missing = evaluateContinuousAuditingDeterministic({}, ticket());
    expect(missing.ok).toBe(false);
    expect(missing.structured.style).toBe('continuous_auditing');
    expect(missing.structured.reason).toBe('missing_fields');
    expect(missing.feedback).toMatch(/frequency/i);
  });

  it('fails when frequency, data source, or exception handling are too short', () => {
    const shortFrequency = evaluateContinuousAuditingDeterministic(
      {
        ...solidSubmission,
        frequency: 'monthly',
      },
      ticket()
    );
    expect(shortFrequency.ok).toBe(false);
    expect(shortFrequency.structured.reason).toBe('fields_too_short');
    expect(shortFrequency.feedback).toMatch(/frequency/i);

    const shortException = evaluateContinuousAuditingDeterministic(
      {
        ...solidSubmission,
        exceptionHandling: 'We will look at exceptions.',
      },
      ticket()
    );
    expect(shortException.ok).toBe(false);
    expect(shortException.structured.reason).toBe('fields_too_short');
    expect(shortException.feedback).toMatch(/exceptionHandling/i);
  });

  it('passes deterministic gates with complete required fields', () => {
    const result = evaluateContinuousAuditingDeterministic(
      solidSubmission,
      ticket()
    );

    expect(result.ok).toBe(true);
    expect(result.controlArea).toMatch(/access revocation/i);
    expect(result.structured).toMatchObject({
      style: 'continuous_auditing',
      fieldsOk: true,
      minFieldLength: CONTINUOUS_AUDITING_MIN_FIELD_LENGTH,
      minExceptionLength: CONTINUOUS_AUDITING_MIN_EXCEPTION_LENGTH,
      guidancePath: null,
    });
    expect(result.structured.frequencyLength).toBeGreaterThanOrEqual(
      CONTINUOUS_AUDITING_MIN_FIELD_LENGTH
    );
    expect(result.structured.exceptionHandlingLength).toBeGreaterThanOrEqual(
      CONTINUOUS_AUDITING_MIN_EXCEPTION_LENGTH
    );
  });

  it('fills control area from ticket when submission omits it', () => {
    const { controlArea: _, ...withoutArea } = solidSubmission;
    void _;
    const result = evaluateContinuousAuditingDeterministic(
      withoutArea,
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.parsed?.controlArea).toMatch(/access revocation/i);
  });
});

describe('continuousAuditingTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  it('returns needs_revision before calling the grader when gates fail', async () => {
    const result = await continuousAuditingTicketScorer.score({}, ticket());
    expect(result.status).toBe('needs_revision');
    expect(callClaudeGrading).not.toHaveBeenCalled();
  });

  it('resolves when RAG grading is satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Solid monthly continuous auditing design with clear data joins and exception ownership.',
      strengths: ['Explicit monthly cadence', 'Concrete Okta/BambooHR sources'],
      gaps: [],
    });

    const result = await continuousAuditingTicketScorer.score(
      solidSubmission,
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(callClaudeGrading).toHaveBeenCalledOnce();
    expect(result.structuredResult).toMatchObject({
      style: 'continuous_auditing',
      fieldsOk: true,
      grading: { finding_state: 'satisfied' },
    });
  });
});
