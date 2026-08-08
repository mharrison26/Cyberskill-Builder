import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildBackupDrPlanGradingPrompt } from '@/lib/grading/buildBackupDrPlanGradingPrompt';
import { retrieveBackupDrChecklist } from '@/lib/backup/getBackupDrChecklist';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { BACKUP_DR_PLAN_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

/**
 * Backup / disaster recovery plan scoring.
 *
 * Deterministic:
 *   - backupFrequency, retention, rpoTargets, rtoTargets, restoreTestingCadence
 *     present + min length
 *   - optional planNotes (no min length when empty)
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned backup/DR best-practices checklist
 *   - grade plan against retrieved checklist text only
 */

export { BACKUP_DR_PLAN_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

export type BackupDrPlanExpectedState = {
  minFieldLength?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
};

export type BackupDrPlanSubmission = {
  type?: string;
  backupFrequency: string;
  retention: string;
  rpoTargets: string;
  rtoTargets: string;
  restoreTestingCadence: string;
  planNotes?: string;
};

export type BackupDrPlanStructuredResult = {
  style: 'backup_dr_plan';
  backupFrequencyLength: number;
  retentionLength: number;
  rpoTargetsLength: number;
  rtoTargetsLength: number;
  restoreTestingCadenceLength: number;
  planNotesLength: number;
  minFieldLength: number;
  fieldsOk: boolean;
  guidancePath: string | null;
  retrievedSectionIds: string[];
  grading?: {
    finding_state: ClaudeGradingResult['finding_state'];
    strengths: string[];
    gaps: string[];
  };
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function parseBackupDrPlanExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): BackupDrPlanExpectedState {
  if (!isPlainObject(expectedState)) {
    return {};
  }
  return expectedState as BackupDrPlanExpectedState;
}

export function extractBackupDrPlanSubmission(
  submission: TicketSubmission
): BackupDrPlanSubmission | null {
  const backupFrequency =
    asNonEmptyString(submission.backupFrequency) ??
    asNonEmptyString(submission.backup_frequency) ??
    asNonEmptyString(submission.frequency);
  const retention = asNonEmptyString(submission.retention);
  const rpoTargets =
    asNonEmptyString(submission.rpoTargets) ??
    asNonEmptyString(submission.rpo_targets) ??
    asNonEmptyString(submission.rpo);
  const rtoTargets =
    asNonEmptyString(submission.rtoTargets) ??
    asNonEmptyString(submission.rto_targets) ??
    asNonEmptyString(submission.rto);
  const restoreTestingCadence =
    asNonEmptyString(submission.restoreTestingCadence) ??
    asNonEmptyString(submission.restore_testing_cadence) ??
    asNonEmptyString(submission.restoreTesting) ??
    asNonEmptyString(submission.restore_testing);
  const planNotes =
    asOptionalString(submission.planNotes) ??
    asOptionalString(submission.plan_notes) ??
    asOptionalString(submission.notes);

  if (
    !backupFrequency ||
    !retention ||
    !rpoTargets ||
    !rtoTargets ||
    !restoreTestingCadence
  ) {
    return null;
  }

  return {
    type:
      typeof submission.type === 'string' ? submission.type : 'backup_dr_plan',
    backupFrequency,
    retention,
    rpoTargets,
    rtoTargets,
    restoreTestingCadence,
    planNotes,
  };
}

function formatBusinessContext(
  initialState: Record<string, unknown> | null | undefined
): string | undefined {
  if (!isPlainObject(initialState)) return undefined;

  const parts: string[] = [];
  const business =
    initialState.businessProfile ??
    initialState.business_profile ??
    initialState.systemProfile ??
    initialState.system_profile;

  if (typeof business === 'string' && business.trim()) {
    parts.push(business.trim());
  } else if (isPlainObject(business)) {
    for (const [key, value] of Object.entries(business)) {
      if (typeof value === 'string' && value.trim()) {
        parts.push(`${key}: ${value.trim()}`);
      } else if (Array.isArray(value)) {
        const items = value.filter(
          (entry) => typeof entry === 'string'
        ) as string[];
        if (items.length > 0) {
          parts.push(`${key}: ${items.join('; ')}`);
        }
      }
    }
  }

  const systems = initialState.systems ?? initialState.inventory;
  if (Array.isArray(systems)) {
    const lines = systems
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (!isPlainObject(entry)) return '';
        const name =
          asNonEmptyString(entry.name) ?? asNonEmptyString(entry.system) ?? '';
        const detail =
          asNonEmptyString(entry.description) ??
          asNonEmptyString(entry.notes) ??
          asNonEmptyString(entry.criticality) ??
          '';
        if (name && detail) return `${name}: ${detail}`;
        return name || detail;
      })
      .filter(Boolean);
    if (lines.length > 0) {
      parts.push(`systems:\n- ${lines.join('\n- ')}`);
    }
  }

  const prompt = asNonEmptyString(initialState.prompt);
  if (prompt) {
    parts.push(`prompt: ${prompt}`);
  }

  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function evaluateBackupDrPlanDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: BackupDrPlanSubmission | null;
  structured: BackupDrPlanStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expected = parseBackupDrPlanExpectedState(ticket.expected_state);
  const minFieldLength =
    typeof expected.minFieldLength === 'number' &&
    Number.isFinite(expected.minFieldLength) &&
    expected.minFieldLength > 0
      ? Math.floor(expected.minFieldLength)
      : BACKUP_DR_PLAN_MIN_FIELD_LENGTH;

  const parsed = extractBackupDrPlanSubmission(submission);

  if (!parsed) {
    const structured: BackupDrPlanStructuredResult = {
      style: 'backup_dr_plan',
      backupFrequencyLength: 0,
      retentionLength: 0,
      rpoTargetsLength: 0,
      rtoTargetsLength: 0,
      restoreTestingCadenceLength: 0,
      planNotesLength: 0,
      minFieldLength,
      fieldsOk: false,
      guidancePath: null,
      retrievedSectionIds: [],
      reason: 'missing_fields',
    };
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include backupFrequency, retention, rpoTargets, rtoTargets, and restoreTestingCadence.',
    };
  }

  const lengths = {
    backupFrequencyLength: parsed.backupFrequency.length,
    retentionLength: parsed.retention.length,
    rpoTargetsLength: parsed.rpoTargets.length,
    rtoTargetsLength: parsed.rtoTargets.length,
    restoreTestingCadenceLength: parsed.restoreTestingCadence.length,
    planNotesLength: parsed.planNotes?.length ?? 0,
  };

  const shortFields = (
    [
      ['backupFrequency', lengths.backupFrequencyLength],
      ['retention', lengths.retentionLength],
      ['rpoTargets', lengths.rpoTargetsLength],
      ['rtoTargets', lengths.rtoTargetsLength],
      ['restoreTestingCadence', lengths.restoreTestingCadenceLength],
    ] as const
  )
    .filter(([, length]) => length < minFieldLength)
    .map(([name]) => name);

  const structured: BackupDrPlanStructuredResult = {
    style: 'backup_dr_plan',
    ...lengths,
    minFieldLength,
    fieldsOk: shortFields.length === 0,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (shortFields.length > 0) {
    structured.reason = 'fields_too_short';
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Expand these plan fields (min ${minFieldLength} chars): ${shortFields.join(', ')}.`,
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback:
      'Deterministic checks passed. Grading backup/DR plan against best-practices checklist…',
  };
}

async function gradePlanWithChecklist(
  parsed: BackupDrPlanSubmission,
  ticket: ScorableTicket,
  expected: BackupDrPlanExpectedState
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const query = [
    parsed.backupFrequency,
    parsed.retention,
    parsed.rpoTargets,
    parsed.rtoTargets,
    parsed.restoreTestingCadence,
    parsed.planNotes ?? '',
  ].join('\n');

  const requiredSectionIds =
    expected.guidanceTopics && expected.guidanceTopics.length > 0
      ? expected.guidanceTopics
      : undefined;

  const retrieved = retrieveBackupDrChecklist(query, {
    topK: expected.topKGuidanceSections ?? 6,
    requiredSectionIds,
  });

  const prompt = buildBackupDrPlanGradingPrompt(retrieved, {
    backupFrequency: parsed.backupFrequency,
    retention: parsed.retention,
    rpoTargets: parsed.rpoTargets,
    rtoTargets: parsed.rtoTargets,
    restoreTestingCadence: parsed.restoreTestingCadence,
    planNotes: parsed.planNotes,
    scenarioBrief: ticket.scenario_brief,
    businessContextText: formatBusinessContext(ticket.initial_state),
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

export const backupDrPlanTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const deterministic = evaluateBackupDrPlanDeterministic(submission, ticket);

    if (!deterministic.ok || !deterministic.parsed) {
      return {
        status: 'needs_revision',
        structuredResult: deterministic.structured,
        feedback: deterministic.feedback,
      };
    }

    const expected = parseBackupDrPlanExpectedState(ticket.expected_state);

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradePlanWithChecklist(deterministic.parsed, ticket, expected);

      const structured: BackupDrPlanStructuredResult = {
        ...deterministic.structured,
        guidancePath,
        retrievedSectionIds,
        grading: {
          finding_state: grading.finding_state,
          strengths: grading.strengths,
          gaps: grading.gaps,
        },
      };

      if (grading.finding_state === 'satisfied') {
        return {
          status: 'resolved',
          structuredResult: structured,
          feedback: grading.feedback,
        };
      }

      structured.reason = `grading_${grading.finding_state}`;
      const gapHint =
        grading.gaps.length > 0
          ? ` Gaps: ${grading.gaps.slice(0, 3).join(' ')}`
          : '';

      return {
        status: 'needs_revision',
        structuredResult: structured,
        feedback: `${grading.feedback}${gapHint}`,
      };
    } catch (error) {
      if (error instanceof MissingAnthropicApiKeyError) {
        const structured: BackupDrPlanStructuredResult = {
          ...deterministic.structured,
          reason: 'grading_unavailable_missing_api_key',
        };
        return {
          status: 'needs_revision',
          structuredResult: structured,
          feedback:
            'Plan fields look complete, but AI grading against the backup/DR checklist is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit.',
        };
      }

      console.error('Backup/DR checklist grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'backup_dr_plan_rag_grade',
        ticketId: ticket.id,
        ticketType: ticket.ticket_type,
        level: 'error',
      });

      return {
        status: 'needs_revision',
        structuredResult: {
          ...deterministic.structured,
          reason: 'grading_error',
        },
        feedback:
          'Could not grade your backup/DR plan against the checklist. Please try again shortly.',
      };
    }
  },
};
