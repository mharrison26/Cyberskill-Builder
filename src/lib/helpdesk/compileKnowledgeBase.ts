import type { SupabaseClient } from '@supabase/supabase-js';

import {
  DEFAULT_KB_SOURCE_TICKET_TYPES,
  ticketTypeBase,
} from '@/lib/helpdesk/ticketCodes';

/**
 * Compile a student's prior KB write-up submissions into a mini knowledge base
 * for the helpdesk Tier 3 capstone (HD-07 / PI-07).
 */

export type CompiledKbArticleStatus = 'present' | 'incomplete' | 'missing';

export type CompiledKbArticle = {
  ticketId: string;
  ticketType: string;
  ticketCode: string | null;
  title: string;
  status: CompiledKbArticleStatus;
  progressStatus: string | null;
  summary: string;
  /** Normalized KB fields for display / portfolio. */
  article: {
    problem: string;
    rootCause: string;
    resolutionSteps: string;
    preventionTip: string;
  } | null;
  textCorpus: string;
};

export type CompiledKnowledgeBase = {
  trackId: string;
  studentId: string;
  articles: CompiledKbArticle[];
  presentCount: number;
  /** True when presentCount >= minArticles. */
  complete: boolean;
  minArticles: number;
  sourceTicketTypes: string[];
  compiledAt: string;
};

type TicketRow = {
  id: string;
  ticket_type: string;
  scenario_brief: string;
  initial_state: Record<string, unknown> | null;
  sort_order: number;
};

type ProgressRow = {
  ticket_id: string;
  status: string;
  submission: Record<string, unknown> | null;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Local extractor — avoids importing scoring/kbWriteup (circular with scoring/index). */
function extractKbArticle(
  submission: Record<string, unknown>
): CompiledKbArticle['article'] {
  const problem = asNonEmptyString(submission.problem);
  const rootCause =
    asNonEmptyString(submission.rootCause) ??
    asNonEmptyString(submission.root_cause);
  const resolutionSteps =
    asNonEmptyString(submission.resolutionSteps) ??
    asNonEmptyString(submission.resolution_steps);
  const preventionTip =
    asNonEmptyString(submission.preventionTip) ??
    asNonEmptyString(submission.prevention_tip);

  if (!problem || !rootCause || !resolutionSteps || !preventionTip) {
    return null;
  }

  return { problem, rootCause, resolutionSteps, preventionTip };
}

export function parseKbSourceTicketTypes(
  initialState: Record<string, unknown> | null | undefined
): string[] {
  if (!isPlainObject(initialState)) {
    return [...DEFAULT_KB_SOURCE_TICKET_TYPES];
  }

  const raw =
    initialState.sourceTicketTypes ??
    initialState.source_ticket_types ??
    initialState.kbSourceTicketTypes;

  if (Array.isArray(raw)) {
    const types = raw
      .filter((t): t is string => typeof t === 'string')
      .map((t) => ticketTypeBase(t))
      .filter(Boolean);
    if (types.length > 0) return [...new Set(types)];
  }

  // Also accept GRC-style sourceArtifacts with ticketTypes arrays.
  const artifacts = initialState.sourceArtifacts;
  if (Array.isArray(artifacts)) {
    const types: string[] = [];
    for (const entry of artifacts) {
      if (!isPlainObject(entry)) continue;
      const ticketTypes = Array.isArray(entry.ticketTypes)
        ? entry.ticketTypes
        : Array.isArray(entry.ticket_types)
          ? entry.ticket_types
          : [];
      for (const t of ticketTypes) {
        if (typeof t === 'string' && t.trim()) {
          types.push(ticketTypeBase(t));
        }
      }
    }
    if (types.length > 0) return [...new Set(types)];
  }

  return [...DEFAULT_KB_SOURCE_TICKET_TYPES];
}

export function parseMinArticles(
  expectedState: Record<string, unknown> | null | undefined,
  initialState?: Record<string, unknown> | null
): number {
  const fromExpected =
    isPlainObject(expectedState) && typeof expectedState.minArticles === 'number'
      ? expectedState.minArticles
      : null;
  const fromInitial =
    isPlainObject(initialState) && typeof initialState.minArticles === 'number'
      ? initialState.minArticles
      : null;
  const value = fromExpected ?? fromInitial ?? 1;
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

function articleTitle(
  ticket: TicketRow,
  submission: Record<string, unknown> | null
): string {
  const fromInitial = isPlainObject(ticket.initial_state)
    ? asNonEmptyString(ticket.initial_state.title) ??
      asNonEmptyString(ticket.initial_state.ticketCode) ??
      asNonEmptyString(ticket.initial_state.ticket_code)
    : null;
  const fromSubmission = submission
    ? asNonEmptyString(submission.title)
    : null;
  if (fromSubmission) return fromSubmission;
  if (fromInitial) return fromInitial;
  const brief = ticket.scenario_brief.trim();
  if (brief) return brief.slice(0, 120);
  return `KB article (${ticket.id.slice(0, 8)})`;
}

function ticketCodeFromState(
  initialState: Record<string, unknown> | null
): string | null {
  if (!isPlainObject(initialState)) return null;
  return (
    asNonEmptyString(initialState.ticketCode) ??
    asNonEmptyString(initialState.ticket_code)
  );
}

function summarizeArticle(
  article: NonNullable<CompiledKbArticle['article']>
): string {
  const problem = article.problem.replace(/\s+/g, ' ').slice(0, 140);
  return `Problem: ${problem}${article.problem.length > 140 ? '…' : ''}`;
}

function articleCorpus(
  title: string,
  article: NonNullable<CompiledKbArticle['article']>
): string {
  return [
    `# ${title}`,
    '',
    '## Problem',
    article.problem,
    '',
    '## Root Cause',
    article.rootCause,
    '',
    '## Resolution Steps',
    article.resolutionSteps,
    '',
    '## Prevention Tip',
    article.preventionTip,
  ].join('\n');
}

export type CompileKnowledgeBaseInput = {
  supabase: SupabaseClient;
  studentId: string;
  trackId: string;
  initialState?: Record<string, unknown> | null;
  expectedState?: Record<string, unknown> | null;
};

/**
 * Load all prior KB write-up submissions on the track into one mini KB.
 */
export async function compileStudentKnowledgeBase(
  input: CompileKnowledgeBaseInput
): Promise<CompiledKnowledgeBase> {
  const sourceTicketTypes = parseKbSourceTicketTypes(input.initialState);
  const minArticles = parseMinArticles(input.expectedState, input.initialState);
  const typeSet = new Set(sourceTicketTypes.map((t) => t.toLowerCase()));

  const { data: tickets, error: ticketsError } = await input.supabase
    .from('tickets')
    .select('id, ticket_type, scenario_brief, initial_state, sort_order')
    .eq('track_id', input.trackId);

  if (ticketsError) {
    throw new Error(`Failed to load track tickets: ${ticketsError.message}`);
  }

  const matchingTickets = ((tickets ?? []) as Array<Record<string, unknown>>)
    .map(
      (row): TicketRow => ({
        id: row.id as string,
        ticket_type: row.ticket_type as string,
        scenario_brief: (row.scenario_brief as string) ?? '',
        initial_state: isPlainObject(row.initial_state)
          ? row.initial_state
          : null,
        sort_order:
          typeof row.sort_order === 'number' ? row.sort_order : 0,
      })
    )
    .filter((t) => typeSet.has(ticketTypeBase(t.ticket_type)))
    .sort((a, b) => a.sort_order - b.sort_order);

  const ticketIds = matchingTickets.map((t) => t.id);
  let progressRows: ProgressRow[] = [];

  if (ticketIds.length > 0) {
    const { data: progress, error: progressError } = await input.supabase
      .from('ticket_progress')
      .select('ticket_id, status, submission')
      .eq('student_id', input.studentId)
      .in('ticket_id', ticketIds);

    if (progressError) {
      throw new Error(
        `Failed to load ticket progress: ${progressError.message}`
      );
    }

    progressRows = (progress ?? []).map((row) => ({
      ticket_id: row.ticket_id as string,
      status: row.status as string,
      submission: isPlainObject(row.submission)
        ? (row.submission as Record<string, unknown>)
        : null,
    }));
  }

  const progressByTicket = new Map(
    progressRows.map((row) => [row.ticket_id, row])
  );

  const portfolioByTicket = new Map<string, Record<string, unknown>>();
  if (ticketIds.length > 0) {
    const { data: portfolioRows, error: portfolioError } = await input.supabase
      .from('portfolio_items')
      .select('ticket_id, structured_result, submission, score_status')
      .eq('student_id', input.studentId)
      .in('ticket_id', ticketIds);

    if (portfolioError) {
      console.warn(
        '[compileStudentKnowledgeBase] portfolio_items load:',
        portfolioError.message
      );
    } else {
      for (const row of portfolioRows ?? []) {
        const ticketId = row.ticket_id as string | null;
        if (!ticketId) continue;
        const structured = isPlainObject(row.structured_result)
          ? row.structured_result
          : {};
        const submission = isPlainObject(row.submission) ? row.submission : {};
        portfolioByTicket.set(ticketId, { ...structured, ...submission });
      }
    }
  }

  const articles: CompiledKbArticle[] = matchingTickets.map((ticket) => {
    const progress = progressByTicket.get(ticket.id) ?? null;
    const portfolioPayload = portfolioByTicket.get(ticket.id) ?? null;
    const mergedSubmission: Record<string, unknown> | null =
      progress?.submission || portfolioPayload
        ? {
            ...(portfolioPayload ?? {}),
            ...(progress?.submission ?? {}),
          }
        : null;

    const extracted = mergedSubmission
      ? extractKbArticle(mergedSubmission)
      : null;

    const title = articleTitle(ticket, mergedSubmission);
    const code = ticketCodeFromState(ticket.initial_state);
    const resolved = progress?.status === 'resolved';

    if (extracted && resolved) {
      return {
        ticketId: ticket.id,
        ticketType: ticket.ticket_type,
        ticketCode: code,
        title,
        status: 'present' as const,
        progressStatus: progress?.status ?? null,
        summary: summarizeArticle(extracted),
        article: {
          problem: extracted.problem,
          rootCause: extracted.rootCause,
          resolutionSteps: extracted.resolutionSteps,
          preventionTip: extracted.preventionTip,
        },
        textCorpus: articleCorpus(title, extracted),
      };
    }

    if (extracted || progress) {
      return {
        ticketId: ticket.id,
        ticketType: ticket.ticket_type,
        ticketCode: code,
        title,
        status: 'incomplete' as const,
        progressStatus: progress?.status ?? null,
        summary: extracted
          ? `${summarizeArticle(extracted)} (ticket not resolved yet)`
          : 'KB ticket started but article fields incomplete.',
        article: extracted
          ? {
              problem: extracted.problem,
              rootCause: extracted.rootCause,
              resolutionSteps: extracted.resolutionSteps,
              preventionTip: extracted.preventionTip,
            }
          : null,
        textCorpus: extracted ? articleCorpus(title, extracted) : '',
      };
    }

    return {
      ticketId: ticket.id,
      ticketType: ticket.ticket_type,
      ticketCode: code,
      title,
      status: 'missing' as const,
      progressStatus: null,
      summary: 'KB ticket found but not submitted.',
      article: null,
      textCorpus: '',
    };
  });

  const presentCount = articles.filter((a) => a.status === 'present').length;

  return {
    trackId: input.trackId,
    studentId: input.studentId,
    articles,
    presentCount,
    complete: presentCount >= minArticles,
    minArticles,
    sourceTicketTypes,
    compiledAt: new Date().toISOString(),
  };
}
