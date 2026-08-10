import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import {
  ASSESSMENT_PROCEDURES_MIN_FIELD_LENGTH,
  assessmentProceduresTicketScorer,
  evaluateAssessmentProceduresDeterministic,
  extractAssessmentProceduresSubmission,
  resolveAssessmentProceduresControlId,
} from '@/lib/scoring/assessmentProcedures';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';
import { getAssessmentObjectiveText } from '@/lib/oscal/getControl';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-assess-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'assessment_procedures',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      "Before the SOC 2 auditor's fieldwork begins, draft the assessment procedures your team will use to test control IA-5(1) yourselves, structured as Examine / Interview / Test, so you're not walking into the audit blind.",
    initial_state: { control_id: 'ia-5.1', sheetId: 'GRC-05' },
    expected_state: { control_id: 'ia-5.1', minFieldLength: 40 },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const longEnough =
  'Examine password policy, authenticator management procedures, and system configuration settings related to password-based authentication controls.';

const completeSubmission = {
  type: 'assessment_procedures',
  examine: longEnough,
  interview: longEnough.replace('Examine', 'Interview'),
  test: longEnough.replace('Examine', 'Test'),
};

describe('assessmentProcedures scorer shape', () => {
  it('registers assessment_procedures and sp800_53a aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('assessment_procedures');
    expect(registered).toContain('sp800_53a');
    expect(registered).toContain('sp_800_53a');
    expect(getTicketScorer('assessment_procedures')).toBeTruthy();
    expect(getTicketScorer('sp800_53a')).toBe(
      getTicketScorer('assessment_procedures')
    );
  });

  it('resolves control_id from expected_state then initial_state', () => {
    expect(
      resolveAssessmentProceduresControlId(
        ticket({
          initial_state: { control_id: 'ac-3' },
          expected_state: { control_id: 'ia-5.1' },
        })
      )
    ).toBe('ia-5.1');

    expect(
      resolveAssessmentProceduresControlId(
        ticket({
          initial_state: { controlId: 'ia-5.1' },
          expected_state: {},
        })
      )
    ).toBe('ia-5.1');
  });

  it('pins deterministic control_id to ia-5.1 for GRC-05', () => {
    expect(resolveAssessmentProceduresControlId(ticket())).toBe('ia-5.1');
  });

  it('extracts examine / interview / test fields', () => {
    const parsed = extractAssessmentProceduresSubmission({
      type: 'assessment_procedures',
      examine: ' e ',
      interview: ' i ',
      test: ' t ',
      controlId: 'ia-5.1',
    });

    expect(parsed).toEqual({
      type: 'assessment_procedures',
      controlId: 'ia-5.1',
      examine: 'e',
      interview: 'i',
      test: 't',
    });
  });

  it('fails deterministic checks when fields are missing or short', () => {
    const missing = evaluateAssessmentProceduresDeterministic({}, ticket());
    expect(missing.ok).toBe(false);
    expect(missing.structured.style).toBe('assessment_procedures');
    expect(missing.structured.reason).toBe('missing_fields');

    const short = evaluateAssessmentProceduresDeterministic(
      {
        examine: 'too short',
        interview: longEnough,
        test: longEnough,
      },
      ticket()
    );
    expect(short.ok).toBe(false);
    expect(short.structured.reason).toBe('fields_too_short');
    expect(short.feedback).toMatch(/examine/i);
  });

  it('passes deterministic gates with complete procedures', () => {
    const result = evaluateAssessmentProceduresDeterministic(
      completeSubmission,
      ticket()
    );

    expect(result.ok).toBe(true);
    expect(result.controlId).toBe('ia-5.1');
    expect(result.structured).toMatchObject({
      style: 'assessment_procedures',
      controlId: 'ia-5.1',
      fieldsOk: true,
      minFieldLength: ASSESSMENT_PROCEDURES_MIN_FIELD_LENGTH,
      catalogPath: null,
    });
    expect(result.structured.examineLength).toBeGreaterThanOrEqual(
      ASSESSMENT_PROCEDURES_MIN_FIELD_LENGTH
    );
  });

  it('requires control_id on the ticket', () => {
    const result = evaluateAssessmentProceduresDeterministic(
      {
        examine: longEnough,
        interview: longEnough,
        test: longEnough,
      },
      ticket({ initial_state: {}, expected_state: {} })
    );

    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_control_id');
  });
});

describe('assessmentProceduresTicketScorer RAG path', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not call Claude when E/I/T gates fail', async () => {
    const result = await assessmentProceduresTicketScorer.score(
      { examine: 'short', interview: longEnough, test: longEnough },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(callClaudeGrading).not.toHaveBeenCalled();
  });

  it('grades against retrieved ia-5.1 SP 800-53A text only (F26 RAG)', async () => {
    const assessment = getAssessmentObjectiveText('ia-5.1');
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Procedures appropriately cover password-based authenticator objectives via Examine, Interview, and Test.',
      strengths: [
        'Examine cites password policy and configurations',
        'Interview targets authenticator management personnel',
      ],
      gaps: [],
    });

    const result = await assessmentProceduresTicketScorer.score(
      completeSubmission,
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'assessment_procedures',
      controlId: 'ia-5.1',
      fieldsOk: true,
      catalogPath: 'data/oscal/NIST_SP-800-53_rev5_catalog.json',
      grading: { finding_state: 'satisfied' },
    });
    expect(callClaudeGrading).toHaveBeenCalledOnce();

    const prompt = vi.mocked(callClaudeGrading).mock.calls[0]?.[0] ?? '';
    expect(prompt).toMatch(/retrieved SP 800-53A/i);
    expect(prompt).toContain(assessment.assessmentObjective.slice(0, 80));
    expect(prompt).toMatch(/### Examine/i);
    expect(prompt).toMatch(/### Interview/i);
    expect(prompt).toMatch(/### Test/i);
    expect(prompt).toContain(completeSubmission.examine);
    // Anti-hallucination: grade from retrieved 53A text, not parametric 53 statement.
    expect(prompt).not.toMatch(/control statement/i);
    expect(prompt).toMatch(/Do not rely on outside knowledge/i);
  });

  it('needs revision when grading is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'insufficient_evidence',
      feedback: 'Test procedures do not exercise listed assessment objects.',
      strengths: ['Examine mentions password policy'],
      gaps: [
        'Missing test of password-based authenticator management mechanisms',
      ],
    });

    const result = await assessmentProceduresTicketScorer.score(
      completeSubmission,
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toContain(
      'Test procedures do not exercise listed assessment objects'
    );
    expect(result.feedback).toMatch(/Gaps:/i);
  });

  it('needs revision when API key is missing after deterministic pass', async () => {
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await assessmentProceduresTicketScorer.score(
      completeSubmission,
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      reason: 'grading_unavailable_missing_api_key',
    });
    expect(result.feedback).toMatch(/ANTHROPIC_API_KEY/i);
  });
});
