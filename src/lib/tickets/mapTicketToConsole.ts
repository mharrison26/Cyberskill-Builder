import type { MockTrackTicket, Ticket, TicketProgressStatus } from '@/types';
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
  difficulty: string
): MockTrackTicket['queueBucket'] {
  const d = difficulty.toLowerCase();
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
}): MockTrackTicket {
  const { ticket, trackSlug } = args;
  const status = normalizeTicketStatus(args.status);
  const state = asRecord(ticket.initial_state);
  const scenario = asRecord(state.scenario);
  const meta = asRecord(state.meta);

  const title =
    asString(state.title) ?? asString(scenario.title) ?? ticket.scenario_brief;

  const controlId =
    asString(state.control_id) ??
    asString(state.controlId) ??
    asString(meta.control_id);

  const controlFamily =
    asString(state.control_family) ??
    asString(state.controlFamily) ??
    asString(meta.control_family);

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

  return {
    id: ticket.id,
    trackSlug,
    title,
    subtitle: asString(state.subtitle) ?? ticket.ticket_type.replace(/_/g, ' '),
    ticketType: ticket.ticket_type,
    difficulty: ticket.difficulty,
    slaMinutes: ticket.sla_minutes,
    startedAt: args.startedAt ?? null,
    status,
    controlFamily,
    controlId,
    // Severity is finding risk only — never fall back to lesson difficulty
    // (easy/medium/hard), which is a separate training axis.
    severity: asSeverity(state.severity) ?? asSeverity(meta.severity),
    poamDueAt: asString(state.poam_due_at) ?? asString(state.poamDueAt) ?? null,
    requester,
    queueBucket:
      (asString(state.queue_bucket) as MockTrackTicket['queueBucket']) ??
      inferQueueBucket(status, ticket.difficulty),
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
