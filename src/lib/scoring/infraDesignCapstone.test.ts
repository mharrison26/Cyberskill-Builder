import { describe, expect, it, vi } from 'vitest';

import { buildDeterministicInfraFollowUpQuestions } from '@/lib/infra/generateFollowUpQuestions';
import { isInfraDesignCapstoneTicketType } from '@/lib/infra/ticketCodes';
import { isFlagshipEligibleTicketType } from '@/lib/helpdesk/ticketCodes';
import type { ScorableTicket } from '@/lib/scoring';
import {
  createInfraDesignCapstoneTicketScorer,
  evaluateInfraDesignCapstoneDeterministic,
  extractInfraDesignDocument,
  INFRA_DESIGN_DOC_MIN_BODY_LENGTH,
  INFRA_DESIGN_FOLLOWUP_MIN_ANSWER_LENGTH,
} from '@/lib/scoring/infraDesignCapstone';

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
    id: 't-infra',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 3,
    ticket_type: 'infra_design_capstone',
    difficulty: 'high',
    sla_minutes: 90,
    scenario_brief:
      'SA-07: Choose and defend a backup topology for Harbor Dental.',
    initial_state: { ticketCode: 'SA-07', flagship: true },
    expected_state: { flagshipOnResolve: true },
    dcwf_code: null,
    sort_order: 97,
    ...overrides,
  };
}

const solidBody = `
I recommend a 3-2-1 backup topology for Harbor Dental: nightly incremental
plus weekly full to an on-site NAS, with daily immutable copies of the patient
image share and QuickBooks backups to a separate cloud account under a $200/mo
budget. RPO for images is 24 hours; QuickBooks RPO is 4 hours via more frequent
export. RTO for the image share is one business day using the NAS first.
I rejected cloud-only backup because restore of multi-terabyte images over the
clinic's limited uplink would miss the RTO, and I rejected NAS-only because a
ransomware event that reaches the NAS would leave no clean copy. Residual risk
is credential compromise of the cloud tenant; mitigate with MFA and immutability
lock. A quarterly restore drill of one patient folder is owned by the office
manager with a one-page runbook.
`.trim();

const designDoc = {
  title: 'Harbor Dental backup topology ADR',
  topologyChoice: '3-2-1 NAS + immutable cloud',
  body: solidBody,
};

const solidAnswer =
  'The clinic budget and ransomware concern force the hybrid topology: NAS for fast restores, immutable cloud for blast-radius isolation. Cloud-only was rejected because multi-TB image restores miss the one-day RTO on their uplink.';

describe('infra design capstone ticket codes', () => {
  it('recognizes aliases and flagship eligibility', () => {
    expect(isInfraDesignCapstoneTicketType('infra_design_capstone')).toBe(true);
    expect(isInfraDesignCapstoneTicketType('architecture_decision')).toBe(true);
    expect(
      isInfraDesignCapstoneTicketType('sysadmin.infra_design_capstone')
    ).toBe(true);
    expect(isInfraDesignCapstoneTicketType('backup_dr_plan')).toBe(false);
    expect(isFlagshipEligibleTicketType('infra_design_capstone')).toBe(true);
    expect(isFlagshipEligibleTicketType('architecture_decision')).toBe(true);
    expect(isFlagshipEligibleTicketType('ao_review')).toBe(true);
    expect(isFlagshipEligibleTicketType('triage')).toBe(false);
  });
});

describe('extractInfraDesignDocument', () => {
  it('reads nested and flat shapes', () => {
    expect(extractInfraDesignDocument({ designDoc })).toMatchObject(designDoc);
    expect(
      extractInfraDesignDocument({
        title: designDoc.title,
        body: designDoc.body,
        topology_choice: designDoc.topologyChoice,
      })
    ).toMatchObject({
      title: designDoc.title,
      body: designDoc.body,
      topologyChoice: designDoc.topologyChoice,
    });
  });
});

describe('buildDeterministicInfraFollowUpQuestions', () => {
  it('returns 4–5 questions grounded in the design doc', () => {
    const questions = buildDeterministicInfraFollowUpQuestions(designDoc);
    expect(questions.length).toBeGreaterThanOrEqual(4);
    expect(questions.length).toBeLessThanOrEqual(5);
    expect(questions[0]?.prompt).toMatch(/Harbor Dental|3-2-1|topology/i);
  });
});

describe('evaluateInfraDesignCapstoneDeterministic', () => {
  it('rejects short design docs and missing questions', () => {
    const short = evaluateInfraDesignCapstoneDeterministic(
      {
        designDoc: {
          title: 'Short',
          body: 'Too short',
        },
      },
      ticket()
    );
    expect(short.ok).toBe(false);
    expect(short.structured.reason).toBe('design_doc_incomplete');
    expect(short.structured.minBodyLength).toBe(
      INFRA_DESIGN_DOC_MIN_BODY_LENGTH
    );

    const noQs = evaluateInfraDesignCapstoneDeterministic(
      { designDoc, answers: {} },
      ticket()
    );
    expect(noQs.ok).toBe(false);
    expect(noQs.structured.reason).toBe('questions_missing');
  });

  it('accepts complete design + answers', () => {
    const questions = buildDeterministicInfraFollowUpQuestions(designDoc);
    const result = evaluateInfraDesignCapstoneDeterministic(
      {
        designDoc,
        questions,
        answers: Object.fromEntries(questions.map((q) => [q.id, solidAnswer])),
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.flagshipEligible).toBe(true);
    expect(result.structured.minAnswerLength).toBe(
      INFRA_DESIGN_FOLLOWUP_MIN_ANSWER_LENGTH
    );
  });
});

describe('createInfraDesignCapstoneTicketScorer', () => {
  it('resolves when grading is satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValueOnce({
      finding_state: 'satisfied',
      feedback: 'Solid tradeoff analysis grounded in the design.',
      strengths: ['Compared NAS-only vs hybrid'],
      gaps: [],
    });

    const questions = buildDeterministicInfraFollowUpQuestions(designDoc);
    const scorer = createInfraDesignCapstoneTicketScorer();
    const result = await scorer.score(
      {
        designDoc,
        questions,
        answers: Object.fromEntries(questions.map((q) => [q.id, solidAnswer])),
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult.style).toBe('infra_design_capstone');
    expect(result.structuredResult.flagshipEligible).toBe(true);
    expect(result.feedback).toMatch(/PI-07/);
  });

  it('needs revision when grading is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValueOnce({
      finding_state: 'not_satisfied',
      feedback: 'Answers ignore stated budget constraints.',
      strengths: [],
      gaps: ['No alternative comparison'],
    });

    const questions = buildDeterministicInfraFollowUpQuestions(designDoc);
    const scorer = createInfraDesignCapstoneTicketScorer();
    const result = await scorer.score(
      {
        designDoc,
        questions,
        answers: Object.fromEntries(questions.map((q) => [q.id, solidAnswer])),
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
  });

  it('resolves with length checks when API key missing', async () => {
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValueOnce(
      new MissingAnthropicApiKeyError()
    );

    const questions = buildDeterministicInfraFollowUpQuestions(designDoc);
    const scorer = createInfraDesignCapstoneTicketScorer();
    const result = await scorer.score(
      {
        designDoc,
        questions,
        answers: Object.fromEntries(questions.map((q) => [q.id, solidAnswer])),
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult.reason).toBe(
      'rag_feedback_unavailable_missing_api_key'
    );
  });
});
