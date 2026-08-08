import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { ScorableTicket } from '@/lib/scoring';
import {
  evaluateBackupDrPlanDeterministic,
  extractBackupDrPlanSubmission,
  backupDrPlanTicketScorer,
} from '@/lib/scoring/backupDrPlan';

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
    id: 't-backup-dr',
    tenant_id: 'ten1',
    track_id: 'tr1',
    tier: 2,
    ticket_type: 'backup_dr_plan',
    difficulty: 'medium',
    sla_minutes: 60,
    scenario_brief:
      'Backup/DR: Draft a backup and disaster recovery plan for BrightLedger Bookkeeping',
    initial_state: {
      businessProfile: {
        name: 'BrightLedger Bookkeeping LLC',
        employeeCount: '18 staff + seasonal contractors',
      },
      systems: [
        {
          name: 'File server',
          description: 'On-prem Windows file share for client workpapers',
        },
        {
          name: 'SaaS CRM',
          description: 'Cloud CRM for client pipeline',
        },
      ],
    },
    expected_state: {
      minFieldLength: 40,
      guidanceTopics: [
        'backup-frequency',
        'retention',
        'rpo-targets',
        'rto-targets',
        'restore-testing',
      ],
      topKGuidanceSections: 6,
    },
    dcwf_code: null,
    sort_order: 1,
    ...overrides,
  };
}

const solidSubmission = {
  type: 'backup_dr_plan',
  backupFrequency:
    'File server: nightly incremental + weekly full. On-prem SQL: hourly transaction log + nightly full. SaaS CRM: daily export plus vendor backups. Endpoints: daily profile backup for Finance laptops only.',
  retention:
    'Keep 30 days of daily versions for file server and SQL; retain weekly fulls for 12 weeks; keep monthly CRM exports for 12 months to support tax season rework.',
  rpoTargets:
    'SQL invoicing DB RPO 1 hour; file server RPO 24 hours; CRM RPO 24 hours via export; endpoint local drafts RPO 24 hours for Finance laptops.',
  rtoTargets:
    'SQL restore RTO 4 hours (priority 1); file server RTO 8 hours; CRM recover via vendor + re-import RTO 24 hours; endpoint rebuild RTO 1 business day.',
  restoreTestingCadence:
    'Monthly: restore a sample client folder and one SQL database to the staging host and open a report. Quarterly: full file-server share restore drill with owner sign-off. Log pass/fail and remediate backup jobs within one week of any failure.',
  planNotes:
    'Keep one backup copy in a separate cloud account so ransomware on the office server cannot encrypt the only good copy.',
};

describe('extractBackupDrPlanSubmission', () => {
  it('accepts camelCase and snake_case field names', () => {
    expect(extractBackupDrPlanSubmission(solidSubmission)).toMatchObject({
      backupFrequency: solidSubmission.backupFrequency,
      retention: solidSubmission.retention,
      rpoTargets: solidSubmission.rpoTargets,
    });

    const snake = extractBackupDrPlanSubmission({
      backup_frequency: solidSubmission.backupFrequency,
      retention: solidSubmission.retention,
      rpo_targets: solidSubmission.rpoTargets,
      rto_targets: solidSubmission.rtoTargets,
      restore_testing_cadence: solidSubmission.restoreTestingCadence,
      plan_notes: solidSubmission.planNotes,
    });
    expect(snake?.rpoTargets).toBe(solidSubmission.rpoTargets);
    expect(snake?.restoreTestingCadence).toBe(
      solidSubmission.restoreTestingCadence
    );
    expect(snake?.planNotes).toBe(solidSubmission.planNotes);
  });

  it('returns null when a required field is missing', () => {
    expect(
      extractBackupDrPlanSubmission({
        backupFrequency: solidSubmission.backupFrequency,
        retention: solidSubmission.retention,
      })
    ).toBeNull();
  });

  it('allows omitting optional planNotes', () => {
    const { planNotes: _notes, ...requiredOnly } = solidSubmission;
    const parsed = extractBackupDrPlanSubmission(requiredOnly);
    expect(parsed?.planNotes).toBeUndefined();
    expect(parsed?.backupFrequency).toBe(solidSubmission.backupFrequency);
  });
});

describe('evaluateBackupDrPlanDeterministic', () => {
  it('rejects missing fields', () => {
    const result = evaluateBackupDrPlanDeterministic({}, ticket());
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('missing_fields');
  });

  it('rejects short fields', () => {
    const result = evaluateBackupDrPlanDeterministic(
      {
        backupFrequency: 'Too short',
        retention: 'Too short',
        rpoTargets: 'Too short',
        rtoTargets: 'Too short',
        restoreTestingCadence: 'Too short',
      },
      ticket()
    );
    expect(result.ok).toBe(false);
    expect(result.structured.reason).toBe('fields_too_short');
  });

  it('passes a complete plan', () => {
    const result = evaluateBackupDrPlanDeterministic(solidSubmission, ticket());
    expect(result.ok).toBe(true);
    expect(result.structured.fieldsOk).toBe(true);
  });
});

describe('backupDrPlanTicketScorer', () => {
  beforeEach(() => {
    vi.mocked(callClaudeGrading).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns needs_revision when API key is missing', async () => {
    const { MissingAnthropicApiKeyError } =
      await import('@/lib/grading/callClaudeGrading');
    vi.mocked(callClaudeGrading).mockRejectedValue(
      new MissingAnthropicApiKeyError()
    );

    const result = await backupDrPlanTicketScorer.score(
      solidSubmission,
      ticket()
    );
    expect(result.status).toBe('needs_revision');
    expect(result.structuredResult.reason).toBe(
      'grading_unavailable_missing_api_key'
    );
  });

  it('resolves when checklist grading is satisfied', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'satisfied',
      feedback:
        'Solid per-system frequency, RPO/RTO, retention, and restore testing.',
      strengths: ['Numeric RPO/RTO by system', 'Monthly restore tests'],
      gaps: [],
    });

    const result = await backupDrPlanTicketScorer.score(
      solidSubmission,
      ticket()
    );
    expect(result.status).toBe('resolved');
    expect(result.feedback).toContain('Solid per-system');
    expect(result.structuredResult.retrievedSectionIds).toEqual(
      expect.arrayContaining([
        'backup-frequency',
        'retention',
        'rpo-targets',
        'rto-targets',
        'restore-testing',
      ])
    );
    expect(callClaudeGrading).toHaveBeenCalledTimes(1);
  });

  it('needs revision when grading finds gaps', async () => {
    vi.mocked(callClaudeGrading).mockResolvedValue({
      finding_state: 'insufficient_evidence',
      feedback: 'Restore testing is too vague.',
      strengths: ['RPO targets are numeric'],
      gaps: ['No success criteria for restore drills'],
    });

    const result = await backupDrPlanTicketScorer.score(
      solidSubmission,
      ticket()
    );
    expect(result.status).toBe('needs_revision');
    expect(result.feedback).toContain('Restore testing');
  });
});
