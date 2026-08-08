import { describe, expect, it } from 'vitest';

import {
  deterministicFeedback,
  evaluateConfigDiff,
} from '@/lib/scoring/configDiff';
import type { ScorableTicket } from '@/lib/scoring';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 1,
    ticket_type: 'config_remediation',
    difficulty: 'medium',
    sla_minutes: 30,
    scenario_brief: 'Harden sshd.',
    initial_state: {},
    expected_state: {},
    dcwf_code: null,
    sort_order: 1,
    ...overrides,
  };
}

describe('evaluateConfigDiff', () => {
  it('scores file rules deterministically and computes percentage', () => {
    const result = evaluateConfigDiff(
      {
        files: {
          'etc/ssh/sshd_config':
            'PermitRootLogin no\nPasswordAuthentication no\n',
        },
      },
      ticket({
        expected_state: {
          rules: [
            {
              id: 'r1',
              type: 'file_contains',
              path: 'etc/ssh/sshd_config',
              pattern: 'PermitRootLogin no',
            },
            {
              id: 'r2',
              type: 'file_contains',
              path: 'etc/ssh/sshd_config',
              pattern: 'PasswordAuthentication yes',
            },
          ],
        },
      })
    );

    expect(result.totalCount).toBe(2);
    expect(result.passedCount).toBe(1);
    expect(result.percentage).toBe(50);
    expect(result.rules[0]?.passed).toBe(true);
    expect(result.rules[1]?.passed).toBe(false);
  });

  it('resolves only when percentage meets threshold (default 100%)', () => {
    const result = evaluateConfigDiff(
      { files: { 'a.conf': 'ok' } },
      ticket({
        expected_state: {
          rules: [
            { id: 'r1', type: 'file_equals', path: 'a.conf', content: 'ok' },
          ],
        },
      })
    );
    expect(result.percentage).toBe(100);
    expect(result.percentage >= result.passThresholdPercent).toBe(true);
  });

  it('matches command_history patterns without exposing file dumps in feedback', () => {
    const result = evaluateConfigDiff(
      {
        files: {},
        commandHistory: ['chmod 600 /etc/shadow', 'systemctl restart sshd'],
      },
      ticket({
        expected_state: {
          rules: [
            {
              id: 'r1',
              type: 'command_history',
              pattern: 'chmod 600',
            },
          ],
        },
      })
    );
    expect(result.rules[0]?.passed).toBe(true);
    const feedback = deterministicFeedback(result);
    expect(feedback).toContain('All 1 configuration checks passed');
    expect(feedback).not.toContain('/etc/shadow');
  });

  it('passes file_absent when the path is missing from the submission', () => {
    const result = evaluateConfigDiff(
      {
        files: {
          'status/spooler.state': 'running\n',
        },
      },
      ticket({
        expected_state: {
          rules: [
            {
              id: 'job_gone',
              type: 'file_absent',
              path: 'var/spool/cups/c00001',
            },
            {
              id: 'status_ok',
              type: 'file_contains',
              path: 'status/spooler.state',
              pattern: 'running',
            },
          ],
        },
      })
    );
    expect(result.passedCount).toBe(2);
    expect(result.rules[0]?.passed).toBe(true);
  });

  it('fails file_absent when the path is still present', () => {
    const result = evaluateConfigDiff(
      {
        files: {
          'var/spool/cups/c00001': 'stuck job',
        },
      },
      ticket({
        expected_state: {
          rules: [
            {
              id: 'job_gone',
              type: 'file_absent',
              path: 'var/spool/cups/c00001',
            },
          ],
        },
      })
    );
    expect(result.rules[0]?.passed).toBe(false);
  });
});
