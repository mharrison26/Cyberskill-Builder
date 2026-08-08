import {
  callClaudeGrading,
  MissingAnthropicApiKeyError,
  type ClaudeGradingResult,
} from '@/lib/grading/callClaudeGrading';
import { buildPoamGradingPrompt } from '@/lib/grading/buildPoamGradingPrompt';
import { retrievePoamGuidance } from '@/lib/nist/getPoamGuidance';
import { captureFeatureException } from '@/lib/observability/sentry';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * POA&M ticket scoring.
 *
 * Deterministic:
 *   - one entry per prior finding from initial_state
 *   - required fields present (weakness, milestone, date, status)
 *
 * RAG / LLM (F26 pattern):
 *   - retrieve pinned POA&M remediation guidance
 *   - narrative feedback on remediation plan quality (does not gate pass/fail)
 */

export const POAM_STATUSES = [
  'open',
  'ongoing',
  'completed',
  'delayed',
  'risk_accepted',
] as const;

export type PoamStatus = (typeof POAM_STATUSES)[number];

export const POAM_MIN_WEAKNESS_LENGTH = 20;
export const POAM_MIN_MILESTONE_LENGTH = 20;

export type PoamPriorFinding = {
  id: string;
  controlId?: string;
  title?: string;
  summary: string;
  findingState?: string;
};

export type PoamEntrySubmission = {
  findingId: string;
  weaknessDescription: string;
  milestone: string;
  scheduledCompletionDate: string;
  status: string;
};

export type PoamStructuredResult = {
  style: 'poam';
  requiredFindingIds: string[];
  submittedFindingIds: string[];
  missingFindingIds: string[];
  incompleteEntries: Array<{
    findingId: string;
    missing: string[];
  }>;
  invalidStatuses: string[];
  invalidDates: string[];
  entryCount: number;
  complete: boolean;
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

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isPoamTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return base === 'poam' || base === 'poam_draft';
}

export function isPoamStatus(value: string): value is PoamStatus {
  return (POAM_STATUSES as readonly string[]).includes(value);
}

export function parsePriorFindings(
  initialState: Record<string, unknown> | null | undefined
): PoamPriorFinding[] {
  if (!isPlainObject(initialState)) {
    return [];
  }

  const raw =
    initialState.prior_findings ??
    initialState.priorFindings ??
    initialState.findings;

  if (!Array.isArray(raw)) {
    return [];
  }

  const findings: PoamPriorFinding[] = [];

  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    const id =
      typeof item.id === 'string'
        ? item.id.trim()
        : typeof item.finding_id === 'string'
          ? item.finding_id.trim()
          : '';
    if (!id) continue;

    const summary =
      typeof item.summary === 'string'
        ? item.summary.trim()
        : typeof item.description === 'string'
          ? item.description.trim()
          : typeof item.observation === 'string'
            ? item.observation.trim()
            : '';

    findings.push({
      id,
      controlId:
        typeof item.control_id === 'string'
          ? item.control_id
          : typeof item.controlId === 'string'
            ? item.controlId
            : undefined,
      title: typeof item.title === 'string' ? item.title : undefined,
      summary,
      findingState:
        typeof item.finding_state === 'string'
          ? item.finding_state
          : typeof item.findingState === 'string'
            ? item.findingState
            : undefined,
    });
  }

  return findings;
}

function parseEntry(raw: unknown): PoamEntrySubmission | null {
  if (!isPlainObject(raw)) return null;

  const findingId =
    typeof raw.findingId === 'string'
      ? raw.findingId.trim()
      : typeof raw.finding_id === 'string'
        ? raw.finding_id.trim()
        : '';

  const weaknessDescription =
    typeof raw.weaknessDescription === 'string'
      ? raw.weaknessDescription.trim()
      : typeof raw.weakness_description === 'string'
        ? raw.weakness_description.trim()
        : '';

  const milestone =
    typeof raw.milestone === 'string' ? raw.milestone.trim() : '';

  const scheduledCompletionDate =
    typeof raw.scheduledCompletionDate === 'string'
      ? raw.scheduledCompletionDate.trim()
      : typeof raw.scheduled_completion_date === 'string'
        ? raw.scheduled_completion_date.trim()
        : '';

  const status =
    typeof raw.status === 'string' ? raw.status.trim().toLowerCase() : '';

  if (!findingId) return null;

  return {
    findingId,
    weaknessDescription,
    milestone,
    scheduledCompletionDate,
    status,
  };
}

export function extractPoamEntries(
  submission: TicketSubmission
): PoamEntrySubmission[] {
  const rawEntries = submission.entries ?? submission.poam_items ?? submission.items;
  if (!Array.isArray(rawEntries)) {
    return [];
  }

  const entries: PoamEntrySubmission[] = [];
  for (const raw of rawEntries) {
    const parsed = parseEntry(raw);
    if (parsed) entries.push(parsed);
  }
  return entries;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return date.toISOString().slice(0, 10) === value;
}

function entryMissingFields(entry: PoamEntrySubmission): string[] {
  const missing: string[] = [];
  if (!entry.weaknessDescription) missing.push('weakness_description');
  else if (entry.weaknessDescription.length < POAM_MIN_WEAKNESS_LENGTH) {
    missing.push('weakness_description_too_short');
  }

  if (!entry.milestone) missing.push('milestone');
  else if (entry.milestone.length < POAM_MIN_MILESTONE_LENGTH) {
    missing.push('milestone_too_short');
  }

  if (!entry.scheduledCompletionDate) missing.push('scheduled_completion_date');
  if (!entry.status) missing.push('status');
  return missing;
}

export function evaluatePoamCompleteness(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  entries: PoamEntrySubmission[];
  priorFindings: PoamPriorFinding[];
  structured: PoamStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const priorFindings = parsePriorFindings(ticket.initial_state);
  const requiredFindingIds = priorFindings.map((finding) => finding.id);
  const entries = extractPoamEntries(submission);

  const byFindingId = new Map<string, PoamEntrySubmission>();
  for (const entry of entries) {
    byFindingId.set(entry.findingId, entry);
  }

  const submittedFindingIds = Array.from(byFindingId.keys());
  const missingFindingIds = requiredFindingIds.filter(
    (id) => !byFindingId.has(id)
  );

  const incompleteEntries: PoamStructuredResult['incompleteEntries'] = [];
  const invalidStatuses: string[] = [];
  const invalidDates: string[] = [];

  for (const findingId of requiredFindingIds) {
    const entry = byFindingId.get(findingId);
    if (!entry) continue;

    const missing = entryMissingFields(entry);
    if (missing.length > 0) {
      incompleteEntries.push({ findingId, missing });
    }
    if (entry.status && !isPoamStatus(entry.status)) {
      invalidStatuses.push(findingId);
    }
    if (
      entry.scheduledCompletionDate &&
      !isValidIsoDate(entry.scheduledCompletionDate)
    ) {
      invalidDates.push(findingId);
    }
  }

  const complete =
    requiredFindingIds.length > 0 &&
    missingFindingIds.length === 0 &&
    incompleteEntries.length === 0 &&
    invalidStatuses.length === 0 &&
    invalidDates.length === 0;

  const structured: PoamStructuredResult = {
    style: 'poam',
    requiredFindingIds,
    submittedFindingIds,
    missingFindingIds,
    incompleteEntries,
    invalidStatuses,
    invalidDates,
    entryCount: entries.length,
    complete,
    guidancePath: null,
    retrievedSectionIds: [],
  };

  if (requiredFindingIds.length === 0) {
    structured.reason = 'missing_prior_findings';
    return {
      entries,
      priorFindings,
      structured,
      ok: false,
      feedback:
        'This POA&M ticket has no prior findings in initial_state. Ask an admin to seed prior_findings.',
    };
  }

  if (!complete) {
    structured.reason = 'incomplete';
    const parts: string[] = [];
    if (missingFindingIds.length > 0) {
      parts.push(`Missing POA&M entries for: ${missingFindingIds.join(', ')}.`);
    }
    if (incompleteEntries.length > 0) {
      parts.push(
        `Incomplete fields on: ${incompleteEntries
          .map((entry) => `${entry.findingId} (${entry.missing.join(', ')})`)
          .join('; ')}.`
      );
    }
    if (invalidStatuses.length > 0) {
      parts.push(
        `Invalid status on: ${invalidStatuses.join(', ')}. Use ${POAM_STATUSES.join(', ')}.`
      );
    }
    if (invalidDates.length > 0) {
      parts.push(
        `Invalid scheduled_completion_date on: ${invalidDates.join(', ')}. Use YYYY-MM-DD.`
      );
    }
    return {
      entries,
      priorFindings,
      structured,
      ok: false,
      feedback: parts.join(' ') || 'POA&M submission incomplete.',
    };
  }

  return {
    entries: requiredFindingIds.map((id) => byFindingId.get(id)!),
    priorFindings,
    structured,
    ok: true,
    feedback:
      'All required POA&M fields are present. Reviewing remediation plan quality against POA&M guidance…',
  };
}

function buildRemediationQuery(
  entries: PoamEntrySubmission[],
  priorFindings: PoamPriorFinding[]
): string {
  const priorById = new Map(priorFindings.map((f) => [f.id, f]));
  return entries
    .map((entry) => {
      const prior = priorById.get(entry.findingId);
      return [
        prior?.summary,
        entry.weaknessDescription,
        entry.milestone,
        entry.status,
      ]
        .filter(Boolean)
        .join(' ');
    })
    .join('\n');
}

async function gradePoamNarrative(
  entries: PoamEntrySubmission[],
  priorFindings: PoamPriorFinding[],
  ticket: ScorableTicket
): Promise<{
  grading: ClaudeGradingResult;
  retrievedSectionIds: string[];
  guidancePath: string;
}> {
  const query = buildRemediationQuery(entries, priorFindings);
  const retrieved = retrievePoamGuidance(query, { topK: 4 });
  const priorById = new Map(priorFindings.map((f) => [f.id, f]));

  const prompt = buildPoamGradingPrompt(retrieved, {
    scenarioBrief: ticket.scenario_brief,
    entries: entries.map((entry) => ({
      findingId: entry.findingId,
      findingSummary: priorById.get(entry.findingId)?.summary,
      weaknessDescription: entry.weaknessDescription,
      milestone: entry.milestone,
      scheduledCompletionDate: entry.scheduledCompletionDate,
      status: entry.status,
    })),
  });

  const grading = await callClaudeGrading(prompt);

  return {
    grading,
    retrievedSectionIds: retrieved.sections.map((section) => section.id),
    guidancePath: retrieved.catalogPath,
  };
}

function deterministicCompletenessFeedback(
  entryCount: number,
  grading?: ClaudeGradingResult
): string {
  const base = `Completeness checks passed for ${entryCount} POA&M entr${
    entryCount === 1 ? 'y' : 'ies'
  } (weakness, milestone, scheduled date, and status).`;
  if (!grading) {
    return base;
  }
  return `${base}\n\nRemediation quality feedback: ${grading.feedback}`;
}

export const poamTicketScorer: TicketScorer = {
  async score(submission, ticket): Promise<TicketScoreResult> {
    const completeness = evaluatePoamCompleteness(submission, ticket);

    if (!completeness.ok) {
      return {
        status: 'needs_revision',
        structuredResult: completeness.structured,
        feedback: completeness.feedback,
      };
    }

    try {
      const { grading, retrievedSectionIds, guidancePath } =
        await gradePoamNarrative(
          completeness.entries,
          completeness.priorFindings,
          ticket
        );

      const structured: PoamStructuredResult = {
        ...completeness.structured,
        guidancePath,
        retrievedSectionIds,
        grading: {
          finding_state: grading.finding_state,
          strengths: grading.strengths,
          gaps: grading.gaps,
        },
      };

      const gapHint =
        grading.gaps.length > 0
          ? `\nGaps to improve: ${grading.gaps.slice(0, 3).join(' ')}`
          : '';

      // Completeness gates resolve; RAG provides narrative quality feedback.
      return {
        status: 'resolved',
        structuredResult: structured,
        feedback: `${deterministicCompletenessFeedback(
          completeness.entries.length,
          grading
        )}${gapHint}`,
      };
    } catch (error) {
      if (error instanceof MissingAnthropicApiKeyError) {
        const structured: PoamStructuredResult = {
          ...completeness.structured,
          reason: 'rag_feedback_unavailable_missing_api_key',
        };
        return {
          status: 'resolved',
          structuredResult: structured,
          feedback: `${deterministicCompletenessFeedback(
            completeness.entries.length
          )} AI remediation-quality feedback is unavailable (ANTHROPIC_API_KEY not configured).`,
        };
      }

      console.error('POA&M RAG grading failed:', error);
      captureFeatureException(error, {
        feature: 'scoring',
        pi: 'PI-03',
        operation: 'poam_rag_grade',
        ticketId: ticket.id,
        ticketType: ticket.ticket_type,
        level: 'warning',
      });

      return {
        status: 'resolved',
        structuredResult: {
          ...completeness.structured,
          reason: 'rag_feedback_error',
        },
        feedback: `${deterministicCompletenessFeedback(
          completeness.entries.length
        )} Could not retrieve POA&M guidance feedback right now; completeness still passed.`,
      };
    }
  },
};
