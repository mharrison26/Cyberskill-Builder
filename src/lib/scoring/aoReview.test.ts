import { describe, expect, it, vi } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  AO_REVIEW_MIN_ANSWER_LENGTH,
  createAoReviewTicketScorer,
  evaluateAoReviewDeterministic,
} from '@/lib/scoring/aoReview';
import type { CompiledAuthorizationPackage } from '@/lib/capstone/compilePackage';
import { GRC_TICKET_CODES } from '@/lib/capstone/ticketCodes';

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
    scenario_brief: 'AO review of residual risk.',
    initial_state: { ticketCode: 'GRC-11' },
    expected_state: {},
    dcwf_code: '612',
    sort_order: 95,
    ...overrides,
  };
}

const questions = [
  { id: 'q1', prompt: 'What residual risk are you asking the AO to accept?' },
  { id: 'q2', prompt: 'Which POA&M item most affects authorization?' },
  { id: 'q3', prompt: 'What compensating controls apply?' },
  { id: 'q4', prompt: 'How do SSP claims align with open weaknesses?' },
  { id: 'q5', prompt: 'What monitoring triggers reopen this decision?' },
];

const solidAnswer =
  'Residual risk remains moderate because privileged remote access still lacks MFA until the POA&M milestone completes; compensating VPN allow-listing and weekly access reviews keep exposure within tolerance with a 30-day revisit.';

function mockPackage(): CompiledAuthorizationPackage {
  return {
    trackId: 'tr1',
    studentId: 'stu1',
    complete: true,
    missingCodes: [],
    compiledAt: new Date().toISOString(),
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
        textCorpus: 'SSP control AC-2 implemented with MFA planned',
      },
      {
        code: GRC_TICKET_CODES.POAM,
        label: 'POAM',
        ticketTypes: ['poam'],
        status: 'present',
        ticketId: 'b',
        progressStatus: 'resolved',
        summary: 'POAM present',
        payload: { entries: [] },
        textCorpus: 'POA&M open MFA weakness',
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
  };
}

describe('evaluateAoReviewDeterministic', () => {
  it('rejects missing questions and short answers', () => {
    const missingQs = evaluateAoReviewDeterministic({ answers: {} });
    expect(missingQs.ok).toBe(false);
    expect(missingQs.structured.reason).toBe('questions_missing');

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
  });
});

describe('createAoReviewTicketScorer', () => {
  it('resolves when grading is satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValueOnce({
      finding_state: 'satisfied',
      feedback: 'Answers are grounded in the package.',
      strengths: ['Linked residual risk to POA&M'],
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
  });

  it('needs revision when grading is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValueOnce({
      finding_state: 'not_satisfied',
      feedback: 'Answers do not cite package evidence.',
      strengths: [],
      gaps: ['No POA&M linkage'],
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
  });
});
