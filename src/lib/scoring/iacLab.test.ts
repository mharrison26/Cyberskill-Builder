import { describe, expect, it } from 'vitest';

import {
  getTicketScorer,
  listRegisteredTicketTypes,
  type ScorableTicket,
} from '@/lib/scoring';
import {
  evaluateIacLab,
  extractHostsValues,
  extractModuleInvocations,
  iacLabTicketScorer,
  isIacLabTicketType,
} from '@/lib/scoring/iacLab';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-iac',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'ansible_playbook',
    difficulty: 'medium',
    sla_minutes: 30,
    scenario_brief: 'Ansible: install and enable nginx on webservers',
    initial_state: {},
    expected_state: {
      playbookPath: 'playbook.yml',
      passThresholdPercent: 100,
      declarations: [
        { id: 'hosts_webservers', kind: 'hosts', hosts: 'webservers' },
        {
          id: 'install_nginx',
          kind: 'package',
          name: 'nginx',
          state: 'present',
        },
        {
          id: 'enable_nginx',
          kind: 'service',
          name: 'nginx',
          state: 'started',
          enabled: true,
        },
      ],
    },
    dcwf_code: null,
    sort_order: 1,
    ...overrides,
  };
}

const classicPlaybook = `---
- name: Configure webservers
  hosts: webservers
  become: true
  tasks:
    - name: Install nginx
      package:
        name: nginx
        state: present

    - name: Enable and start nginx
      service:
        name: nginx
        state: started
        enabled: true
`;

const fqcnInlinePlaybook = `---
- hosts: "webservers"
  tasks:
    - ansible.builtin.package: name=nginx state=present
    - ansible.builtin.service: name=nginx state=started enabled=yes
`;

const yumAptSplitPlaybook = `---
- name: nginx on webservers
  hosts: webservers
  tasks:
    - name: Install via yum
      yum:
        name: nginx
        state: present

    - name: Start nginx
      systemd:
        name: nginx
        state: started

    - name: Enable nginx on boot
      systemd:
        name: nginx.service
        enabled: true

    - name: Unrelated extra task
      debug:
        msg: "still passes"
`;

const missingServicePlaybook = `---
- hosts: webservers
  tasks:
    - package:
        name: nginx
        state: present
`;

describe('isIacLabTicketType', () => {
  it('recognizes aliases', () => {
    expect(isIacLabTicketType('ansible_playbook')).toBe(true);
    expect(isIacLabTicketType('iac_lab')).toBe(true);
    expect(isIacLabTicketType('ansible_lab')).toBe(true);
    expect(isIacLabTicketType('terraform_lab')).toBe(true);
    expect(isIacLabTicketType('sysadmin.ansible_playbook')).toBe(true);
    expect(isIacLabTicketType('script_remediation')).toBe(false);
  });
});

describe('extractHostsValues / extractModuleInvocations', () => {
  it('parses hosts and classic module maps', () => {
    expect(extractHostsValues(classicPlaybook)).toContain('webservers');
    const inv = extractModuleInvocations(classicPlaybook);
    expect(
      inv.some((i) => i.module === 'package' && i.args.name === 'nginx')
    ).toBe(true);
    expect(
      inv.some(
        (i) =>
          i.module === 'service' &&
          i.args.name === 'nginx' &&
          i.args.state === 'started' &&
          i.args.enabled === 'true'
      )
    ).toBe(true);
  });

  it('parses FQCN inline key=value args', () => {
    const inv = extractModuleInvocations(fqcnInlinePlaybook);
    expect(
      inv.some(
        (i) =>
          i.module === 'package' &&
          i.args.name === 'nginx' &&
          i.args.state === 'present'
      )
    ).toBe(true);
    expect(
      inv.some(
        (i) =>
          i.module === 'service' &&
          i.args.enabled === 'yes' &&
          i.args.state === 'started'
      )
    ).toBe(true);
  });
});

describe('iacLabTicketScorer', () => {
  it('registers ansible_playbook aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('ansible_playbook');
    expect(registered).toContain('iac_lab');
    expect(registered).toContain('ansible_lab');
    expect(registered).toContain('terraform_lab');
    expect(getTicketScorer('ansible_playbook')).toBe(iacLabTicketScorer);
  });

  it('passes classic package/service syntax', async () => {
    const result = await iacLabTicketScorer.score(
      { files: { 'playbook.yml': classicPlaybook } },
      ticket()
    );
    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'iac_lab',
      matchedCount: 3,
      totalCount: 3,
      percentage: 100,
    });
  });

  it('passes alternate FQCN + inline syntax', async () => {
    const result = await iacLabTicketScorer.score(
      { files: { 'playbook.yml': fqcnInlinePlaybook } },
      ticket()
    );
    expect(result.status).toBe('resolved');
  });

  it('passes yum/systemd split tasks plus irrelevant extras', async () => {
    const result = await iacLabTicketScorer.score(
      { files: { 'playbook.yml': yumAptSplitPlaybook } },
      ticket()
    );
    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({ percentage: 100 });
  });

  it('fails when required service task is missing', async () => {
    const result = await iacLabTicketScorer.score(
      { files: { 'playbook.yml': missingServicePlaybook } },
      ticket()
    );
    expect(result.status).toBe('needs_revision');
    const structured = result.structuredResult as {
      matchedCount: number;
      declarationResults: Array<{ id: string; passed: boolean }>;
    };
    expect(structured.matchedCount).toBe(2);
    expect(
      structured.declarationResults.find((d) => d.id === 'enable_nginx')?.passed
    ).toBe(false);
    expect(result.feedback).toMatch(/enable_nginx|service/i);
  });

  it('fails on wrong hosts group', async () => {
    const bad = classicPlaybook.replace(
      'hosts: webservers',
      'hosts: dbservers'
    );
    const result = evaluateIacLab({ files: { 'playbook.yml': bad } }, ticket());
    expect(result.percentage).toBeLessThan(100);
    expect(
      result.declarationResults.find((d) => d.id === 'hosts_webservers')?.passed
    ).toBe(false);
  });

  it('fails when playbook file is missing', async () => {
    const result = await iacLabTicketScorer.score({ files: {} }, ticket());
    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      reason: 'missing_playbook',
    });
  });
});
