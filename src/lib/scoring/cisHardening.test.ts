import { describe, expect, it } from 'vitest';

import { assertSandboxEligible } from '@/lib/sandbox/eligibility';
import {
  collectSnapshotPaths,
  extractPreloadFiles,
  parseGuestSnapshotJson,
} from '@/lib/sandbox/guestState';
import {
  evaluateConfigDiff,
  type ConfigDiffRule,
} from '@/lib/scoring/configDiff';
import {
  isCisHardeningTicketType,
  parseCisHardeningChecklist,
} from '@/lib/scoring/ticketUi';
import {
  getTicketScorer,
  listRegisteredTicketTypes,
  type ScorableTicket,
} from '@/lib/scoring';

/** Mirrors the seed migration expected_state.rules for unit coverage. */
const CIS_HARDENING_RULES: ConfigDiffRule[] = [
  {
    id: 'permit_root_login',
    type: 'file_contains',
    path: 'etc/ssh/sshd_config',
    pattern: 'PermitRootLogin no',
  },
  {
    id: 'password_authentication',
    type: 'file_contains',
    path: 'etc/ssh/sshd_config',
    pattern: 'PasswordAuthentication no',
  },
  {
    id: 'max_auth_tries',
    type: 'file_contains',
    path: 'etc/ssh/sshd_config',
    pattern: 'MaxAuthTries\\s+4',
    regex: true,
  },
  {
    id: 'pass_max_days',
    type: 'file_contains',
    path: 'etc/login.defs',
    pattern: 'PASS_MAX_DAYS\\s+90',
    regex: true,
  },
  {
    id: 'pass_min_days',
    type: 'file_contains',
    path: 'etc/login.defs',
    pattern: 'PASS_MIN_DAYS\\s+1',
    regex: true,
  },
  {
    id: 'umask',
    type: 'file_contains',
    path: 'etc/login.defs',
    pattern: 'UMASK\\s+027',
    regex: true,
  },
  {
    id: 'shadow_mode',
    type: 'file_permission',
    path: 'etc/shadow',
    mode: '640',
  },
  {
    id: 'telnet_disabled',
    type: 'file_contains',
    path: 'etc/xinetd.d/telnet',
    pattern: 'disable\\s*=\\s*yes',
    regex: true,
  },
];

const UNHARDENED = {
  files: {
    'etc/ssh/sshd_config':
      'PermitRootLogin yes\nPasswordAuthentication yes\nMaxAuthTries 10\n',
    'etc/login.defs':
      'PASS_MAX_DAYS   99999\nPASS_MIN_DAYS   0\nUMASK           022\n',
    'etc/shadow': 'root:*:19000:0:99999:7:::\n',
    'etc/xinetd.d/telnet': 'disable         = no\n',
  },
  fileModes: {
    'etc/shadow': '644',
  },
};

const HARDENED = {
  files: {
    'etc/ssh/sshd_config':
      'PermitRootLogin no\nPasswordAuthentication no\nMaxAuthTries 4\n',
    'etc/login.defs':
      'PASS_MAX_DAYS   90\nPASS_MIN_DAYS   1\nUMASK           027\n',
    'etc/shadow': 'root:*:19000:0:99999:7:::\n',
    'etc/xinetd.d/telnet': 'disable         = yes\n',
  },
  fileModes: {
    'etc/shadow': '640',
  },
};

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 'cis-1',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'cis_hardening',
    difficulty: 'medium',
    sla_minutes: 45,
    scenario_brief: 'CIS hardening: lab',
    initial_state: {
      preloadFiles: UNHARDENED.files,
      preloadModes: UNHARDENED.fileModes,
      checklist: [
        { id: 'permit_root_login', title: 'Disable root SSH login' },
        { id: 'shadow_mode', title: 'Restrict /etc/shadow permissions' },
      ],
    },
    expected_state: {
      passThresholdPercent: 100,
      rules: CIS_HARDENING_RULES,
    },
    dcwf_code: null,
    sort_order: 1,
    ...overrides,
  };
}

describe('cis_hardening ticket wiring', () => {
  it('recognizes ticket type aliases', () => {
    expect(isCisHardeningTicketType('cis_hardening')).toBe(true);
    expect(isCisHardeningTicketType('linux_hardening')).toBe(true);
    expect(isCisHardeningTicketType('sysadmin_hardening')).toBe(true);
    expect(isCisHardeningTicketType('config_remediation')).toBe(false);
  });

  it('registers config-diff scorer for cis_hardening aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('cis_hardening');
    expect(registered).toContain('linux_hardening');
    expect(registered).toContain('sysadmin_hardening');
    expect(getTicketScorer('cis_hardening')).toBeTruthy();
    expect(getTicketScorer('linux_hardening')).toBe(
      getTicketScorer('cis_hardening')
    );
  });

  it('is eligible for Fly sandbox at tier 2+', () => {
    expect(
      assertSandboxEligible({
        tier: 2,
        ticket_type: 'cis_hardening',
        difficulty: 'medium',
      })
    ).toEqual({ ok: true });
    expect(
      assertSandboxEligible({
        tier: 1,
        ticket_type: 'cis_hardening',
        difficulty: 'medium',
      }).ok
    ).toBe(false);
  });

  it('parses checklist items from initial_state', () => {
    const items = parseCisHardeningChecklist(
      ticket().initial_state as Record<string, unknown>
    );
    expect(items).toHaveLength(2);
    expect(items[0]?.id).toBe('permit_root_login');
  });

  it('collects snapshot paths from expected rules', () => {
    const paths = collectSnapshotPaths({
      expectedState: ticket().expected_state as Record<string, unknown>,
      initialState: ticket().initial_state as Record<string, unknown>,
    });
    expect(paths).toContain('etc/ssh/sshd_config');
    expect(paths).toContain('etc/shadow');
    expect(paths).toContain('etc/xinetd.d/telnet');
    expect(
      extractPreloadFiles(ticket().initial_state as Record<string, unknown>)
    ).toHaveProperty('etc/ssh/sshd_config');
  });
});

describe('cis_hardening config-diff rules', () => {
  it('fails every rule against the unhardened baseline submission', () => {
    const result = evaluateConfigDiff(UNHARDENED, ticket());
    expect(result.totalCount).toBe(8);
    expect(result.passedCount).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.rules.every((rule) => !rule.passed)).toBe(true);
  });

  it('passes every rule against a corrected hardening submission', () => {
    const result = evaluateConfigDiff(HARDENED, ticket());
    expect(result.totalCount).toBe(8);
    expect(result.passedCount).toBe(8);
    expect(result.percentage).toBe(100);
    expect(result.percentage >= result.passThresholdPercent).toBe(true);
    expect(result.rules.every((rule) => rule.passed)).toBe(true);
  });

  it('parses guest snapshot JSON used by the sandbox snapshot route', () => {
    const parsed = parseGuestSnapshotJson(
      JSON.stringify({
        files: HARDENED.files,
        fileModes: HARDENED.fileModes,
      })
    );
    expect(parsed?.files['etc/ssh/sshd_config']).toContain(
      'PermitRootLogin no'
    );
    expect(parsed?.fileModes['etc/shadow']).toBe('640');
  });
});
