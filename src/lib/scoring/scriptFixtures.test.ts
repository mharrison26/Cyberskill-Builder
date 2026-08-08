import { afterEach, describe, expect, it, vi } from 'vitest';

import * as callClaudeGrading from '@/lib/grading/callClaudeGrading';
import {
  getTicketScorer,
  listRegisteredTicketTypes,
  type ScorableTicket,
} from '@/lib/scoring';
import {
  isScriptRemediationTicketType,
  scriptRemediationTicketScorer,
} from '@/lib/scoring/scriptRemediation';

/**
 * Fixture-based scripting_lab ticket: stale-login report.
 * Primary gate = per-fixture file_equals; RAG clarity is advisory only.
 */

const FIXTURE_RULES = [
  {
    id: 'fixture_01_mixed',
    type: 'file_equals' as const,
    path: 'fixtures/01_mixed/stale-users.txt',
    content: 'bob\ndave\neve\n',
  },
  {
    id: 'fixture_02_boundary',
    type: 'file_equals' as const,
    path: 'fixtures/02_boundary/stale-users.txt',
    content: 'stale90\nstale91\n',
  },
  {
    id: 'fixture_03_none_stale',
    type: 'file_equals' as const,
    path: 'fixtures/03_none_stale/stale-users.txt',
    content: '',
  },
];

const goodScript = `#!/usr/bin/env bash
# Report users inactive 90+ days from last-login logs (as-of lab/AS_OF).
set -euo pipefail
AS_OF="$(tr -d '[:space:]' < lab/AS_OF)"
for log in fixtures/*/last-login.log; do
  dir="$(dirname "$log")"
  : > "$dir/stale-users.txt"
  # Production script would compute dates; tests submit expected outputs.
  echo "Processed $log as-of $AS_OF"
done
`;

const allFixtureOutputs = {
  'report-stale-users.sh': goodScript,
  'lab/AS_OF': '2026-08-08\n',
  'fixtures/01_mixed/stale-users.txt': 'bob\ndave\neve\n',
  'fixtures/02_boundary/stale-users.txt': 'stale90\nstale91\n',
  'fixtures/03_none_stale/stale-users.txt': '',
};

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-script-fixtures',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'scripting_lab',
    difficulty: 'medium',
    sla_minutes: 30,
    scenario_brief:
      'Stale logins: Report users inactive 90+ days from mock last-login logs',
    initial_state: {},
    expected_state: {
      minScriptChars: 60,
      passThresholdPercent: 100,
      guidanceTopics: [
        'clarity-ops',
        'idempotent-verify',
        'targeted-fix',
        'side-effects',
      ],
      rules: FIXTURE_RULES,
    },
    dcwf_code: null,
    sort_order: 26,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('scripting_lab / script_fixtures aliases', () => {
  it('recognizes scripting_lab and script_fixtures', () => {
    expect(isScriptRemediationTicketType('scripting_lab')).toBe(true);
    expect(isScriptRemediationTicketType('script_fixtures')).toBe(true);
    expect(isScriptRemediationTicketType('helpdesk.scripting_lab')).toBe(true);
  });

  it('registers scorers for scripting_lab aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('scripting_lab');
    expect(registered).toContain('script_fixtures');
    expect(getTicketScorer('scripting_lab')).toBe(
      scriptRemediationTicketScorer
    );
    expect(getTicketScorer('script_fixtures')).toBe(
      scriptRemediationTicketScorer
    );
  });
});

describe('scripting_lab fixture scoring', () => {
  it('resolves when all fixtures pass', async () => {
    vi.spyOn(callClaudeGrading, 'callClaudeGrading').mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Script header and loop over fixtures are clear for another operator.',
      strengths: ['Readable paths', 'Explicit as-of'],
      gaps: [],
    });

    const result = await scriptRemediationTicketScorer.score(
      { files: allFixtureOutputs },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'script_remediation',
      scriptOk: true,
      scriptPath: 'report-stale-users.sh',
      config: {
        passedCount: 3,
        totalCount: 3,
        percentage: 100,
      },
      grading: { finding_state: 'satisfied' },
    });
    expect(result.feedback).toContain('Script quality feedback');
  });

  it('fails when one fixture output is wrong', async () => {
    const result = await scriptRemediationTicketScorer.score(
      {
        files: {
          ...allFixtureOutputs,
          // Boundary fixture wrong: omitted stale90
          'fixtures/02_boundary/stale-users.txt': 'stale91\n',
        },
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    const structured = result.structuredResult as {
      config: {
        passedCount: number;
        totalCount: number;
        rules: Array<{ id: string; passed: boolean }>;
      };
    };
    expect(structured.config.passedCount).toBe(2);
    expect(structured.config.totalCount).toBe(3);
    expect(
      structured.config.rules.find((r) => r.id === 'fixture_02_boundary')
        ?.passed
    ).toBe(false);
    expect(
      structured.config.rules.find((r) => r.id === 'fixture_01_mixed')?.passed
    ).toBe(true);
  });

  it('still resolves when RAG fails after all fixtures pass', async () => {
    vi.spyOn(callClaudeGrading, 'callClaudeGrading').mockRejectedValue(
      new callClaudeGrading.MissingAnthropicApiKeyError()
    );

    const result = await scriptRemediationTicketScorer.score(
      { files: allFixtureOutputs },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      reason: 'rag_feedback_unavailable_missing_api_key',
      config: { percentage: 100 },
    });
    expect(result.feedback).toMatch(/ANTHROPIC_API_KEY/i);
  });

  it('RAG unsatisfied finding does not flip pass to fail', async () => {
    vi.spyOn(callClaudeGrading, 'callClaudeGrading').mockResolvedValue({
      finding_state: 'not_satisfied',
      feedback: 'Add clearer comments and error handling for empty logs.',
      strengths: ['Correct outputs'],
      gaps: ['Limited operator guidance'],
    });

    const result = await scriptRemediationTicketScorer.score(
      { files: allFixtureOutputs },
      ticket({ ticket_type: 'script_fixtures' })
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      grading: { finding_state: 'not_satisfied' },
      config: { percentage: 100 },
    });
    expect(result.feedback).toContain('Script quality feedback');
  });
});
