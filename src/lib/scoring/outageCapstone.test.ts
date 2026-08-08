import { afterEach, describe, expect, it, vi } from 'vitest';

import * as callClaudeGrading from '@/lib/grading/callClaudeGrading';
import {
  getTicketScorer,
  listRegisteredTicketTypes,
  type ScorableTicket,
} from '@/lib/scoring';
import {
  extractOutageIncidentReport,
  isOutageCapstoneTicketType,
  outageCapstoneTicketScorer,
} from '@/lib/scoring/outageCapstone';

function ticket(overrides: Partial<ScorableTicket> = {}): ScorableTicket {
  return {
    id: 't-outage',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 3,
    ticket_type: 'outage_capstone',
    difficulty: 'advanced',
    sla_minutes: 60,
    scenario_brief:
      'P1 API outage: nginx listen misconfigured and disk fill blocking the app',
    initial_state: {},
    expected_state: {
      minReportFieldLength: 60,
      passThresholdPercent: 100,
      guidanceTopics: ['timeline', 'root-cause', 'remediation', 'prevention'],
      rules: [
        {
          id: 'nginx_listen_fixed',
          type: 'file_contains',
          path: 'etc/nginx/sites-enabled/app.conf',
          pattern: 'listen\\s+80\\s*;',
          regex: true,
        },
        {
          id: 'disk_fill_removed',
          type: 'file_absent',
          path: 'var/lib/app/disk.fill',
        },
        {
          id: 'service_running',
          type: 'file_contains',
          path: 'var/lib/app/status',
          pattern: 'state=running',
        },
        {
          id: 'disk_ok',
          type: 'file_contains',
          path: 'var/lib/app/status',
          pattern: 'disk=ok',
        },
      ],
    },
    dcwf_code: '411',
    sort_order: 1,
    ...overrides,
  };
}

const fixedFiles = {
  'etc/nginx/sites-enabled/app.conf':
    'server {\n  listen 80;\n  server_name app.local;\n  location / { proxy_pass http://127.0.0.1:3000; }\n}\n',
  'var/lib/app/status': 'state=running\ndisk=ok\nreason=recovered\n',
};

const solidReport = {
  timeline:
    'T0: Alert that the customer API returned 502. T+5m: Checked nginx and app status; listen was 9999 and disk.fill was present with disk=full. T+20m: Fixed listen to 80, removed disk.fill, wrote state=running/disk=ok, verified status file.',
  rootCause:
    'Two contributing causes: nginx sites-enabled/app.conf listened on port 9999 instead of 80, so traffic never reached the app, and a disk.fill simulation left the filesystem capacity flagged full so the app stayed down.',
  remediation:
    'Edited etc/nginx/sites-enabled/app.conf to listen 80;, removed var/lib/app/disk.fill, updated var/lib/app/status to state=running and disk=ok, then re-read the status file to verify recovery.',
  prevention:
    'Add disk-usage and reverse-proxy health alerts, require peer review for nginx listen/port changes, and document a runbook check for fill files under /var/lib/app before declaring capacity incidents.',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isOutageCapstoneTicketType', () => {
  it('recognizes aliases', () => {
    expect(isOutageCapstoneTicketType('outage_capstone')).toBe(true);
    expect(isOutageCapstoneTicketType('incident_response_capstone')).toBe(true);
    expect(isOutageCapstoneTicketType('sysadmin_outage_capstone')).toBe(true);
    expect(isOutageCapstoneTicketType('linux.outage_capstone')).toBe(true);
    expect(isOutageCapstoneTicketType('cis_hardening')).toBe(false);
    expect(isOutageCapstoneTicketType('script_remediation')).toBe(false);
  });
});

describe('extractOutageIncidentReport', () => {
  it('reads nested report object', () => {
    const report = extractOutageIncidentReport({ report: solidReport });
    expect(report?.rootCause).toContain('nginx');
  });
});

describe('outageCapstoneTicketScorer', () => {
  it('registers outage_capstone aliases', () => {
    const registered = listRegisteredTicketTypes();
    expect(registered).toContain('outage_capstone');
    expect(registered).toContain('incident_response_capstone');
    expect(registered).toContain('sysadmin_outage_capstone');
    expect(getTicketScorer('outage_capstone')).toBe(outageCapstoneTicketScorer);
  });

  it('needs revision when config-diff remediation fails (primary gate)', async () => {
    const gradeSpy = vi.spyOn(callClaudeGrading, 'callClaudeGrading');

    const result = await outageCapstoneTicketScorer.score(
      {
        files: {
          'etc/nginx/sites-enabled/app.conf': 'server { listen 9999; }\n',
          'var/lib/app/disk.fill': 'DISK_FULL_SIMULATION\n',
          'var/lib/app/status': 'state=down\ndisk=full\n',
        },
        report: solidReport,
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      style: 'outage_capstone',
      remediationOk: false,
      reason: 'config_diff_below_threshold',
    });
    expect(gradeSpy).not.toHaveBeenCalled();
  });

  it('needs revision when remediation passes but report is missing', async () => {
    const result = await outageCapstoneTicketScorer.score(
      { files: fixedFiles },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      remediationOk: true,
      reason: 'missing_incident_report',
    });
  });

  it('needs revision when report fields are too short', async () => {
    const result = await outageCapstoneTicketScorer.score(
      {
        files: fixedFiles,
        report: {
          timeline: 'short',
          rootCause: 'short',
          remediation: 'short',
          prevention: 'short',
        },
      },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      remediationOk: true,
      reason: 'report_fields_too_short',
    });
  });

  it('resolves only when remediation passes AND report RAG is satisfied', async () => {
    vi.spyOn(callClaudeGrading, 'callClaudeGrading').mockResolvedValue({
      finding_state: 'satisfied',
      feedback: 'Solid timeline, causes, remediation, and prevention.',
      strengths: ['Clear chronology', 'Tied prevention to disk + config'],
      gaps: [],
    });

    const result = await outageCapstoneTicketScorer.score(
      { files: fixedFiles, report: solidReport },
      ticket()
    );

    expect(result.status).toBe('resolved');
    expect(result.structuredResult).toMatchObject({
      style: 'outage_capstone',
      remediationOk: true,
      reportOk: true,
      grading: { finding_state: 'satisfied' },
    });
    expect(result.structuredResult).toHaveProperty(
      'retrievedSectionIds',
      expect.arrayContaining([
        'timeline',
        'root-cause',
        'remediation',
        'prevention',
      ])
    );
  });

  it('fails the ticket when report RAG is not satisfied (hard gate)', async () => {
    vi.spyOn(callClaudeGrading, 'callClaudeGrading').mockResolvedValue({
      finding_state: 'not_satisfied',
      feedback: 'Prevention is too vague.',
      strengths: ['Timeline present'],
      gaps: ['Prevention lacks monitoring or change-control follow-up'],
    });

    const result = await outageCapstoneTicketScorer.score(
      { files: fixedFiles, report: solidReport },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      remediationOk: true,
      reason: 'report_grading_not_satisfied',
    });
    expect(result.feedback).toContain('Prevention');
  });

  it('needs revision when Anthropic key is missing after remediation passes', async () => {
    vi.spyOn(callClaudeGrading, 'callClaudeGrading').mockRejectedValue(
      new callClaudeGrading.MissingAnthropicApiKeyError()
    );

    const result = await outageCapstoneTicketScorer.score(
      { files: fixedFiles, report: solidReport },
      ticket()
    );

    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult).toMatchObject({
      reason: 'report_grading_unavailable_missing_api_key',
    });
  });
});
