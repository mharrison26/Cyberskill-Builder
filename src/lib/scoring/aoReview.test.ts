import { describe, expect, it, vi } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  AO_REVIEW_MIN_ANSWER_LENGTH,
  createAoReviewTicketScorer,
  evaluateAoReviewDeterministic,
} from '@/lib/scoring/aoReview';
import type { CompiledAuthorizationPackage } from '@/lib/capstone/compilePackage';
import {
  GRC_TICKET_CODES,
  ISSO_TICKET_CODES,
  isAoReviewTicketCode,
  isAuthorizationPackageTicketCode,
} from '@/lib/capstone/ticketCodes';
import { isFlagshipEligibleTicketType } from '@/lib/helpdesk/ticketCodes';
import { buildAoReviewGradingPrompt } from '@/lib/grading/buildAoReviewGradingPrompt';

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
    id: 't-ao',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 3,
    ticket_type: 'ao_review',
    difficulty: 'high',
    sla_minutes: 90,
    scenario_brief:
      'ISSO-05: Defend residual risk acceptance and POA&M adequacy (flagship)',
    initial_state: {
      ticketCode: ISSO_TICKET_CODES.AO_REVIEW,
      flagship: true,
    },
    expected_state: { flagshipOnResolve: true, minAnswerLength: 40 },
    dcwf_code: '612',
    sort_order: 95,
    ...overrides,
  };
}

const questions = [
  {
    id: 'q1',
    prompt:
      'What residual risk from the privileged MFA gap are you asking the AO to accept?',
    focus: 'residual-risk',
  },
  {
    id: 'q2',
    prompt:
      'Is the POA&M milestone and 2026-09-15 date for FIND-AC2-01 adequate, or should risk be formally accepted?',
    focus: 'poam-adequacy',
  },
  {
    id: 'q3',
    prompt: 'What compensating controls apply until MFA is enforced?',
    focus: 'compensating-controls',
  },
  {
    id: 'q4',
    prompt: 'How do SSP AC-2 claims align with open POA&M weaknesses?',
    focus: 'ssp-poam',
  },
  {
    id: 'q5',
    prompt: 'What monitoring triggers reopen this residual-risk decision?',
    focus: 'monitoring',
  },
];

const solidAnswer =
  'Residual risk remains moderate because privileged remote access still lacks MFA until the POA&M milestone completes; compensating VPN allow-listing and weekly access reviews keep exposure within tolerance with a 30-day revisit.';

function mockPackage(
  overrides: Partial<CompiledAuthorizationPackage> = {}
): CompiledAuthorizationPackage {
  return {
    trackId: 'tr1',
    studentId: 'stu1',
    complete: true,
    missingCodes: [],
    compiledAt: new Date().toISOString(),
    packageSource: 'prior_submission',
    artifacts: [
      {
        code: GRC_TICKET_CODES.SSP,
        label: 'SSP',
        ticketTypes: ['oscal_ssp'],
        status: 'present',
        ticketId: 'a',
        progressStatus: 'resolved',
        summary: 'SSP present',
        payload: { ssp: true },
        textCorpus:
          'SSP control AC-2 implemented with MFA planned; privileged remote admin gap',
      },
      {
        code: GRC_TICKET_CODES.POAM,
        label: 'POAM',
        ticketTypes: ['poam'],
        status: 'present',
        ticketId: 'b',
        progressStatus: 'resolved',
        summary: 'POAM present',
        payload: {
          poamItems: [
            {
              finding_id: 'FIND-AC2-01',
              weakness_description:
                'Privileged accounts lack MFA on the remote admin path.',
              scheduled_completion_date: '2026-09-15',
              status: 'open',
            },
          ],
        },
        textCorpus: 'POA&M open MFA weakness FIND-AC2-01 due 2026-09-15',
      },
      {
        code: GRC_TICKET_CODES.OSCAL_GENERATOR,
        label: 'OSCAL',
        ticketTypes: ['oscal_generator'],
        status: 'present',
        ticketId: 'c',
        progressStatus: 'resolved',
        summary: 'OSCAL present',
        payload: { files: { 'output/ssp.json': '{}' } },
        textCorpus: 'Generated OSCAL SSP document',
      },
    ],
    ...overrides,
  };
}

describe('ISSO / GRC AO flagship codes', () => {
  it('recognizes ISSO-04/05 aliases and flagship eligibility', () => {
    expect(isAuthorizationPackageTicketCode('ISSO-04')).toBe(true);
    expect(isAuthorizationPackageTicketCode('GRC-10')).toBe(true);
    expect(isAoReviewTicketCode('ISSO-05')).toBe(true);
    expect(isAoReviewTicketCode('GRC-11')).toBe(true);
    expect(isFlagshipEligibleTicketType('ao_review')).toBe(true);
  });
});

describe('evaluateAoReviewDeterministic', () => {
  it('rejects missing questions and short answers', () => {
    const missingQs = evaluateAoReviewDeterministic({ answers: {} });
    expect(missingQs.ok).toBe(false);
    expect(missingQs.structured.reason).toBe('questions_missing');
    expect(missingQs.structured.flagshipEligible).toBe(true);

    const short = evaluateAoReviewDeterministic({
      questions,
      answers: Object.fromEntries(questions.map((q) => [q.id, 'too short'])),
    });
    expect(short.ok).toBe(false);
    expect(short.structured.shortAnswerIds.length).toBe(questions.length);
    expect(short.structured.minAnswerLength).toBe(AO_REVIEW_MIN_ANSWER_LENGTH);
  });

  it('accepts complete answers', () => {
    const result = evaluateAoReviewDeterministic({
      questions,
      answers: Object.fromEntries(questions.map((q) => [q.id, solidAnswer])),
    });
    expect(result.ok).toBe(true);
    expect(result.structured.flagshipEligible).toBe(true);
  });
});

describe('buildAoReviewGradingPrompt', () => {
  it('requires answers to directly address the specific risk raised', () => {
    const prompt = buildAoReviewGradingPrompt(
      {
        document: 'risk-acceptance',
        title: 'AO guidance',
        sourceUrl: 'https://example.test/risk-acceptance',
        catalogPath: 'data/nist/risk-acceptance-guidance.json',
        sections: [],
      },
      {
        questions,
        answers: Object.fromEntries(questions.map((q) => [q.id, solidAnswer])),
        packageExcerpts: '### ssp\nPrivileged MFA gap',
      }
    );

    expect(prompt).toMatch(/DIRECTLY addresses/i);
    expect(prompt).toMatch(/POA&M/i);
    expect(prompt).toMatch(/generic/i);
  });
});

describe('createAoReviewTicketScorer', () => {
  it('resolves when grading is satisfied and marks flagship feedback', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValueOnce({
      finding_state: 'satisfied',
      feedback: 'Answers directly address residual risk and POA&M adequacy.',
      strengths: ['Linked residual risk to FIND-AC2-01'],
      gaps: [],
    });

    const scorer = createAoReviewTicketScorer(async () => mockPackage());
    const result = await scorer.score(
      {
        questions,
        answers: Object.fromEntries(questions.map((q) => [q.id, solidAnswer])),
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult.style).toBe('ao_review');
    expect(result.structuredResult.flagshipEligible).toBe(true);
    expect(result.structuredResult.packageSource).toBe('prior_submission');
    expect(result.feedback).toMatch(/ISSO-05|flagship/i);
    expect(callClaudeGrading).toHaveBeenCalled();
  });

  it('needs revision when answers do not address the specific risk', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValueOnce({
      finding_state: 'not_satisfied',
      feedback:
        'Answers are generic and do not address the privileged MFA residual risk in q1.',
      strengths: [],
      gaps: ['q1 off-topic', 'No POA&M linkage'],
    });

    const scorer = createAoReviewTicketScorer(async () => mockPackage());
    const result = await scorer.score(
      {
        questions,
        answers: Object.fromEntries(questions.map((q) => [q.id, solidAnswer])),
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toMatch(/generic|MFA|POA&M/i);
  });

  it('scores against seeded package when live ISSO-04 work is absent', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValueOnce({
      finding_state: 'satisfied',
      feedback: 'Seeded-package answers are grounded.',
      strengths: ['Cited FIND-AC2-01'],
      gaps: [],
    });

    const scorer = createAoReviewTicketScorer(async () =>
      mockPackage({ packageSource: 'seed', complete: true })
    );
    const result = await scorer.score(
      {
        questions,
        answers: Object.fromEntries(questions.map((q) => [q.id, solidAnswer])),
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult.packageSource).toBe('seed');
    expect(result.structuredResult.flagshipEligible).toBe(true);
  });
});
