import { describe, expect, it, vi } from 'vitest';

import { buildDeterministicAuditCommitteeQuestions } from '@/lib/grc/generateAuditCommitteeQuestions';
import { compileSeedPriorFindings } from '@/lib/grc/compilePriorFindings';
import { isAuditCommitteeBriefTicketType } from '@/lib/grc/ticketCodes';
import { isFlagshipEligibleTicketType } from '@/lib/helpdesk/ticketCodes';
import type { ScorableTicket } from '@/lib/scoring';
import {
  createAuditCommitteeBriefTicketScorer,
  evaluateAuditCommitteeBriefDeterministic,
  extractExecutiveSummary,
  AUDIT_COMMITTEE_BRIEF_MIN_SUMMARY_LENGTH,
} from '@/lib/scoring/auditCommitteeBrief';

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
    id: 't-ac-brief',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 3,
    ticket_type: 'audit_committee_brief',
    difficulty: 'high',
    sla_minutes: 60,
    scenario_brief:
      'AUD-07: Compile AUD-06 findings into an executive summary for the audit committee (flagship).',
    initial_state: {
      ticketCode: 'AUD-07',
      flagship: true,
      prior_findings: [
        {
          id: 'F-01',
          controlId: 'AC-2',
          title: 'Untimely access revocation',
          summary:
            '6 of 15 terminated users retained Okta access beyond the 5-day SLA. Root cause: HR tickets not routed to IAM within 24 hours.',
        },
        {
          id: 'F-02',
          controlId: 'CM-3',
          title: 'Unauthorized production changes',
          summary:
            '2 of 12 sampled changes lacked CAB approval before production deploy.',
        },
      ],
    },
    expected_state: {
      minSummaryLength: 200,
      questionMin: 4,
      questionMax: 5,
      flagshipOnResolve: true,
    },
    dcwf_code: '612',
    sort_order: 99,
    ...overrides,
  };
}

const solidSummary = `
HarborForge FY2026 ITGC testing identified two significant exceptions for the
audit committee. First, access revocation (AC-2) failed operating effectiveness:
6 of 15 terminated users retained Okta access beyond the 5-day SLA, driven by
HR termination tickets not routing to IAM within 24 hours. Residual risk is
unauthorized access to financial systems until automated deprovisioning ships.
Second, change management (CM-3) showed 2 of 12 production changes without CAB
approval. Management owns remediation: IAM for deprovisioning automation
(target 2026-09-30) and Infrastructure for CAB gate enforcement (target
2026-08-31), with weekly exception monitoring until closed.
`.trim();

describe('audit committee brief ticket codes', () => {
  it('recognizes aliases and flagship eligibility', () => {
    expect(isAuditCommitteeBriefTicketType('audit_committee_brief')).toBe(true);
    expect(isAuditCommitteeBriefTicketType('executive_summary_ac')).toBe(true);
    expect(isAuditCommitteeBriefTicketType('grc.audit_committee_brief')).toBe(
      true
    );
    expect(isAuditCommitteeBriefTicketType('ao_review')).toBe(false);
    expect(isFlagshipEligibleTicketType('audit_committee_brief')).toBe(true);
    expect(isFlagshipEligibleTicketType('executive_summary_ac')).toBe(true);
    expect(isFlagshipEligibleTicketType('triage')).toBe(false);
  });
});

describe('compileSeedPriorFindings', () => {
  it('loads seeded prior findings for standalone solve', () => {
    const pkg = compileSeedPriorFindings(ticket().initial_state);
    expect(pkg.source).toBe('seed');
    expect(pkg.findings).toHaveLength(2);
    expect(pkg.findings[0]?.id).toBe('F-01');
    expect(pkg.narrative).toMatch(/Untimely access revocation/);
  });
});

describe('extractExecutiveSummary', () => {
  it('reads executiveSummary and summary aliases', () => {
    expect(extractExecutiveSummary({ executiveSummary: solidSummary })).toBe(
      solidSummary
    );
    expect(extractExecutiveSummary({ summary: 'Short summary text' })).toBe(
      'Short summary text'
    );
  });
});

describe('buildDeterministicAuditCommitteeQuestions', () => {
  it('returns 4–5 questions grounded in the summary', () => {
    const questions = buildDeterministicAuditCommitteeQuestions({
      body: solidSummary,
    });
    expect(questions.length).toBeGreaterThanOrEqual(4);
    expect(questions.length).toBeLessThanOrEqual(5);
    expect(questions[0]?.prompt).toMatch(/root cause|executive summary/i);
    expect(questions.some((q) => q.focus === 'remediation-timeline')).toBe(
      true
    );
  });
});

describe('evaluateAuditCommitteeBriefDeterministic', () => {
  it('rejects short summaries and missing questions', () => {
    const short = evaluateAuditCommitteeBriefDeterministic(
      { executiveSummary: 'Too short' },
      ticket()
    );
    expect(short.ok).toBe(false);
    expect(short.structured.reason).toBe('summary_too_short');
    expect(short.structured.minSummaryLength).toBe(200);

    const noQs = evaluateAuditCommitteeBriefDeterministic(
      { executiveSummary: solidSummary, questions: [] },
      ticket()
    );
    expect(noQs.ok).toBe(false);
    expect(noQs.structured.reason).toBe('questions_missing');
  });

  it('accepts complete summary + 4–5 questions', () => {
    const questions = buildDeterministicAuditCommitteeQuestions({
      body: solidSummary,
    });
    const result = evaluateAuditCommitteeBriefDeterministic(
      { executiveSummary: solidSummary, questions },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.flagshipEligible).toBe(true);
    expect(result.structured.summaryLength).toBeGreaterThanOrEqual(
      AUDIT_COMMITTEE_BRIEF_MIN_SUMMARY_LENGTH
    );
    expect(result.structured.questionCount).toBeGreaterThanOrEqual(4);
    expect(result.structured.questionCount).toBeLessThanOrEqual(5);
  });
});

describe('createAuditCommitteeBriefTicketScorer', () => {
  it('resolves when grading is satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValueOnce({
      finding_state: 'satisfied',
      feedback: 'Clear committee brief with pointed AC questions.',
      strengths: ['Prioritized AC-2 and CM-3', 'Residual risk stated'],
      gaps: [],
    });

    const questions = buildDeterministicAuditCommitteeQuestions({
      body: solidSummary,
    });
    const scorer = createAuditCommitteeBriefTicketScorer();
    const result = await scorer.score(
      { executiveSummary: solidSummary, questions },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult.style).toBe('audit_committee_brief');
    expect(result.structuredResult.flagshipEligible).toBe(true);
    expect(result.feedback).toMatch(/AUD-07|flagship/i);
  });

  it('needs revision when grading is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValueOnce({
      finding_state: 'not_satisfied',
      feedback: 'Summary omits residual risk; questions are generic.',
      strengths: [],
      gaps: ['No residual risk', 'Generic questions'],
    });

    const questions = buildDeterministicAuditCommitteeQuestions({
      body: solidSummary,
    });
    const scorer = createAuditCommitteeBriefTicketScorer();
    const result = await scorer.score(
      { executiveSummary: solidSummary, questions },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toMatch(/residual risk|generic/i);
  });
});
