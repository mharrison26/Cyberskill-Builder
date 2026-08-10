import { describe, expect, it } from 'vitest';

import {
  ASSESSMENT_PROCEDURES_MIN_FIELD_LENGTH,
  evaluateAssessmentProceduresDeterministic,
  extractAssessmentProceduresSubmission,
  resolveAssessmentProceduresControlId,
} from '@/lib/scoring/assessmentProcedures';
import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';

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
      {
        type: 'assessment_procedures',
        examine: longEnough,
        interview: longEnough.replace('Examine', 'Interview'),
        test: longEnough.replace('Examine', 'Test'),
      },
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
