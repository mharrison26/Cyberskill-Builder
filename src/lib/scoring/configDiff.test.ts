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

  it('scores file_permission with 4-digit modes (setgid preserved)', () => {
    const result = evaluateConfigDiff(
      {
        files: {
          'srv/projects/shared/README': 'ok\n',
        },
        fileModes: {
          'srv/projects/shared': '2770',
        },
      },
      ticket({
        expected_state: {
          rules: [
            {
              id: 'mode_ok',
              type: 'file_permission',
              path: 'srv/projects/shared',
              mode: '2770',
            },
          ],
        },
      })
    );
    expect(result.rules[0]?.passed).toBe(true);

    const wrong = evaluateConfigDiff(
      {
        files: { 'srv/projects/shared/README': 'ok\n' },
        fileModes: { 'srv/projects/shared': '770' },
      },
      ticket({
        expected_state: {
          rules: [
            {
              id: 'mode_ok',
              type: 'file_permission',
              path: 'srv/projects/shared',
              mode: '2770',
            },
          ],
        },
      })
    );
    expect(wrong.rules[0]?.passed).toBe(false);
  });

  it('passes the user/group/permissions lab submission shape (PI-06)', () => {
    const expected_state = {
      passThresholdPercent: 100,
      rules: [
        {
          id: 'user_created',
          type: 'file_contains',
          path: 'etc/passwd',
          pattern:
            'arivera:x:1005:1005:Alex Rivera:/home/arivera:/bin/bash',
        },
        {
          id: 'group_membership',
          type: 'file_contains',
          path: 'etc/group',
          pattern: 'developers:x:2001:[^\\n]*\\barivera\\b',
          regex: true,
        },
        {
          id: 'shared_dir_mode',
          type: 'file_permission',
          path: 'srv/projects/shared',
          mode: '2770',
        },
      ],
    };

    const pass = evaluateConfigDiff(
      {
        files: {
          'etc/passwd':
            'root:x:0:0:root:/root:/bin/bash\n' +
            'arivera:x:1005:1005:Alex Rivera:/home/arivera:/bin/bash\n',
          'etc/group':
            'root:x:0:\ndevelopers:x:2001:jsmith,mchen,arivera\n',
          'srv/projects/shared/README': 'Shared engineering project tree\n',
        },
        fileModes: {
          'srv/projects/shared': '2770',
        },
      },
      ticket({
        ticket_type: 'config_remediation',
        scenario_brief:
          'Sysadmin provisioning: Create arivera, add to developers, chmod shared project dir',
        expected_state,
      })
    );

    expect(pass.totalCount).toBe(3);
    expect(pass.passedCount).toBe(3);
    expect(pass.percentage).toBe(100);
    expect(pass.percentage >= pass.passThresholdPercent).toBe(true);

    const fail = evaluateConfigDiff(
      {
        files: {
          'etc/passwd':
            'root:x:0:0:root:/root:/bin/bash\njsmith:x:1001:1001:Jordan Smith:/home/jsmith:/bin/bash\n',
          'etc/group': 'developers:x:2001:jsmith,mchen\n',
          'srv/projects/shared/README': 'Shared engineering project tree\n',
        },
        fileModes: {
          'srv/projects/shared': '755',
        },
      },
      ticket({ ticket_type: 'config_remediation', expected_state })
    );

    expect(fail.passedCount).toBe(0);
    expect(fail.percentage).toBe(0);
  });
});
