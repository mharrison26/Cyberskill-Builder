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

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-script',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'script_remediation',
    difficulty: 'medium',
    sla_minutes: 30,
    scenario_brief: 'Clear stuck print spooler jobs and restart the service.',
    initial_state: {},
    expected_state: {
      scriptPath: 'fix-spooler.sh',
      minScriptChars: 40,
      rules: [
        {
          id: 'job_cleared',
          type: 'file_absent',
          path: 'var/spool/cups/c00001',
        },
        {
          id: 'service_running',
          type: 'file_contains',
          path: 'status/cupsd.state',
          pattern: 'state=running',
        },
        {
          id: 'config_preserved',
          type: 'file_contains',
          path: 'etc/cups/cupsd.conf',
          pattern: 'LogLevel',
        },
      ],
    },
    dcwf_code: null,
    sort_order: 1,
    ...overrides,
  };
}

const goodScript = `#!/usr/bin/env bash
# Clear stuck CUPS jobs and restart the print service.
set -euo pipefail
rm -f var/spool/cups/c00001 var/spool/cups/d00001-001
printf 'state=running\\npid=1001\\n' > status/cupsd.state
echo "Spooler cleared and cupsd marked running"
`;

const fixedFiles = {
  'fix-spooler.sh': goodScript,
  'status/cupsd.state': 'state=running\npid=1001\n',
  'etc/cups/cupsd.conf': 'LogLevel warn\n',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isScriptRemediationTicketType', () => {
  it('recognizes aliases', () => {
    expect(isScriptRemediationTicketType('script_remediation')).toBe(true);
    expect(isScriptRemediationTicketType('spooler_fix')).toBe(true);
    expect(isScriptRemediationTicketType('sandbox_script')).toBe(true);
    expect(isScriptRemediationTicketType('service_restart')).toBe(true);
    expect(isScriptRemediationTicketType('scripting_lab')).toBe(true);
    expect(isScriptRemediationTicketType('script_fixtures')).toBe(true);
    expect(isScriptRemediationTicketType('helpdesk.script_remediation')).toBe(
      true
    );
    expect(isScriptRemediationTicketType('network_diagnostics')).toBe(false);
  });
});

describe('scriptRemediationTicketScorer', () => {
  it('registers script_remediation aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('script_remediation');
    expect(registered).toContain('spooler_fix');
    expect(registered).toContain('sandbox_script');
    expect(registered).toContain('service_restart');
    expect(registered).toContain('scripting_lab');
    expect(registered).toContain('script_fixtures');
    expect(getTicketScorer('script_remediation')).toBe(
      scriptRemediationTicketScorer
    );
  });

  it('needs revision when config-diff rules fail', async () => {
    const result = await scriptRemediationTicketScorer.score(
      {
        files: {
          'fix-spooler.sh': goodScript,
          'var/spool/cups/c00001': 'stuck',
          'status/cupsd.state': 'state=stuck\n',
          'etc/cups/cupsd.conf': 'LogLevel warn\n',
        },
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      style: 'script_remediation',
      scriptOk: true,
    });
    expect(
      (result.structuredResult as { config: { percentage: number } }).config
        .percentage
    ).toBeLessThan(100);
  });

  it('needs revision when state is fixed but script is missing', async () => {
    const result = await scriptRemediationTicketScorer.score(
      {
        files: {
          'status/cupsd.state': 'state=running\npid=1001\n',
          'etc/cups/cupsd.conf': 'LogLevel warn\n',
        },
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      reason: 'missing_script',
      scriptOk: false,
      scriptPath: 'fix-spooler.sh',
    });
    expect(result.feedback).toMatch(/No Bash|remediation script/i);
  });

  it('resolves on config-diff + script and attaches RAG quality feedback', async () => {
    vi.spyOn(callClaudeGrading, 'callClaudeGrading').mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Script clears stuck jobs narrowly and preserves cupsd.conf; verification echo is clear.',
      strengths: ['Targeted spool clear', 'Config preserved'],
      gaps: [],
    });

    const result = await scriptRemediationTicketScorer.score(
      { files: fixedFiles },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'script_remediation',
      scriptOk: true,
      scriptPath: 'fix-spooler.sh',
      retrievedSectionIds: expect.arrayContaining([
        'targeted-fix',
        'side-effects',
      ]),
      grading: { finding_state: 'satisfied' },
    });
    expect(result.feedback).toContain('Script quality feedback');
    expect(result.feedback).toContain('configuration checks');
  });

  it('still resolves when RAG is unavailable after state + script pass', async () => {
    vi.spyOn(callClaudeGrading, 'callClaudeGrading').mockRejectedValue(
      new callClaudeGrading.MissingAnthropicApiKeyError()
    );

    const result = await scriptRemediationTicketScorer.score(
      { files: fixedFiles },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      reason: 'rag_feedback_unavailable_missing_api_key',
    });
    expect(result.feedback).toMatch(/ANTHROPIC_API_KEY/i);
  });
});
