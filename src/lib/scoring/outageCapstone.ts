import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildIncidentReportGradingPrompt } from '@/lib/grading/buildIncidentReportGradingPrompt';
import { retrieveIncidentReportRubric } from '@/lib/incident/getIncidentReportRubric';
import { captureFeatureException } from '@/lib/observability/sentry';
import {
  deterministicFeedback,
  evaluateConfigDiff,
  type ConfigDiffStructuredResult,
} from '@/lib/scoring/configDiff';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { OUTAGE_CAPSTONE_MIN_REPORT_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

export { OUTAGE_CAPSTONE_MIN_REPORT_FIELD_LENGTH } from '@/lib/scoring/ticketUi';

/**
 * Outage / incident-response sysadmin capstone (Fly PI-05 + config-diff PI-06 + RAG).
 *
 * Students launch a Fly sandbox preloaded in a broken state (misconfigured
 * reverse-proxy + simulated full disk), remediate live via the web terminal,
 * then submit a post-incident report.
 *
 * Score composition (deliberate capstone choice — report is NOT advisory-only):
 *   1. Primary hard gate — config-diff rules must meet passThresholdPercent
 *      (nginx listen fixed, disk fill removed, app status healthy).
 *   2. Secondary hard gate — report must pass min-length checks AND RAG
 *      finding_state === 'satisfied' against the pinned
 *      incident-report-quality rubric (timeline, root-cause, remediation,
 *      prevention). F26: only pinned sections are included in the prompt.
 *   Resolve only when BOTH gates pass. A weak report fails the ticket even
 *   if remediation state is correct (unlike script_remediation, where RAG
 *   feedback is advisory).
 *
 * expected_state:
 * {
 *   rules: ConfigDiffRule[];
 *   passThresholdPercent?: number;
 *   minReportFieldLength?: number;   // default 60
 *   guidanceTopics?: string[];
 *   topKGuidanceSections?: number;
 * }
 *
 * submission:
 * {
 *   type?: 'outage_capstone',
 *   files / filesystem / fileModes — guest snapshot for config-diff
 *   report: { timeline, rootCause, remediation, prevention }
 * }
 */

export type OutageIncidentReport = {
  timeline: string;
  rootCause: string;
  remediation: string;
  prevention: string;
};

export type OutageCapstoneExpectedState = {
  minReportFieldLength?: number;
  guidanceTopics?: string[];
  topKGuidanceSections?: number;
};

export type OutageCapstoneStructuredResult = {
  style: 'outage_capstone';
  config: ConfigDiffStructuredResult;
  remediationOk: boolean;
  reportOk: boolean;
  reportFieldLengths: {
    timeline: number;
    rootCause: number;
    remediation: number;
    prevention: number;
  };
  minReportFieldLength: number;
  shortReportFields: string[];
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

export { isOutageCapstoneTicketType } from '@/lib/scoring/ticketUi';

export function parseOutageCapstoneExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): OutageCapstoneExpectedState {
  if (!isPlainObject(expectedState)) return {};
  return {
    minReportFieldLength:
      typeof expectedState.minReportFieldLength === 'number'
        ? expectedState.minReportFieldLength
        : typeof expectedState.min_report_field_length === 'number'
          ? expectedState.min_report_field_length
          : undefined,
    guidanceTopics: Array.isArray(expectedState.guidanceTopics)
      ? expectedState.guidanceTopics.filter(
          (t): t is string => typeof t === 'string'
        )
      : Array.isArray(expectedState.guidance_topics)
        ? expectedState.guidance_topics.filter(
            (t): t is string => typeof t === 'string'
          )
        : undefined,
    topKGuidanceSections:
      typeof expectedState.topKGuidanceSections === 'number'
        ? expectedState.topKGuidanceSections
        : typeof expectedState.top_k_guidance_sections === 'number'
          ? expectedState.top_k_guidance_sections
          : undefined,
  };
}

export function extractOutageIncidentReport(
  submission: TicketSubmission
): OutageIncidentReport | null {
  const nested = isPlainObject(submission.report)
    ? submission.report
    : isPlainObject(submission.incidentReport)
      ? submission.incidentReport
      : isPlainObject(submission.incident_report)
        ? submission.incident_report
        : submission;

  const timeline =
    asNonEmptyString(nested.timeline) ??
    asNonEmptyString(nested.chronology) ??
    null;
  const rootCause =
    asNonEmptyString(nested.rootCause) ??
    asNonEmptyString(nested.root_cause) ??
    null;
  const remediation =
    asNonEmptyString(nested.remediation) ??
    asNonEmptyString(nested.resolution) ??
    asNonEmptyString(nested.actions) ??
    null;
  const prevention =
    asNonEmptyString(nested.prevention) ??
    asNonEmptyString(nested.followUp) ??
    asNonEmptyString(nested.follow_up) ??
    null;

  if (!timeline || !rootCause || !remediation || !prevention) {
    return null;
  }

  return { timeline, rootCause, remediation, prevention };
}

function configMeetsThreshold(result: ConfigDiffStructuredResult): boolean {
  return (
    result.totalCount > 0 &&
    result.percentage >= result.passThresholdPercent &&
    !result.reason
  );
}

function evaluateReportLengths(
  report: OutageIncidentReport,
  minLength: number
): {
  ok: boolean;
  lengths: OutageCapstoneStructuredResult['reportFieldLengths'];
  shortFields: string[];
} {
  const lengths = {
    timeline: report.timeline.length,
    rootCause: report.rootCause.length,
    remediation: report.remediation.length,
    prevention: report.prevention.length,
  };
  const shortFields = (
    [
      ['timeline', lengths.timeline],
      ['rootCause', lengths.rootCause],
      ['remediation', lengths.remediation],
      ['prevention', lengths.prevention],
    ] as const
  )
    .filter(([, len]) => len < minLength)
    .map(([name]) => name);

  return { ok: shortFields.length === 0, lengths, shortFields };
}

async function gradeIncidentReport(
  report: OutageIncidentReport,
  ticket: ScorableTicket,
  knobs: OutageCapstoneExpectedState,
  configSummary: string
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const query = [
    report.timeline,
    report.rootCause,
    report.remediation,
    report.prevention,
    configSummary,
  ].join('\n');

  const retrieved = retrieveIncidentReportRubric(query, {
    topK: knobs.topKGuidanceSections ?? 4,
    requiredSectionIds: knobs.guidanceTopics,
  });

  const prompt = buildIncidentReportGradingPrompt(retrieved, {
    ...report,
    scenarioBrief: ticket.scenario_brief,
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

function composeFeedback(parts: {
  configFeedback: string;
  reportOk: boolean;
  shortFields: string[];
  minLength: number;
  missingReport?: boolean;
  grading?: ClaudeGradingResult;
  ragNote?: string;
}): string {
  const chunks = [parts.configFeedback];

  if (parts.missingReport) {
    chunks.push(
      'Post-incident report is required with timeline, rootCause, remediation, and prevention.'
    );
  } else if (!parts.reportOk) {
    chunks.push(
      `Expand these report fields (min ${parts.minLength} chars): ${parts.shortFields.join(', ')}.`
    );
  }

  if (parts.grading) {
    chunks.push(`Incident report feedback: ${parts.grading.feedback}`);
    if (parts.grading.gaps.length > 0) {
      chunks.push(`Gaps: ${parts.grading.gaps.slice(0, 3).join(' ')}`);
    }
  } else if (parts.ragNote) {
    chunks.push(parts.ragNote);
  }

  return chunks.join('\n\n');
}

export const outageCapstoneTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const knobs = parseOutageCapstoneExpectedState(
      ticket.expected_state as Record<string, unknown>
    );
    const minReportFieldLength =
      typeof knobs.minReportFieldLength === 'number' &&
      knobs.minReportFieldLength > 0
        ? Math.floor(knobs.minReportFieldLength)
        : OUTAGE_CAPSTONE_MIN_REPORT_FIELD_LENGTH;

    const config = evaluateConfigDiff(submission, ticket);
    const configFeedback = deterministicFeedback(config);
    const remediationOk = configMeetsThreshold(config);

    const report = extractOutageIncidentReport(submission);
    const reportEval = report
      ? evaluateReportLengths(report, minReportFieldLength)
      : {
          ok: false,
          lengths: {
            timeline: 0,
            rootCause: 0,
            remediation: 0,
            prevention: 0,
          },
          shortFields: [
            'timeline',
            'rootCause',
            'remediation',
            'prevention',
          ] as string[],
        };

    const baseStructured: OutageCapstoneStructuredResult = {
      style: 'outage_capstone',
      config,
      remediationOk,
      reportOk: reportEval.ok,
      reportFieldLengths: reportEval.lengths,
      minReportFieldLength,
      shortReportFields: reportEval.shortFields,
      guidancePath: null,
      retrievedSectionIds: [],
    };

    // Primary gate: remediated guest state.
    if (!remediationOk) {
      return {
        status: 'needs_revision',
        structuredResult: {
          ...baseStructured,
          reason: config.reason ?? 'config_diff_below_threshold',
        },
        feedback: composeFeedback({
          configFeedback,
          reportOk: reportEval.ok,
          shortFields: reportEval.shortFields,
          minLength: minReportFieldLength,
          missingReport: !report,
        }),
      };
    }

    // Report presence + length before RAG.
    if (!report) {
      return {
        status: 'needs_revision',
        structuredResult: {
          ...baseStructured,
          reason: 'missing_incident_report',
        },
        feedback: composeFeedback({
          configFeedback,
          reportOk: false,
          shortFields: reportEval.shortFields,
          minLength: minReportFieldLength,
          missingReport: true,
        }),
      };
    }

    if (!reportEval.ok) {
      return {
        status: 'needs_revision',
        structuredResult: {
          ...baseStructured,
          reason: 'report_fields_too_short',
        },
        feedback: composeFeedback({
          configFeedback,
          reportOk: false,
          shortFields: reportEval.shortFields,
          minLength: minReportFieldLength,
        }),
      };
    }

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradeIncidentReport(report, ticket, knobs, configFeedback);

      const structured: OutageCapstoneStructuredResult = {
        ...baseStructured,
        guidancePath,
        retrievedSectionIds,
        grading: {
          finding_state: grading.finding_state,
          strengths: grading.strengths,
          gaps: grading.gaps,
        },
      };

      // Secondary hard gate: report quality must be satisfied.
      if (grading.finding_state === 'satisfied') {
        return {
          status: 'resolved',
          structuredResult: structured,
          feedback: composeFeedback({
            configFeedback,
            reportOk: true,
            shortFields: [],
            minLength: minReportFieldLength,
            grading,
          }),
        };
      }

      structured.reason = `report_grading_${grading.finding_state}`;
      return {
        status: 'needs_revision',
        structuredResult: structured,
        feedback: composeFeedback({
          configFeedback,
          reportOk: true,
          shortFields: [],
          minLength: minReportFieldLength,
          grading,
        }),
      };
    } catch (error) {
      if (error instanceof MissingAnthropicApiKeyError) {
        return {
          status: 'needs_revision',
          structuredResult: {
            ...baseStructured,
            reason: 'report_grading_unavailable_missing_api_key',
          },
          feedback: composeFeedback({
            configFeedback,
            reportOk: true,
            shortFields: [],
            minLength: minReportFieldLength,
            ragNote:
              'Remediation state checks passed, but AI grading of the post-incident report is unavailable (ANTHROPIC_API_KEY not configured). Ask an admin to enable grading, then resubmit — report quality is a hard gate for this capstone.',
          }),
        };
      }

      console.error('Outage capstone report RAG grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-06',
        operation: 'outage_capstone_report_rag_grade',
        ticketId: ticket.id,
        ticketType: ticket.ticket_type,
        level: 'warning',
      });

      return {
        status: 'needs_revision',
        structuredResult: {
          ...baseStructured,
          reason: 'report_grading_error',
        },
        feedback: composeFeedback({
          configFeedback,
          reportOk: true,
          shortFields: [],
          minLength: minReportFieldLength,
          ragNote:
            'Could not grade the post-incident report right now. Remediation state looked good — please try again shortly.',
        }),
      };
    }
  },
};
