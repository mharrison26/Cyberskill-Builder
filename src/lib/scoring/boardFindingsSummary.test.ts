import { describe, expect, it, vi } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import { getTicketScorer, listRegisteredTicketTypes } from '@/lib/scoring';
import {
  BOARD_FINDINGS_SUMMARY_MAX_LENGTH,
  BOARD_FINDINGS_SUMMARY_MIN_LENGTH,
  createBoardFindingsSummaryTicketScorer,
  evaluateBoardFindingsSummaryDeterministic,
  extractBoardFindingsSummarySubmission,
  formatTechnicalFindingsNarrative,
  isBoardFindingsSummaryTicketType,
  parseBoardFindingsSummaryExpectedState,
} from '@/lib/scoring/boardFindingsSummary';

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

const FINDINGS = [
  {
    id: 'f1',
    technicalTitle: 'AC-2 / AC-6 — privileged account review SLA exceeded',
    technicalDetail:
      'Quarterly privileged access review for HarborForge finance admins exceeded the 30-day SLA; 14 accounts lacked manager attestation.',
    source: 'ITGC / ISSO continuous monitoring',
  },
  {
    id: 'f2',
    technicalTitle:
      'POA&M HF-2025-014 — patch latency on internet-facing hosts >90 days',
    technicalDetail:
      'Internet-facing hosts remain beyond 90-day patch SLA for high CVEs tied to the edge tier.',
    source: 'POA&M register',
  },
  {
    id: 'f3',
    technicalTitle: 'AU-2/AU-6 — incomplete logging on payment API tier',
    technicalDetail:
      'Payment API tier is missing authenticated request and admin-action logs needed for fraud investigation.',
    source: 'Security assessment',
  },
  {
    id: 'f4',
    technicalTitle:
      'Vendor SCRM — production ETL vendor with high access criticality, residual high',
    technicalDetail:
      'Production ETL vendor retains broad data-plane access; residual risk rated high after compensating controls.',
    source: 'Third-party risk review',
  },
];

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-board-findings',
    tenant_id: 'ten1',
    track_id: 'tr-issm',
    tier: 2,
    ticket_type: 'board_findings_summary',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      'Board findings summary: translate HarborForge technical GRC/ISSO findings into a one-page board brief.',
    initial_state: {
      prompt:
        'Translate the technical findings below into a one-page board-level summary.',
      audience: 'Board of Directors / Audit Committee',
      organization: {
        name: 'HarborForge',
        context: 'Mid-market manufacturer with internet-facing commerce APIs.',
      },
      findings: FINDINGS,
      askOptions: ['budget', 'decision', 'awareness'],
      minSummaryLength: 350,
      maxSummaryLength: 900,
    },
    expected_state: {
      minSummaryLength: 350,
      maxSummaryLength: 900,
      requireAskType: true,
      acceptableAskTypes: ['budget', 'decision', 'awareness'],
      guidanceTopics: [
        'plain-language',
        'business-impact',
        'clear-ask',
        'avoid-control-dump',
      ],
      requiredThemes: ['plain_language', 'business_impact', 'clear_ask'],
    },
    dcwf_code: '722',
    sort_order: 50,
    ...overrides,
  };
}

const solidSummary = `
HarborForge's board should understand four cyber issues that affect finance
integrity, customer trust, and vendor concentration. Privileged finance admin
accounts were not reviewed on time, leaving lingering access that could enable
unauthorized changes. Internet-facing systems remain unpatched beyond our
90-day standard, extending the window for external compromise. Payment API
logging gaps limit fraud investigation. A production ETL vendor still has
high-criticality access with high residual risk. Until remediated, residual
risk includes unauthorized access, edge exposure, weak forensics, and vendor
disruption. We ask the board to approve budget for privileged-access
automation, accelerated patching, payment logging, and vendor access redesign.
`.trim();

describe('board findings summary ticket types', () => {
  it('recognizes aliases and registers scorers', () => {
    expect(isBoardFindingsSummaryTicketType('board_findings_summary')).toBe(
      true
    );
    expect(isBoardFindingsSummaryTicketType('board_level_summary')).toBe(true);
    expect(isBoardFindingsSummaryTicketType('technical_to_board_brief')).toBe(
      true
    );
    expect(isBoardFindingsSummaryTicketType('audit_committee_brief')).toBe(
      false
    );
    expect(listRegisteredTicketTypes()).toEqual(
      expect.arrayContaining([
        'board_findings_summary',
        'board_level_summary',
        'technical_to_board_brief',
      ])
    );
    expect(getTicketScorer('board_findings_summary')).toBeTruthy();
  });
});

describe('parseBoardFindingsSummaryExpectedState', () => {
  it('reads length gates and ask types', () => {
    const expected = parseBoardFindingsSummaryExpectedState(
      ticket().expected_state
    );
    expect(expected.minSummaryLength).toBe(350);
    expect(expected.maxSummaryLength).toBe(900);
    expect(expected.acceptableAskTypes).toEqual([
      'budget',
      'decision',
      'awareness',
    ]);
    expect(expected.requiredThemes).toContain('plain_language');
  });
});

describe('formatTechnicalFindingsNarrative', () => {
  it('formats seeded technical findings', () => {
    const narrative = formatTechnicalFindingsNarrative(ticket().initial_state);
    expect(narrative).toMatch(/AC-2 \/ AC-6/);
    expect(narrative).toMatch(/POA&M HF-2025-014/);
    expect(narrative).toMatch(/Source: Third-party risk review/);
  });
});

describe('extractBoardFindingsSummarySubmission', () => {
  it('reads summary and askType aliases', () => {
    const parsed = extractBoardFindingsSummarySubmission({
      board_summary: solidSummary,
      ask_type: 'Budget',
      ask_statement: 'Approve FY26Q3 cyber remediation funding.',
    });
    expect(parsed?.askType).toBe('budget');
    expect(parsed?.summary).toBe(solidSummary);
    expect(parsed?.askStatement).toMatch(/Approve FY26Q3/);
  });
});

describe('evaluateBoardFindingsSummaryDeterministic', () => {
  it('rejects short, long, and missing ask submissions', () => {
    const short = evaluateBoardFindingsSummaryDeterministic(
      { summary: 'Too short', askType: 'budget' },
      ticket()
    );
    expect(short.ok).toBe(false);
    expect(short.structured.reason).toBe('summary_too_short');
    expect(short.structured.minSummaryLength).toBe(
      BOARD_FINDINGS_SUMMARY_MIN_LENGTH
    );

    const longSummary = `${solidSummary}\n${'x'.repeat(900)}`;
    const long = evaluateBoardFindingsSummaryDeterministic(
      { summary: longSummary, askType: 'decision' },
      ticket()
    );
    expect(long.ok).toBe(false);
    expect(long.structured.reason).toBe('summary_too_long');
    expect(long.structured.maxSummaryLength).toBe(
      BOARD_FINDINGS_SUMMARY_MAX_LENGTH
    );

    const missingAsk = evaluateBoardFindingsSummaryDeterministic(
      { summary: solidSummary },
      ticket()
    );
    expect(missingAsk.ok).toBe(false);
    expect(missingAsk.structured.reason).toBe('missing_fields');
  });

  it('accepts in-range summary with valid ask type', () => {
    const result = evaluateBoardFindingsSummaryDeterministic(
      {
        type: 'board_findings_summary',
        summary: solidSummary,
        askType: 'budget',
        askStatement:
          'Approve remediation budget for privileged access and patching.',
      },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.structured.summaryLengthOk).toBe(true);
    expect(result.structured.askTypeOk).toBe(true);
    expect(result.structured.askType).toBe('budget');
  });
});

describe('createBoardFindingsSummaryTicketScorer', () => {
  it('resolves when grading is satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValueOnce({
      finding_state: 'satisfied',
      feedback:
        'Clear board brief with plain language, impact, and budget ask.',
      strengths: ['Translated privileged access jargon', 'Concrete budget ask'],
      gaps: [],
    });

    const scorer = createBoardFindingsSummaryTicketScorer();
    const result = await scorer.score(
      {
        type: 'board_findings_summary',
        summary: solidSummary,
        askType: 'budget',
      },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult.style).toBe('board_findings_summary');
    expect(result.structuredResult.grading).toMatchObject({
      finding_state: 'satisfied',
    });
    expect(callClaudeGrading).toHaveBeenCalled();
  });

  it('needs revision when grading is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValueOnce({
      finding_state: 'not_satisfied',
      feedback: 'Still dumps control IDs without business impact.',
      strengths: [],
      gaps: ['Jargon without translation', 'No clear ask'],
    });

    const scorer = createBoardFindingsSummaryTicketScorer();
    const result = await scorer.score(
      {
        summary: solidSummary,
        askType: 'awareness',
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toMatch(/control IDs|Gaps:/i);
  });

  it('needs revision when API key is missing', async () => {
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValueOnce(
      new MissingAnthropicApiKeyError()
    );

    const scorer = createBoardFindingsSummaryTicketScorer();
    const result = await scorer.score(
      {
        summary: solidSummary,
        askType: 'decision',
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult.reason).toBe(
      'grading_unavailable_missing_api_key'
    );
    expect(result.feedback).toMatch(/ANTHROPIC_API_KEY/);
  });
});
