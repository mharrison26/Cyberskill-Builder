import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  POLICY_SECTION_DRAFT_MIN_LENGTH,
  evaluatePolicySectionDraftDeterministic,
  extractPolicySectionDraftSubmission,
  findPolicyThemes,
  policySectionDraftTicketScorer,
} from '@/lib/scoring/policySectionDraft';
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
    id: 't-policy-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'policy_section_draft',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief:
      'PolicyDraft: Write an Acceptable Use section for Cedarlane Health Analytics',
    initial_state: {
      prompt:
        'Draft the Acceptable Use policy section for Cedarlane. Cover scope, enforceable rules, and exceptions.',
      organization: {
        name: 'Cedarlane Health Analytics',
        industry: 'Healthcare analytics SaaS',
        size: '180 employees',
        systems: ['Microsoft 365', 'Okta SSO', 'AWS prod', 'Snowflake'],
        constraints:
          'HIPAA-adjacent PHI handling; remote-first workforce; limited GRC staff.',
      },
      requirement:
        'Workforce members must use company systems only for authorized business purposes, protect credentials, report suspected misuse promptly, and obtain documented approval for any temporary exception.',
      sectionTitle: 'Acceptable Use',
      sectionId: 'acceptable_use',
      minDraftLength: 400,
    },
    expected_state: {
      minDraftLength: 400,
      requiredThemes: ['scope', 'enforceable_language', 'exceptions_process'],
      guidanceTopics: [
        'clear-scope',
        'enforceable-language',
        'exceptions-process',
        'draft-completeness',
      ],
      topKGuidanceSections: 5,
      passThresholdPercent: 100,
    },
    dcwf_code: '612',
    sort_order: 1,
    ...overrides,
  };
}

const solidDraft = `Acceptable Use — Cedarlane Health Analytics

1. Scope
This policy applies to all employees, contractors, and temporary workers who use Cedarlane systems, including Microsoft 365 email and collaboration tools, Okta SSO applications, AWS production consoles, and Snowflake analytics workspaces. Personal devices used for Cedarlane work under the remote-first BYOD allowance are in scope when accessing corporate accounts.

2. Authorized use and prohibitions
Users must use company systems only for authorized business purposes related to healthcare analytics delivery. Users must protect Okta credentials and must not share passwords or MFA codes. Users shall not upload PHI to unsanctioned SaaS tools. The following are prohibited: unauthorized software installation on managed endpoints, attempts to bypass security controls, and use of corporate email for illegal or harassing content. Users must report suspected phishing or misuse to security@cedarlane.example within one business day.

3. Exceptions
Anyone needing a temporary exception (for example a time-bound SaaS tool for a customer engagement) must submit an exception request to the Security Lead with manager endorsement. The request must describe the business need, systems affected, compensating controls, and requested end date. Exceptions are time-bound and expire unless re-approved in writing before the end date.`;

const solidSubmission = {
  type: 'policy_section_draft',
  draft: solidDraft,
  sectionTitle: 'Acceptable Use',
};

describe('policySectionDraft scorer shape', () => {
  it('registers policy_section_draft and aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('policy_section_draft');
    expect(registered).toContain('policy_draft');
    expect(registered).toContain('draft_policy_section');
    expect(getTicketScorer('policy_section_draft')).toBeTruthy();
    expect(getTicketScorer('policy_draft')).toBe(
      getTicketScorer('policy_section_draft')
    );
    expect(getTicketScorer('draft_policy_section')).toBe(
      getTicketScorer('policy_section_draft')
    );
  });

  it('extracts draft from camelCase and snake_case fields', () => {
    expect(extractPolicySectionDraftSubmission(solidSubmission)).toMatchObject({
      draft: solidDraft,
      sectionTitle: 'Acceptable Use',
    });

    const snake = extractPolicySectionDraftSubmission({
      policy_draft: solidDraft,
      section_title: 'Acceptable Use',
    });
    expect(snake?.draft).toBe(solidDraft);
    expect(snake?.sectionTitle).toBe('Acceptable Use');
  });

  it('finds theme synonyms without requiring literal theme ids', () => {
    const { found, missing } = findPolicyThemes(solidDraft, [
      'scope',
      'enforceable_language',
      'exceptions_process',
    ]);
    expect(found).toEqual([
      'scope',
      'enforceable_language',
      'exceptions_process',
    ]);
    expect(missing).toEqual([]);
  });

  it('fails when draft is missing', () => {
    const missing = evaluatePolicySectionDraftDeterministic({}, ticket());
    expect(missing.ok).toBe(false);
    expect(missing.structured.style).toBe('policy_section_draft');
    expect(missing.structured.reason).toBe('missing_fields');
    expect(missing.feedback).toMatch(/draft/i);
  });

  it('fails when draft is too short', () => {
    const short = evaluatePolicySectionDraftDeterministic(
      {
        type: 'policy_section_draft',
        draft:
          'Users must follow the rules. Exceptions need approval. Scope covers employees.',
      },
      ticket()
    );
    expect(short.ok).toBe(false);
    expect(short.structured.reason).toBe('draft_too_short');
    expect(short.structured.minDraftLength).toBe(
      POLICY_SECTION_DRAFT_MIN_LENGTH
    );
    expect(short.feedback).toMatch(/400/);
  });

  it('fails when required themes are absent even if long enough', () => {
    const filler = `${'x'.repeat(420)} This long text never mentions policy duties.`;
    const result = evaluatePolicySectionDraftDeterministic(
      { draft: filler },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_themes');
    expect(result.structured.themesMissing.length).toBeGreaterThan(0);
  });

  it('passes deterministic gates with complete draft', () => {
    const result = evaluatePolicySectionDraftDeterministic(
      solidSubmission,
      ticket()
    );

    expect(result.ok).toBe(true);
    expect(result.structured).toMatchObject({
      style: 'policy_section_draft',
      draftLengthOk: true,
      themesOk: true,
      themeCoveragePercent: 100,
      sectionTitle: 'Acceptable Use',
      guidancePath: null,
    });
    expect(result.structured.draftLength).toBeGreaterThanOrEqual(
      POLICY_SECTION_DRAFT_MIN_LENGTH
    );
  });

  it('resolves section title from initial_state when omitted', () => {
    const result = evaluatePolicySectionDraftDeterministic(
      { draft: solidDraft },
      ticket()
    );
    expect(result.ok).toBe(true);
    expect(result.parsed?.sectionTitle).toBe('Acceptable Use');
  });
});

describe('policySectionDraftTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  it('returns needs_revision before calling the grader when gates fail', async () => {
    const result = await policySectionDraftTicketScorer.score({}, ticket());
    expect(result.status).toBe('needs_revision');
    expect(callClaudeGrading).not.toHaveBeenCalled();
  });

  it('resolves when RAG grading is satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Solid Acceptable Use section with clear scope, enforceable rules, and a time-bound exceptions path.',
      strengths: [
        'Named systems in scope',
        'Must/shall prohibitions',
        'Security Lead exception approval',
      ],
      gaps: [],
    });

    const result = await policySectionDraftTicketScorer.score(
      solidSubmission,
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(callClaudeGrading).toHaveBeenCalledOnce();
    expect(result.structuredResult).toMatchObject({
      style: 'policy_section_draft',
      draftLengthOk: true,
      themesOk: true,
      grading: { finding_state: 'satisfied' },
    });
    expect(
      (result.structuredResult as { retrievedSectionIds?: string[] })
        .retrievedSectionIds?.length
    ).toBeGreaterThan(0);
  });

  it('needs_revision when grader is not satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'not_satisfied',
      feedback: 'Exceptions process lacks an approver and expiration.',
      strengths: ['Mentions scope'],
      gaps: ['No approver role', 'No time bound on exceptions'],
    });

    const result = await policySectionDraftTicketScorer.score(
      solidSubmission,
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toMatch(/Gaps:/i);
    expect(result.structuredResult).toMatchObject({
      reason: 'grading_not_satisfied',
    });
  });
});
