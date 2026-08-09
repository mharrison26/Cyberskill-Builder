import type { Ticket, TicketProgressStatus } from '@/types';

import {
  isClosedTicketStatus,
  normalizeTicketStatus,
} from '@/lib/tickets/status';

/** Lightweight engagement row used by console / ticket stage nav. */
export type EngagementSummary = {
  id: string;
  slug: string;
  title: string;
  scope: Record<string, unknown>;
  sort_order: number;
};

export type EngagementTicket = Pick<
  Ticket,
  | 'id'
  | 'ticket_type'
  | 'scenario_brief'
  | 'difficulty'
  | 'sla_minutes'
  | 'sort_order'
  | 'tier'
  | 'engagement_id'
  | 'engagement_stage'
> & {
  engagement_id: string;
  engagement_stage: number;
};

export type EngagementStageView = {
  ticket: EngagementTicket;
  stage: number;
  status: TicketProgressStatus;
  unlocked: boolean;
  href: string;
};

export type EngagementFlowView = {
  engagement: EngagementSummary;
  stages: EngagementStageView[];
  resolvedCount: number;
  totalCount: number;
  /** First unlocked unresolved stage, else last stage. */
  currentStage: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** True when a ticket belongs to a sequenced engagement. */
export function isEngagementTicket(
  ticket: Pick<Ticket, 'engagement_id' | 'engagement_stage'>
): ticket is EngagementTicket {
  return (
    typeof ticket.engagement_id === 'string' &&
    ticket.engagement_id.length > 0 &&
    typeof ticket.engagement_stage === 'number' &&
    Number.isFinite(ticket.engagement_stage) &&
    ticket.engagement_stage >= 1
  );
}

/**
 * Stage N is unlocked when N === 1, or stage N-1 progress is resolved/reviewed.
 * Preview / admin mode can force-unlock via `forceUnlock`.
 */
export function isEngagementStageUnlocked(
  stage: number,
  stages: Array<{ stage: number; status: TicketProgressStatus }>,
  options?: { forceUnlock?: boolean }
): boolean {
  if (options?.forceUnlock) return true;
  if (!Number.isFinite(stage) || stage < 1) return false;
  if (stage === 1) return true;

  const prior = stages.find((s) => s.stage === stage - 1);
  if (!prior) return false;
  return isClosedTicketStatus(normalizeTicketStatus(prior.status));
}

/** Sort engagement tickets by stage (then sort_order / id for stability). */
export function sortEngagementTickets<T extends EngagementTicket>(
  tickets: T[]
): T[] {
  return [...tickets].sort((a, b) => {
    if (a.engagement_stage !== b.engagement_stage) {
      return a.engagement_stage - b.engagement_stage;
    }
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return a.id.localeCompare(b.id);
  });
}

export function buildEngagementFlowView(args: {
  engagement: EngagementSummary;
  tickets: EngagementTicket[];
  progressByTicketId: Map<string, TicketProgressStatus | null | undefined>;
  trackSlug: string;
  forceUnlock?: boolean;
}): EngagementFlowView {
  const sorted = sortEngagementTickets(args.tickets).filter(
    (t) => t.engagement_id === args.engagement.id
  );

  const statusRows = sorted.map((ticket) => ({
    stage: ticket.engagement_stage,
    status: normalizeTicketStatus(args.progressByTicketId.get(ticket.id)),
  }));

  const stages: EngagementStageView[] = sorted.map((ticket) => {
    const status = normalizeTicketStatus(
      args.progressByTicketId.get(ticket.id)
    );
    const unlocked = isEngagementStageUnlocked(
      ticket.engagement_stage,
      statusRows,
      { forceUnlock: args.forceUnlock }
    );
    return {
      ticket,
      stage: ticket.engagement_stage,
      status,
      unlocked,
      href: `/tracks/${args.trackSlug}/tickets/${ticket.id}`,
    };
  });

  const resolvedCount = stages.filter(
    (s) => s.status === 'resolved' || s.status === 'reviewed'
  ).length;
  const firstOpen = stages.find(
    (s) => s.unlocked && s.status !== 'resolved' && s.status !== 'reviewed'
  );
  const currentStage =
    firstOpen?.stage ?? stages[stages.length - 1]?.stage ?? 1;

  return {
    engagement: {
      ...args.engagement,
      scope: asRecord(args.engagement.scope),
    },
    stages,
    resolvedCount,
    totalCount: stages.length,
    currentStage,
  };
}

/**
 * Partition track tickets into engagement flows + standalone tickets.
 * Standalone tickets keep their relative sort_order.
 */
export function groupTicketsByEngagement(args: {
  engagements: EngagementSummary[];
  tickets: Array<
    Pick<
      Ticket,
      | 'id'
      | 'ticket_type'
      | 'scenario_brief'
      | 'difficulty'
      | 'sla_minutes'
      | 'sort_order'
      | 'tier'
      | 'engagement_id'
      | 'engagement_stage'
    >
  >;
  progressByTicketId: Map<string, TicketProgressStatus | null | undefined>;
  trackSlug: string;
  forceUnlock?: boolean;
}): {
  flows: EngagementFlowView[];
  standalone: Array<(typeof args.tickets)[number]>;
} {
  const engagementById = new Map(
    args.engagements.map((e) => [e.id, e] as const)
  );

  const byEngagement = new Map<string, EngagementTicket[]>();
  const standalone: Array<(typeof args.tickets)[number]> = [];

  for (const ticket of args.tickets) {
    if (!isEngagementTicket(ticket)) {
      standalone.push(ticket);
      continue;
    }
    if (!engagementById.has(ticket.engagement_id)) {
      standalone.push(ticket);
      continue;
    }
    const list = byEngagement.get(ticket.engagement_id) ?? [];
    list.push(ticket);
    byEngagement.set(ticket.engagement_id, list);
  }

  const flows = args.engagements
    .slice()
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.title.localeCompare(b.title);
    })
    .map((engagement) => {
      const tickets = byEngagement.get(engagement.id) ?? [];
      return buildEngagementFlowView({
        engagement,
        tickets,
        progressByTicketId: args.progressByTicketId,
        trackSlug: args.trackSlug,
        forceUnlock: args.forceUnlock,
      });
    })
    .filter((flow) => flow.totalCount > 0);

  standalone.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id.localeCompare(b.id);
  });

  return { flows, standalone };
}

/** Human-readable scope lines for engagement headers. */
export function formatEngagementScopeLines(
  scope: Record<string, unknown>
): string[] {
  const lines: string[] = [];

  const company =
    (typeof scope.company === 'string' && scope.company.trim()) ||
    (typeof scope.client === 'string' && scope.client.trim()) ||
    null;
  const period =
    (typeof scope.period === 'string' && scope.period.trim()) ||
    (typeof scope.auditPeriod === 'string' && scope.auditPeriod.trim()) ||
    null;
  const system =
    (typeof scope.system === 'string' && scope.system.trim()) ||
    (typeof scope.systems === 'string' && scope.systems.trim()) ||
    null;

  if (company) lines.push(`Company: ${company}`);
  if (period) lines.push(`Period: ${period}`);
  if (system) lines.push(`System: ${system}`);

  const processes = scope.inScopeProcesses ?? scope.in_scope_processes;
  if (Array.isArray(processes)) {
    const labels = processes
      .map((p) => {
        if (typeof p === 'string') return p.trim();
        if (p && typeof p === 'object' && !Array.isArray(p)) {
          const rec = p as Record<string, unknown>;
          if (typeof rec.name === 'string') return rec.name.trim();
          if (typeof rec.label === 'string') return rec.label.trim();
        }
        return '';
      })
      .filter(Boolean);
    if (labels.length > 0) {
      lines.push(`In-scope processes: ${labels.join(', ')}`);
    }
  }

  const itgcs = scope.inScopeItgcs ?? scope.in_scope_itgcs ?? scope.itgcs;
  if (Array.isArray(itgcs)) {
    const labels = itgcs
      .map((p) => {
        if (typeof p === 'string') return p.trim();
        if (p && typeof p === 'object' && !Array.isArray(p)) {
          const rec = p as Record<string, unknown>;
          if (typeof rec.name === 'string') return rec.name.trim();
          if (typeof rec.id === 'string') return rec.id.trim();
        }
        return '';
      })
      .filter(Boolean);
    if (labels.length > 0) {
      lines.push(`In-scope ITGCs: ${labels.join(', ')}`);
    }
  }

  if (
    typeof scope.summary === 'string' &&
    scope.summary.trim() &&
    lines.length === 0
  ) {
    lines.push(scope.summary.trim());
  }

  return lines;
}
