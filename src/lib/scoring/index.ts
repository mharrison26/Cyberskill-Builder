import type { CCCERValues, Ticket } from '@/types';
import { configDiffTicketScorer } from '@/lib/scoring/configDiff';

/**
 * Pluggable ticket scoring.
 *
 * Tracks register a scorer per `ticket.ticket_type`:
 *
 *   import { registerTicketScorer } from '@/lib/scoring';
 *   registerTicketScorer('my_track.config_diff', myScorer);
 *
 * Builtin scorers (config_remediation / config_diff, cccer, hybrid) register at
 * module load. Unregistered types fall back to `defaultTicketScorer`.
 */

export { configDiffTicketScorer } from '@/lib/scoring/configDiff';
export type {
  ConfigDiffRule,
  ConfigDiffRuleResult,
  ConfigDiffStructuredResult,
  ExpectedState,
} from '@/lib/scoring/configDiff';

/** Outcome of scoring — maps onto ticket_progress in the submit route. */
export type TicketScoreStatus = 'resolved' | 'needs_revision';

/** Generic submission payload; track-specific scorers narrow as needed. */
export type TicketSubmission = Record<string, unknown>;

export type TicketScoreResult = {
  status: TicketScoreStatus;
  structuredResult: Record<string, unknown>;
  feedback: string;
};

/** Ticket fields scorers may rely on (matches public.tickets). */
export type ScorableTicket = Pick<
  Ticket,
  | 'id'
  | 'tenant_id'
  | 'track_id'
  | 'tier'
  | 'ticket_type'
  | 'difficulty'
  | 'sla_minutes'
  | 'scenario_brief'
  | 'initial_state'
  | 'expected_state'
  | 'dcwf_code'
  | 'sort_order'
>;

export interface TicketScorer {
  score(
    submission: TicketSubmission,
    ticket: ScorableTicket
  ): TicketScoreResult | Promise<TicketScoreResult>;
}

const scorers = new Map<string, TicketScorer>();

export function registerTicketScorer(
  ticketType: string,
  scorer: TicketScorer
): void {
  const key = ticketType.trim();
  if (!key) {
    throw new Error('ticketType is required to register a scorer');
  }
  scorers.set(key, scorer);
}

export function getTicketScorer(ticketType: string): TicketScorer | undefined {
  return scorers.get(ticketType.trim());
}

/** Resolve a scorer for `ticket_type`, falling back to the default stub. */
export function resolveTicketScorer(ticketType: string): TicketScorer {
  return getTicketScorer(ticketType) ?? defaultTicketScorer;
}

export function listRegisteredTicketTypes(): string[] {
  return Array.from(scorers.keys()).sort();
}

/** Map scorer outcome → ticket_progress.status (`new` | `in_progress` | `resolved`). */
export function scoreStatusToProgressStatus(
  status: TicketScoreStatus
): 'in_progress' | 'resolved' {
  return status === 'resolved' ? 'resolved' : 'in_progress';
}

// ---------------------------------------------------------------------------
// Builtin / stub scorers
// ---------------------------------------------------------------------------

const CCCER_KEYS: (keyof CCCERValues)[] = [
  'condition',
  'criteria',
  'cause',
  'effect',
  'recommendation',
];

/** Thin CCCER/RAG-style stub: validates narrative fields are present (no LLM call). */
export const cccerTicketScorer: TicketScorer = {
  score(submission) {
    const missing: string[] = [];
    const lengths: Record<string, number> = {};

    for (const key of CCCER_KEYS) {
      const value = submission[key];
      if (typeof value !== 'string' || !value.trim()) {
        missing.push(key);
        lengths[key] = 0;
      } else {
        lengths[key] = value.trim().length;
      }
    }

    if (missing.length > 0) {
      return {
        status: 'needs_revision',
        structuredResult: {
          style: 'cccer',
          missing,
          lengths,
        },
        feedback: `CCCER submission incomplete. Missing: ${missing.join(', ')}.`,
      };
    }

    const tooShort = CCCER_KEYS.filter((key) => lengths[key] < 20);
    if (tooShort.length > 0) {
      return {
        status: 'needs_revision',
        structuredResult: {
          style: 'cccer',
          tooShort,
          lengths,
        },
        feedback: `Expand these CCCER fields (min 20 chars): ${tooShort.join(', ')}.`,
      };
    }

    return {
      status: 'resolved',
      structuredResult: {
        style: 'cccer',
        lengths,
        note: 'Stub scorer — replace with RAG/LLM grading for production.',
      },
      feedback:
        'CCCER narrative accepted by stub scorer. Replace with track-specific RAG grading when ready.',
    };
  },
};

function hasConfigDiffTarget(ticket: ScorableTicket): boolean {
  const expected = ticket.expected_state;
  if (
    expected &&
    typeof expected === 'object' &&
    Array.isArray((expected as { rules?: unknown }).rules) &&
    ((expected as { rules: unknown[] }).rules?.length ?? 0) > 0
  ) {
    return true;
  }
  const nested = ticket.initial_state?.expected_state;
  if (
    nested &&
    typeof nested === 'object' &&
    Array.isArray((nested as { rules?: unknown }).rules) &&
    ((nested as { rules: unknown[] }).rules?.length ?? 0) > 0
  ) {
    return true;
  }
  return ticket.initial_state?.expected_config !== undefined;
}

function hasConfigDiffSubmission(submission: TicketSubmission): boolean {
  return (
    submission.files !== undefined ||
    submission.filesystem !== undefined ||
    submission.config !== undefined ||
    submission.final_config !== undefined ||
    submission.final_state !== undefined
  );
}

/** Hybrid stub: config-diff when a ruleset/expected_config exists, else CCCER stub. */
export const hybridTicketScorer: TicketScorer = {
  async score(submission, ticket) {
    const canScoreConfig = hasConfigDiffTarget(ticket);
    const hasConfigPayload = hasConfigDiffSubmission(submission);

    if (canScoreConfig && hasConfigPayload) {
      const configResult = await configDiffTicketScorer.score(
        submission,
        ticket
      );
      const narrativeResult = await cccerTicketScorer.score(submission, ticket);

      const bothResolved =
        configResult.status === 'resolved' &&
        narrativeResult.status === 'resolved';

      return {
        status: bothResolved ? 'resolved' : 'needs_revision',
        structuredResult: {
          style: 'hybrid',
          config: configResult.structuredResult,
          narrative: narrativeResult.structuredResult,
        },
        feedback: [configResult.feedback, narrativeResult.feedback].join(' '),
      };
    }

    if (canScoreConfig) {
      return configDiffTicketScorer.score(submission, ticket);
    }

    return cccerTicketScorer.score(submission, ticket);
  },
};

/** Fallback when no scorer is registered for the ticket_type. */
export const defaultTicketScorer: TicketScorer = {
  score(submission, ticket) {
    const keys = Object.keys(submission);
    if (keys.length === 0) {
      return {
        status: 'needs_revision',
        structuredResult: {
          style: 'default',
          reason: 'empty_submission',
          ticketType: ticket.ticket_type,
        },
        feedback:
          'Submission was empty. Provide work for this ticket and resubmit.',
      };
    }

    return {
      status: 'needs_revision',
      structuredResult: {
        style: 'default',
        reason: 'unregistered_ticket_type',
        ticketType: ticket.ticket_type,
        submissionKeys: keys,
      },
      feedback: `No scorer registered for ticket_type "${ticket.ticket_type}". Submission recorded; register a track scorer via registerTicketScorer().`,
    };
  },
};

// Register builtin scorers under common ticket_type keys.
registerTicketScorer('config_remediation', configDiffTicketScorer);
registerTicketScorer('config_diff', configDiffTicketScorer);
registerTicketScorer('cccer', cccerTicketScorer);
registerTicketScorer('hybrid', hybridTicketScorer);
