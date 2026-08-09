import type { SupabaseClient } from '@supabase/supabase-js';

import {
  DEFAULT_AC_BRIEF_SOURCE_TICKET_TYPES,
  ticketTypeBase,
} from '@/lib/grc/ticketCodes';
import {
  parsePriorFindings,
  type PoamPriorFinding,
} from '@/lib/scoring/ticketUi';

/**
 * Load prior AUD-06 / CCCER findings for the audit-committee brief (AUD-07).
 *
 * Prefer the student's resolved findings_summary / cccer submissions on the
 * track; fall back to seeded `initial_state.prior_findings` so the ticket is
 * solvable standalone.
 */

export type CompiledPriorFinding = {
  id: string;
  title: string;
  summary: string;
  controlId?: string;
  source: 'findings_summary' | 'cccer' | 'seed' | 'portfolio' | 'unknown';
  ticketCode?: string | null;
  ticketId?: string | null;
  status?: string | null;
};

export type CompiledPriorFindingsPackage = {
  findings: CompiledPriorFinding[];
  source: 'prior_submission' | 'seed' | 'empty';
  sourceTicketTypes: string[];
  narrative: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function ticketCodeFromState(
  initialState: Record<string, unknown> | null | undefined
): string | null {
  if (!isPlainObject(initialState)) return null;
  return (
    asNonEmptyString(initialState.ticketCode) ??
    asNonEmptyString(initialState.ticket_code)
  );
}

function parseSourceTicketTypes(
  initialState: Record<string, unknown> | null | undefined
): string[] {
  if (!isPlainObject(initialState)) {
    return [...DEFAULT_AC_BRIEF_SOURCE_TICKET_TYPES];
  }
  const raw =
    initialState.sourceTicketTypes ??
    initialState.source_ticket_types ??
    initialState.priorTicketTypes;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_AC_BRIEF_SOURCE_TICKET_TYPES];
  }
  const types = raw
    .filter((t): t is string => typeof t === 'string')
    .map((t) => ticketTypeBase(t))
    .filter(Boolean);
  return types.length > 0 ? types : [...DEFAULT_AC_BRIEF_SOURCE_TICKET_TYPES];
}

function seedFindingsFromInitialState(
  initialState: Record<string, unknown> | null | undefined
): CompiledPriorFinding[] {
  const parsed = parsePriorFindings(initialState);
  return parsed.map((finding: PoamPriorFinding) => ({
    id: finding.id,
    title: finding.title?.trim() || finding.id,
    summary: finding.summary,
    controlId: finding.controlId,
    source: 'seed' as const,
    ticketCode: 'AUD-06',
    ticketId: null,
    status: 'seeded',
  }));
}

function extractCccerFinding(
  submission: Record<string, unknown>,
  ticket: { id: string; initial_state: Record<string, unknown> | null }
): CompiledPriorFinding | null {
  const condition = asNonEmptyString(submission.condition);
  const criteria = asNonEmptyString(submission.criteria);
  const cause = asNonEmptyString(submission.cause);
  const effect = asNonEmptyString(submission.effect);
  const recommendation = asNonEmptyString(submission.recommendation);
  if (!condition && !criteria && !cause && !effect && !recommendation) {
    return null;
  }

  const parts = [
    condition ? `Condition: ${condition}` : null,
    criteria ? `Criteria: ${criteria}` : null,
    cause ? `Cause: ${cause}` : null,
    effect ? `Effect: ${effect}` : null,
    recommendation ? `Recommendation: ${recommendation}` : null,
  ].filter((p): p is string => Boolean(p));

  const code = ticketCodeFromState(ticket.initial_state) ?? 'AUD-05';
  return {
    id: `${ticket.id}:cccer`,
    title: `CCCER exception (${code})`,
    summary: parts.join('\n'),
    source: 'cccer',
    ticketCode: code,
    ticketId: ticket.id,
  };
}

function extractFindingsSummaryFinding(
  submission: Record<string, unknown>,
  ticket: { id: string; initial_state: Record<string, unknown> | null }
): CompiledPriorFinding | null {
  const executiveSummary =
    asNonEmptyString(submission.executiveSummary) ??
    asNonEmptyString(submission.executive_summary);
  const findingsDetail =
    asNonEmptyString(submission.findingsDetail) ??
    asNonEmptyString(submission.findings_detail) ??
    asNonEmptyString(submission.findings);
  const recommendations = asNonEmptyString(submission.recommendations);

  if (!executiveSummary && !findingsDetail && !recommendations) {
    return null;
  }

  const parts = [
    executiveSummary ? `Executive summary: ${executiveSummary}` : null,
    findingsDetail ? `Findings detail: ${findingsDetail}` : null,
    recommendations ? `Recommendations: ${recommendations}` : null,
  ].filter((p): p is string => Boolean(p));

  const code = ticketCodeFromState(ticket.initial_state) ?? 'AUD-06';
  return {
    id: `${ticket.id}:findings_summary`,
    title: `Engagement findings (${code})`,
    summary: parts.join('\n\n'),
    source: 'findings_summary',
    ticketCode: code,
    ticketId: ticket.id,
  };
}

function extractFromSubmission(
  submission: Record<string, unknown>,
  ticketType: string,
  ticket: { id: string; initial_state: Record<string, unknown> | null }
): CompiledPriorFinding | null {
  const base = ticketTypeBase(ticketType);
  if (base === 'cccer' || base === 'audit_finding_cccer') {
    return extractCccerFinding(submission, ticket);
  }
  if (base === 'findings_summary' || base === 'engagement_findings') {
    return extractFindingsSummaryFinding(submission, ticket);
  }

  // Generic fallback: prior_findings array inside a submission payload.
  const nested = parsePriorFindings(submission);
  if (nested.length > 0) {
    return {
      id: `${ticket.id}:prior`,
      title: ticketCodeFromState(ticket.initial_state) ?? ticket.id.slice(0, 8),
      summary: nested
        .map((f) => `${f.title ?? f.id}: ${f.summary}`)
        .join('\n\n'),
      source: 'unknown',
      ticketCode: ticketCodeFromState(ticket.initial_state),
      ticketId: ticket.id,
    };
  }
  return null;
}

export function formatPriorFindingsNarrative(
  findings: CompiledPriorFinding[]
): string {
  if (findings.length === 0) {
    return '(No prior findings available.)';
  }
  return findings
    .map((finding, index) => {
      const header = [
        `${index + 1}. ${finding.title}`,
        finding.controlId ? `[${finding.controlId}]` : null,
        finding.ticketCode ? `(${finding.ticketCode})` : null,
      ]
        .filter(Boolean)
        .join(' ');
      return `${header}\n${finding.summary}`;
    })
    .join('\n\n');
}

export type CompilePriorFindingsInput = {
  supabase: SupabaseClient;
  studentId: string;
  trackId: string;
  initialState?: Record<string, unknown> | null;
};

/**
 * Compile prior AUD-06 / CCCER findings for the student, with seed fallback.
 */
export async function compilePriorAuditFindings(
  input: CompilePriorFindingsInput
): Promise<CompiledPriorFindingsPackage> {
  const sourceTicketTypes = parseSourceTicketTypes(input.initialState);
  const typeSet = new Set(sourceTicketTypes.map((t) => t.toLowerCase()));
  const seedFindings = seedFindingsFromInitialState(input.initialState);

  const { data: tickets, error: ticketsError } = await input.supabase
    .from('tickets')
    .select('id, ticket_type, scenario_brief, initial_state, sort_order')
    .eq('track_id', input.trackId);

  if (ticketsError) {
    // Prefer seed so the ticket remains solvable if ticket lookup fails.
    console.warn(
      '[compilePriorAuditFindings] tickets load:',
      ticketsError.message
    );
    return {
      findings: seedFindings,
      source: seedFindings.length > 0 ? 'seed' : 'empty',
      sourceTicketTypes,
      narrative: formatPriorFindingsNarrative(seedFindings),
    };
  }

  type TicketRow = {
    id: string;
    ticket_type: string;
    scenario_brief: string;
    initial_state: Record<string, unknown> | null;
    sort_order: number;
  };

  const matchingTickets = ((tickets ?? []) as Array<Record<string, unknown>>)
    .map((row): TicketRow => ({
      id: row.id as string,
      ticket_type: row.ticket_type as string,
      scenario_brief: (row.scenario_brief as string) ?? '',
      initial_state: isPlainObject(row.initial_state)
        ? row.initial_state
        : null,
      sort_order: typeof row.sort_order === 'number' ? row.sort_order : 0,
    }))
    .filter((t) => typeSet.has(ticketTypeBase(t.ticket_type)))
    .sort((a, b) => a.sort_order - b.sort_order);

  const ticketIds = matchingTickets.map((t) => t.id);
  const findings: CompiledPriorFinding[] = [];

  if (ticketIds.length > 0) {
    const { data: progress, error: progressError } = await input.supabase
      .from('ticket_progress')
      .select('ticket_id, status, submission')
      .eq('student_id', input.studentId)
      .in('ticket_id', ticketIds);

    if (progressError) {
      console.warn(
        '[compilePriorAuditFindings] progress load:',
        progressError.message
      );
    }

    const progressByTicket = new Map(
      (progress ?? []).map((row) => [
        row.ticket_id as string,
        {
          status: row.status as string,
          submission: isPlainObject(row.submission)
            ? (row.submission as Record<string, unknown>)
            : null,
        },
      ])
    );

    const { data: portfolioRows, error: portfolioError } = await input.supabase
      .from('portfolio_items')
      .select('ticket_id, structured_result, submission, score_status')
      .eq('student_id', input.studentId)
      .in('ticket_id', ticketIds);

    if (portfolioError) {
      console.warn(
        '[compilePriorAuditFindings] portfolio_items load:',
        portfolioError.message
      );
    }

    const portfolioByTicket = new Map<string, Record<string, unknown>>();
    for (const row of portfolioRows ?? []) {
      const ticketId = row.ticket_id as string | null;
      if (!ticketId) continue;
      const structured = isPlainObject(row.structured_result)
        ? row.structured_result
        : {};
      const submission = isPlainObject(row.submission) ? row.submission : {};
      portfolioByTicket.set(ticketId, { ...structured, ...submission });
    }

    for (const ticket of matchingTickets) {
      const progressRow = progressByTicket.get(ticket.id) ?? null;
      const portfolioPayload = portfolioByTicket.get(ticket.id) ?? null;
      const mergedSubmission: Record<string, unknown> | null =
        progressRow?.submission || portfolioPayload
          ? {
              ...(portfolioPayload ?? {}),
              ...(progressRow?.submission ?? {}),
            }
          : null;

      if (!mergedSubmission) continue;

      // Prefer resolved progress; still accept portfolio/in-progress content
      // when present so linked engagement work is visible.
      const extracted = extractFromSubmission(
        mergedSubmission,
        ticket.ticket_type,
        ticket
      );
      if (!extracted) continue;

      findings.push({
        ...extracted,
        status: progressRow?.status ?? 'portfolio',
        source:
          progressRow?.status === 'resolved' || portfolioPayload
            ? extracted.source === 'seed'
              ? 'portfolio'
              : extracted.source
            : extracted.source,
      });
    }
  }

  if (findings.length > 0) {
    return {
      findings,
      source: 'prior_submission',
      sourceTicketTypes,
      narrative: formatPriorFindingsNarrative(findings),
    };
  }

  return {
    findings: seedFindings,
    source: seedFindings.length > 0 ? 'seed' : 'empty',
    sourceTicketTypes,
    narrative: formatPriorFindingsNarrative(seedFindings),
  };
}

/** Pure helper for tests: seed-only package from initial_state. */
export function compileSeedPriorFindings(
  initialState: Record<string, unknown> | null | undefined
): CompiledPriorFindingsPackage {
  const findings = seedFindingsFromInitialState(initialState);
  return {
    findings,
    source: findings.length > 0 ? 'seed' : 'empty',
    sourceTicketTypes: parseSourceTicketTypes(initialState),
    narrative: formatPriorFindingsNarrative(findings),
  };
}
