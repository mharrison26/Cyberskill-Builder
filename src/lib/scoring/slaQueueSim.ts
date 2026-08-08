import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import { isTriagePriority, type TriagePriority } from '@/lib/scoring/ticketUi';
import {
  computeSlaCompliancePercent,
  wasResolvedWithinSla,
  type SlaResolutionInput,
} from '@/lib/tickets/sla';

/**
 * Timed multi-ticket queue simulation (PI-09).
 *
 * One parent ticket embeds a batch of mini-tickets in `initial_state.items`.
 * The student starts a shared clock, works each item (priority + category +
 * resolution), then submits the whole batch as a single structured result.
 *
 * Scoring = SLA compliance % across the batch AND triage/resolution correctness %.
 */

export const SLA_QUEUE_SIM_TICKET_TYPES = [
  'sla_queue_sim',
  'queue_simulation',
  'timed_queue',
  'multi_ticket_sim',
] as const;

export type SlaQueueSimTicketType = (typeof SLA_QUEUE_SIM_TICKET_TYPES)[number];

export type SlaQueueSimItem = {
  id: string;
  subject: string;
  body: string;
  requester?: string;
  /** Display hint for PriorityBadge (critical/high/medium/low or P1–P4). */
  difficulty?: string;
  slaMinutes: number;
  categoryOptions?: string[];
  resolutionOptions: Array<{ id: string; label: string }>;
};

export type SlaQueueSimExpectedItem = {
  expectedPriority: TriagePriority;
  expectedCategory: string;
  expectedResolution: string;
};

export type SlaQueueSimExpectedState = {
  items?: Record<string, SlaQueueSimExpectedItem>;
  /** Minimum SLA compliance % to pass (default 80). */
  passSlaCompliancePercent?: number;
  /** Minimum triage/resolution correctness % to pass (default 80). */
  passCorrectnessPercent?: number;
  /** Weight for overallScore (default 0.5). Pair with correctnessWeight. */
  slaWeight?: number;
  correctnessWeight?: number;
};

export type SlaQueueSimItemSubmission = {
  id: string;
  priority: TriagePriority;
  category: string;
  resolution: string;
  resolvedAt: string;
};

export type SlaQueueSimSubmission = {
  type?: string;
  simulationStartedAt: string;
  items: SlaQueueSimItemSubmission[];
};

export type SlaQueueSimItemResult = {
  id: string;
  priorityMatch: boolean;
  categoryMatch: boolean;
  resolutionMatch: boolean;
  correct: boolean;
  withinSla: boolean | null;
  expectedPriority: TriagePriority | null;
  expectedCategory: string | null;
  expectedResolution: string | null;
  submittedPriority: TriagePriority | null;
  submittedCategory: string | null;
  submittedResolution: string | null;
};

export type SlaQueueSimStructuredResult = {
  style: 'sla_queue_sim';
  itemCount: number;
  submittedCount: number;
  correctCount: number;
  correctnessPercent: number;
  slaCompliancePercent: number | null;
  overallScore: number | null;
  passSlaCompliancePercent: number;
  passCorrectnessPercent: number;
  slaPass: boolean;
  correctnessPass: boolean;
  items: SlaQueueSimItemResult[];
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isSlaQueueSimTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (SLA_QUEUE_SIM_TICKET_TYPES as readonly string[]).includes(base);
}

function normalizePriority(value: unknown): TriagePriority | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim().toUpperCase().replace(/\s+/g, '');
  if (isTriagePriority(raw)) return raw;
  const digit = raw.match(/^(?:P|PRIORITY)?([1-4])$/);
  if (digit) {
    const mapped = `P${digit[1]}` as TriagePriority;
    return isTriagePriority(mapped) ? mapped : null;
  }
  return null;
}

function normalizeCategory(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, '_');
  return trimmed || null;
}

function normalizeResolution(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, '_');
  return trimmed || null;
}

function parseResolutionOptions(
  raw: unknown
): Array<{ id: string; label: string }> {
  if (!Array.isArray(raw)) return [];
  const options: Array<{ id: string; label: string }> = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && entry.trim()) {
      const id = entry.trim().toLowerCase().replace(/\s+/g, '_');
      options.push({ id, label: entry.trim().replace(/_/g, ' ') });
      continue;
    }
    if (!isPlainObject(entry)) continue;
    const id =
      typeof entry.id === 'string'
        ? entry.id.trim().toLowerCase().replace(/\s+/g, '_')
        : typeof entry.value === 'string'
          ? entry.value.trim().toLowerCase().replace(/\s+/g, '_')
          : '';
    if (!id) continue;
    const label =
      typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : id.replace(/_/g, ' ');
    options.push({ id, label });
  }
  return options;
}

export function parseSlaQueueSimItems(
  initialState: Record<string, unknown> | null | undefined
): SlaQueueSimItem[] {
  if (!isPlainObject(initialState)) return [];

  const raw =
    initialState.items ?? initialState.queueItems ?? initialState.queue;
  if (!Array.isArray(raw)) return [];

  const items: SlaQueueSimItem[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const id =
      typeof entry.id === 'string'
        ? entry.id.trim()
        : typeof entry.ticketId === 'string'
          ? entry.ticketId.trim()
          : '';
    if (!id) continue;

    const subject =
      typeof entry.subject === 'string' && entry.subject.trim()
        ? entry.subject.trim()
        : typeof entry.title === 'string' && entry.title.trim()
          ? entry.title.trim()
          : 'Untitled queue item';

    const body =
      typeof entry.body === 'string'
        ? entry.body
        : typeof entry.description === 'string'
          ? entry.description
          : typeof entry.message === 'string'
            ? entry.message
            : '';

    const slaRaw = entry.slaMinutes ?? entry.sla_minutes ?? entry.sla;
    const slaMinutes =
      typeof slaRaw === 'number' && Number.isFinite(slaRaw) && slaRaw >= 0
        ? slaRaw
        : typeof slaRaw === 'string' && Number.isFinite(Number(slaRaw))
          ? Math.max(0, Number(slaRaw))
          : 15;

    let categoryOptions: string[] | undefined;
    const rawCats = entry.categoryOptions ?? entry.categories;
    if (Array.isArray(rawCats)) {
      const opts = rawCats
        .map((c) => normalizeCategory(c))
        .filter((c): c is string => Boolean(c));
      if (opts.length > 0) categoryOptions = opts;
    }

    const resolutionOptions = parseResolutionOptions(
      entry.resolutionOptions ?? entry.resolutions ?? entry.actions
    );

    items.push({
      id,
      subject,
      body,
      requester:
        typeof entry.requester === 'string'
          ? entry.requester.trim()
          : typeof entry.requesterName === 'string'
            ? entry.requesterName.trim()
            : undefined,
      difficulty:
        typeof entry.difficulty === 'string'
          ? entry.difficulty.trim()
          : typeof entry.priorityHint === 'string'
            ? entry.priorityHint.trim()
            : undefined,
      slaMinutes,
      categoryOptions,
      resolutionOptions,
    });
  }

  return items;
}

export function parseSlaQueueSimExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): SlaQueueSimExpectedState {
  if (!isPlainObject(expectedState)) return {};

  const items: Record<string, SlaQueueSimExpectedItem> = {};
  const rawItems = expectedState.items ?? expectedState.expectedItems;
  if (isPlainObject(rawItems)) {
    for (const [id, value] of Object.entries(rawItems)) {
      if (!isPlainObject(value)) continue;
      const expectedPriority = normalizePriority(
        value.expectedPriority ?? value.priority ?? value.expected_priority
      );
      const expectedCategory = normalizeCategory(
        value.expectedCategory ?? value.category ?? value.expected_category
      );
      const expectedResolution = normalizeResolution(
        value.expectedResolution ??
          value.resolution ??
          value.expected_resolution ??
          value.action
      );
      if (!expectedPriority || !expectedCategory || !expectedResolution) {
        continue;
      }
      items[id.trim()] = {
        expectedPriority,
        expectedCategory,
        expectedResolution,
      };
    }
  }

  const passSla =
    expectedState.passSlaCompliancePercent ?? expectedState.passSla;
  const passCorrect =
    expectedState.passCorrectnessPercent ?? expectedState.passCorrectness;
  const slaWeight = expectedState.slaWeight;
  const correctnessWeight = expectedState.correctnessWeight;

  return {
    items: Object.keys(items).length > 0 ? items : undefined,
    passSlaCompliancePercent:
      typeof passSla === 'number' && Number.isFinite(passSla)
        ? Math.min(100, Math.max(0, passSla))
        : undefined,
    passCorrectnessPercent:
      typeof passCorrect === 'number' && Number.isFinite(passCorrect)
        ? Math.min(100, Math.max(0, passCorrect))
        : undefined,
    slaWeight:
      typeof slaWeight === 'number' && Number.isFinite(slaWeight)
        ? slaWeight
        : undefined,
    correctnessWeight:
      typeof correctnessWeight === 'number' &&
      Number.isFinite(correctnessWeight)
        ? correctnessWeight
        : undefined,
  };
}

export function extractSlaQueueSimSubmission(
  submission: TicketSubmission
): SlaQueueSimSubmission | null {
  const startedAt =
    typeof submission.simulationStartedAt === 'string'
      ? submission.simulationStartedAt
      : typeof submission.startedAt === 'string'
        ? submission.startedAt
        : null;
  if (!startedAt || Number.isNaN(new Date(startedAt).getTime())) {
    return null;
  }

  const rawItems = submission.items ?? submission.queueItems;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return null;
  }

  const items: SlaQueueSimItemSubmission[] = [];
  for (const entry of rawItems) {
    if (!isPlainObject(entry)) continue;
    const id =
      typeof entry.id === 'string'
        ? entry.id.trim()
        : typeof entry.ticketId === 'string'
          ? entry.ticketId.trim()
          : '';
    const priority = normalizePriority(entry.priority);
    const category = normalizeCategory(entry.category);
    const resolution = normalizeResolution(
      entry.resolution ?? entry.action ?? entry.resolutionId
    );
    const resolvedAt =
      typeof entry.resolvedAt === 'string'
        ? entry.resolvedAt
        : typeof entry.resolved_at === 'string'
          ? entry.resolved_at
          : null;

    if (!id || !priority || !category || !resolution || !resolvedAt) continue;
    if (Number.isNaN(new Date(resolvedAt).getTime())) continue;

    items.push({ id, priority, category, resolution, resolvedAt });
  }

  if (items.length === 0) return null;

  return {
    type:
      typeof submission.type === 'string' ? submission.type : 'sla_queue_sim',
    simulationStartedAt: startedAt,
    items,
  };
}

function clampWeight(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
}

export function evaluateSlaQueueSim(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: SlaQueueSimSubmission | null;
  structured: SlaQueueSimStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const queueItems = parseSlaQueueSimItems(
    ticket.initial_state as Record<string, unknown>
  );
  const expected = parseSlaQueueSimExpectedState(ticket.expected_state);
  const passSlaCompliancePercent = expected.passSlaCompliancePercent ?? 80;
  const passCorrectnessPercent = expected.passCorrectnessPercent ?? 80;
  const slaWeight = clampWeight(expected.slaWeight, 0.5);
  const correctnessWeight = clampWeight(expected.correctnessWeight, 0.5);

  const baseStructured: SlaQueueSimStructuredResult = {
    style: 'sla_queue_sim',
    itemCount: queueItems.length,
    submittedCount: 0,
    correctCount: 0,
    correctnessPercent: 0,
    slaCompliancePercent: null,
    overallScore: null,
    passSlaCompliancePercent,
    passCorrectnessPercent,
    slaPass: false,
    correctnessPass: false,
    items: [],
  };

  if (queueItems.length === 0 || !expected.items) {
    return {
      parsed: null,
      structured: {
        ...baseStructured,
        reason: 'misconfigured_expected_state',
      },
      ok: false,
      feedback:
        'This queue simulation is missing items in initial_state or expected answers in expected_state.items. Ask an admin to fix the seed.',
    };
  }

  const parsed = extractSlaQueueSimSubmission(submission);
  if (!parsed) {
    return {
      parsed: null,
      structured: { ...baseStructured, reason: 'missing_fields' },
      ok: false,
      feedback:
        'Submission must include simulationStartedAt and an items[] array with priority, category, resolution, and resolvedAt for each queue ticket.',
    };
  }

  const submittedById = new Map(parsed.items.map((item) => [item.id, item]));
  const itemResults: SlaQueueSimItemResult[] = [];
  const slaInputs: SlaResolutionInput[] = [];
  let correctCount = 0;

  for (const queueItem of queueItems) {
    const expectedItem = expected.items[queueItem.id] ?? null;
    const submitted = submittedById.get(queueItem.id) ?? null;

    const expectedPriority = expectedItem?.expectedPriority ?? null;
    const expectedCategory = expectedItem?.expectedCategory ?? null;
    const expectedResolution = expectedItem?.expectedResolution ?? null;

    const priorityMatch =
      Boolean(submitted && expectedPriority) &&
      submitted!.priority === expectedPriority;
    const categoryMatch =
      Boolean(submitted && expectedCategory) &&
      submitted!.category === expectedCategory;
    const resolutionMatch =
      Boolean(submitted && expectedResolution) &&
      submitted!.resolution === expectedResolution;

    const correct = priorityMatch && categoryMatch && resolutionMatch;
    if (correct) correctCount += 1;

    const withinSla = submitted
      ? wasResolvedWithinSla(
          parsed.simulationStartedAt,
          submitted.resolvedAt,
          queueItem.slaMinutes
        )
      : null;

    if (submitted) {
      slaInputs.push({
        startedAt: parsed.simulationStartedAt,
        resolvedAt: submitted.resolvedAt,
        slaMinutes: queueItem.slaMinutes,
      });
    }

    itemResults.push({
      id: queueItem.id,
      priorityMatch,
      categoryMatch,
      resolutionMatch,
      correct,
      withinSla,
      expectedPriority,
      expectedCategory,
      expectedResolution,
      submittedPriority: submitted?.priority ?? null,
      submittedCategory: submitted?.category ?? null,
      submittedResolution: submitted?.resolution ?? null,
    });
  }

  const correctnessPercent = Math.round(
    (correctCount / queueItems.length) * 100
  );
  const slaCompliancePercent = computeSlaCompliancePercent(slaInputs);
  const slaForScore = slaCompliancePercent ?? 0;
  const weightSum = slaWeight + correctnessWeight;
  const overallScore =
    weightSum > 0
      ? Math.round(
          (slaWeight * slaForScore + correctnessWeight * correctnessPercent) /
            weightSum
        )
      : Math.round((slaForScore + correctnessPercent) / 2);

  const allSubmitted = queueItems.every((item) => submittedById.has(item.id));
  const slaPass =
    slaCompliancePercent !== null &&
    slaCompliancePercent >= passSlaCompliancePercent;
  const correctnessPass = correctnessPercent >= passCorrectnessPercent;
  const ok = allSubmitted && slaPass && correctnessPass;

  const structured: SlaQueueSimStructuredResult = {
    ...baseStructured,
    submittedCount: parsed.items.filter((item) =>
      queueItems.some((q) => q.id === item.id)
    ).length,
    correctCount,
    correctnessPercent,
    slaCompliancePercent,
    overallScore,
    slaPass,
    correctnessPass,
    items: itemResults,
    reason: ok
      ? undefined
      : !allSubmitted
        ? 'incomplete_batch'
        : !correctnessPass
          ? 'correctness_below_threshold'
          : 'sla_below_threshold',
  };

  if (!allSubmitted) {
    return {
      parsed,
      structured,
      ok: false,
      feedback: `Work every queue item before submitting (${structured.submittedCount}/${queueItems.length} submitted).`,
    };
  }

  if (!ok) {
    const parts: string[] = [];
    if (!correctnessPass) {
      parts.push(
        `Triage/resolution correctness ${correctnessPercent}% (need ≥ ${passCorrectnessPercent}%; ${correctCount}/${queueItems.length} correct).`
      );
    }
    if (!slaPass) {
      parts.push(
        `SLA compliance ${slaCompliancePercent ?? 0}% (need ≥ ${passSlaCompliancePercent}%).`
      );
    }
    return {
      parsed,
      structured,
      ok: false,
      feedback: parts.join(' '),
    };
  }

  return {
    parsed,
    structured,
    ok: true,
    feedback: `Queue cleared. SLA compliance ${slaCompliancePercent}% · triage/resolution ${correctnessPercent}% · overall ${overallScore}%.`,
  };
}

export const slaQueueSimTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateSlaQueueSim(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
