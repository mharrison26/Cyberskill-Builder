import type { MockTrackTicket, Ticket, TicketProgressStatus } from '@/types';
import { resolveTicketDisplayTitle } from '@/lib/tickets/displayTitle';
import { resolveConsoleControlMeta } from '@/lib/tickets/resolveControlMeta';
import { normalizeTicketStatus } from '@/lib/tickets/status';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asSeverity(value: unknown): MockTrackTicket['severity'] | undefined {
  if (
    value === 'critical' ||
    value === 'high' ||
    value === 'medium' ||
    value === 'low'
  ) {
    return value;
  }
  return undefined;
}

function inferQueueBucket(
  status: TicketProgressStatus,
  difficulty: string | null | undefined
): MockTrackTicket['queueBucket'] {
  const d = (difficulty ?? '').toLowerCase();
  if (d === 'critical' || d === 'p1') return 'escalated';
  if (status === 'new') return 'unassigned';
  return 'my_queue';
}

/**
 * Map a DB ticket + progress into the console MockTrackTicket shape.
 * Pulls optional UI fields from initial_state when present.
 */
export function mapTicketToConsoleTicket(args: {
  ticket: Ticket;
  trackSlug: string;
  status?: string | null;
  startedAt?: string | null;
  resolvedAt?: string | null;
  slaDueAt?: string | null;
  slaMet?: boolean | null;
}): MockTrackTicket {
  const { ticket, trackSlug } = args;
  const status = normalizeTicketStatus(args.status);
  const state = asRecord(ticket.initial_state);
  const meta = asRecord(state.meta);

  const title = resolveTicketDisplayTitle(ticket);
  const scenarioBrief = ticket.scenario_brief?.trim() || undefined;

  const { controlId, controlFamily } = resolveConsoleControlMeta({
    ticketType: ticket.ticket_type,
    initialState: state,
  });

  const hostname =
    asString(state.hostname) ?? asString(state.host) ?? asString(meta.hostname);

  const requester =
    asString(state.requester) ??
    asString(state.requester_name) ??
    asString(meta.requester);

  const systemName =
    asString(state.system_name) ??
    asString(state.systemName) ??
    asString(meta.system_name);

  const engagementTitle =
    asString(state.engagement_title) ??
    asString(state.engagementTitle) ??
    asString(meta.engagement_title);

  const labelsRaw = state.labels ?? meta.labels;
  const labels = Array.isArray(labelsRaw)
    ? labelsRaw.filter((v): v is string => typeof v === 'string')
    : undefined;

  const ticketType =
    typeof ticket.ticket_type === 'string' && ticket.ticket_type.trim()
      ? ticket.ticket_type
      : 'ticket';
  const difficulty =
    typeof ticket.difficulty === 'string' && ticket.difficulty.trim()
      ? ticket.difficulty
      : 'medium';

  return {
    id: ticket.id,
    trackSlug,
    title,
    scenarioBrief,
    subtitle: asString(state.subtitle) ?? ticketType.replace(/_/g, ' '),
    ticketType,
    difficulty,
    slaMinutes:
      typeof ticket.sla_minutes === 'number' &&
      Number.isFinite(ticket.sla_minutes)
        ? ticket.sla_minutes
        : 45,
    startedAt: args.startedAt ?? null,
    resolvedAt: args.resolvedAt ?? null,
    slaDueAt: args.slaDueAt ?? null,
    slaMet: typeof args.slaMet === 'boolean' ? args.slaMet : null,
    status,
    controlFamily,
    controlId,
    tier: typeof ticket.tier === 'number' ? ticket.tier : undefined,
    // Severity is finding risk only — never fall back to lesson difficulty
    // (easy/medium/hard), which is a separate training axis.
    // Missing severity stays undefined → console "Unrated" (see openBySeverity).
    severity: asSeverity(state.severity) ?? asSeverity(meta.severity),
    poamDueAt: asString(state.poam_due_at) ?? asString(state.poamDueAt) ?? null,
    requester,
    queueBucket:
      (asString(state.queue_bucket) as MockTrackTicket['queueBucket']) ??
      inferQueueBucket(status, difficulty),
    hostname,
    engagementTitle,
    systemName,
    packageStage: asString(state.package_stage) ?? asString(state.packageStage),
    labels,
    dcwfCode: ticket.dcwf_code,
    sortOrder: ticket.sort_order,
    source: 'live',
    workbenchHref: `/tracks/${trackSlug}/tickets/${ticket.id}`,
    initialState: asRecord(ticket.initial_state),
    expectedState: asRecord(ticket.expected_state),
  };
}
