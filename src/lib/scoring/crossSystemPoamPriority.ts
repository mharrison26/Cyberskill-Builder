import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import type { Fips199ImpactLevel } from '@/lib/scoring/ticketUi';
import { isFips199ImpactLevel } from '@/lib/scoring/ticketUi';
import { scoreOrderPairwise } from '@/lib/scoring/vulnPrioritization';

/**
 * Cross-system POA&M portfolio prioritization (ISSO / GRC).
 *
 * Student reviews POA&M summaries across 3–4 systems at different FIPS 199
 * impact levels and submits one ordered remediation list (item IDs).
 *
 * Risk weight (higher → remediate sooner):
 *   riskScore = IMPACT_WEIGHT[impactLevel] × SEVERITY_WEIGHT[severity]
 *   impact:  low=1, moderate=2, high=3
 *   severity: low=1, moderate=2, high=3, critical=4
 * Tie-break: earlier dueDate first, then id ascending.
 *
 * Resolve requires exact order match (`scoringMode: 'exact_order'`).
 * Pairwise / position metrics are always recorded as partialScore analytics.
 *
 * initial_state:
 *   {
 *     prompt?: string;
 *     systems: Array<{
 *       id, name, impactLevel,
 *       poamItems: Array<{ id, title?, weakness?, severity, dueDate? }>
 *     }>
 *   }
 *
 * expected_state:
 *   {
 *     expectedOrder: string[];
 *     scoringMode?: 'exact_order';
 *     minPrefixCorrect?: number | null;
 *     weights?: { impact?: {...}, severity?: {...} }
 *   }
 *
 * submission:
 *   { type: 'cross_system_poam_priority' | ..., orderedIds: string[] }
 */

export const CROSS_SYSTEM_POAM_PRIORITY_TICKET_TYPES = [
  'cross_system_poam_priority',
  'enterprise_poam_prioritization',
  'isso_poam_portfolio',
] as const;

export type CrossSystemPoamPriorityTicketType =
  (typeof CROSS_SYSTEM_POAM_PRIORITY_TICKET_TYPES)[number];

export type PoamItemSeverity = 'critical' | 'high' | 'moderate' | 'low';

export const DEFAULT_IMPACT_WEIGHTS: Record<Fips199ImpactLevel, number> = {
  low: 1,
  moderate: 2,
  high: 3,
};

export const DEFAULT_SEVERITY_WEIGHTS: Record<PoamItemSeverity, number> = {
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

export type CrossSystemPoamWeights = {
  impact: Record<Fips199ImpactLevel, number>;
  severity: Record<PoamItemSeverity, number>;
};

export const DEFAULT_CROSS_SYSTEM_POAM_WEIGHTS: CrossSystemPoamWeights = {
  impact: { ...DEFAULT_IMPACT_WEIGHTS },
  severity: { ...DEFAULT_SEVERITY_WEIGHTS },
};

export type CrossSystemPoamItem = {
  id: string;
  systemId: string;
  systemName: string;
  impactLevel: Fips199ImpactLevel;
  title: string;
  weakness: string;
  severity: PoamItemSeverity;
  dueDate: string | null;
};

export type CrossSystemPoamSystem = {
  id: string;
  name: string;
  impactLevel: Fips199ImpactLevel;
  description: string;
  poamItems: Array<{
    id: string;
    title: string;
    weakness: string;
    severity: PoamItemSeverity;
    dueDate: string | null;
  }>;
};

export type CrossSystemPoamPriorityExpectedState = {
  expectedOrder: string[];
  scoringMode: 'exact_order';
  minPrefixCorrect: number | null;
  weights: CrossSystemPoamWeights;
};

export type CrossSystemPoamPrioritySubmission = {
  type?: string;
  orderedIds: string[];
};

export type CrossSystemPoamPriorityStructuredResult = {
  style: 'cross_system_poam_priority';
  orderedIds: string[];
  expectedOrder: string[];
  exactMatch: boolean;
  positionMatches: number;
  positionTotal: number;
  firstMismatchIndex: number | null;
  pairCount: number;
  agreeingPairs: number;
  percentage: number;
  partialScore: number;
  scoringMode: 'exact_order';
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isCrossSystemPoamPriorityTicketType(
  ticketType: string
): boolean {
  const base = ticketTypeBase(ticketType);
  return (CROSS_SYSTEM_POAM_PRIORITY_TICKET_TYPES as readonly string[]).includes(
    base
  );
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeImpactLevel(value: unknown): Fips199ImpactLevel | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'medium') return 'moderate';
  if (isFips199ImpactLevel(normalized)) return normalized;
  return null;
}

function normalizeSeverity(value: unknown): PoamItemSeverity | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'medium') return 'moderate';
  if (normalized === 'crit') return 'critical';
  if (
    normalized === 'critical' ||
    normalized === 'high' ||
    normalized === 'moderate' ||
    normalized === 'low'
  ) {
    return normalized;
  }
  return null;
}

export function parseCrossSystemPoamWeights(
  raw: unknown
): CrossSystemPoamWeights {
  const defaults: CrossSystemPoamWeights = {
    impact: { ...DEFAULT_IMPACT_WEIGHTS },
    severity: { ...DEFAULT_SEVERITY_WEIGHTS },
  };
  if (!isPlainObject(raw)) return defaults;

  const impactRaw = isPlainObject(raw.impact) ? raw.impact : raw;
  const severityRaw = isPlainObject(raw.severity) ? raw.severity : raw;

  for (const level of ['low', 'moderate', 'high'] as const) {
    const n = readFiniteNumber(
      impactRaw[level] ??
        impactRaw[`impact_${level}`] ??
        impactRaw[`impact${level[0]!.toUpperCase()}${level.slice(1)}`]
    );
    if (n !== null) defaults.impact[level] = n;
  }

  for (const sev of ['low', 'moderate', 'high', 'critical'] as const) {
    const n = readFiniteNumber(
      severityRaw[sev] ??
        severityRaw[`severity_${sev}`] ??
        severityRaw[`severity${sev[0]!.toUpperCase()}${sev.slice(1)}`]
    );
    if (n !== null) defaults.severity[sev] = n;
  }

  return defaults;
}

export function parseCrossSystemPoamSystems(
  initialState: Record<string, unknown> | null | undefined
): CrossSystemPoamSystem[] {
  if (!isPlainObject(initialState)) return [];

  const raw = initialState.systems ?? initialState.poamSystems ?? [];
  if (!Array.isArray(raw)) return [];

  const systems: CrossSystemPoamSystem[] = [];

  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;

    const id =
      typeof entry.id === 'string'
        ? entry.id.trim()
        : typeof entry.systemId === 'string'
          ? entry.systemId.trim()
          : typeof entry.system_id === 'string'
            ? entry.system_id.trim()
            : '';
    if (!id) continue;

    const impactLevel =
      normalizeImpactLevel(
        entry.impactLevel ?? entry.impact_level ?? entry.fips199Impact
      ) ?? 'moderate';

    const name =
      typeof entry.name === 'string' && entry.name.trim()
        ? entry.name.trim()
        : typeof entry.systemName === 'string' && entry.systemName.trim()
          ? entry.systemName.trim()
          : id;

    const description =
      typeof entry.description === 'string'
        ? entry.description.trim()
        : typeof entry.summary === 'string'
          ? entry.summary.trim()
          : '';

    const itemsRaw =
      entry.poamItems ?? entry.poam_items ?? entry.items ?? entry.findings;
    const poamItems: CrossSystemPoamSystem['poamItems'] = [];

    if (Array.isArray(itemsRaw)) {
      for (const item of itemsRaw) {
        if (!isPlainObject(item)) continue;
        const itemId =
          typeof item.id === 'string'
            ? item.id.trim()
            : typeof item.poamId === 'string'
              ? item.poamId.trim()
              : typeof item.poam_id === 'string'
                ? item.poam_id.trim()
                : '';
        if (!itemId) continue;

        const severity =
          normalizeSeverity(item.severity ?? item.riskSeverity) ?? 'moderate';

        const title =
          typeof item.title === 'string' && item.title.trim()
            ? item.title.trim()
            : typeof item.name === 'string' && item.name.trim()
              ? item.name.trim()
              : itemId;

        const weakness =
          typeof item.weakness === 'string'
            ? item.weakness.trim()
            : typeof item.description === 'string'
              ? item.description.trim()
              : typeof item.summary === 'string'
                ? item.summary.trim()
                : '';

        const dueDate =
          typeof item.dueDate === 'string' && item.dueDate.trim()
            ? item.dueDate.trim()
            : typeof item.due_date === 'string' && item.due_date.trim()
              ? item.due_date.trim()
              : null;

        poamItems.push({ id: itemId, title, weakness, severity, dueDate });
      }
    }

    systems.push({ id, name, impactLevel, description, poamItems });
  }

  return systems;
}

/** Flatten systems → scored items for ranking. */
export function flattenPoamItems(
  systems: CrossSystemPoamSystem[]
): CrossSystemPoamItem[] {
  const items: CrossSystemPoamItem[] = [];
  for (const system of systems) {
    for (const item of system.poamItems) {
      items.push({
        id: item.id,
        systemId: system.id,
        systemName: system.name,
        impactLevel: system.impactLevel,
        title: item.title,
        weakness: item.weakness,
        severity: item.severity,
        dueDate: item.dueDate,
      });
    }
  }
  return items;
}

export function computePoamRiskScore(
  item: Pick<CrossSystemPoamItem, 'impactLevel' | 'severity'>,
  weights: CrossSystemPoamWeights = DEFAULT_CROSS_SYSTEM_POAM_WEIGHTS
): number {
  return weights.impact[item.impactLevel] * weights.severity[item.severity];
}

/**
 * Canonical remediation order: higher riskScore first; earlier dueDate;
 * id ascending on remaining ties.
 */
export function derivePoamExpectedOrder(
  items: CrossSystemPoamItem[],
  weights: CrossSystemPoamWeights = DEFAULT_CROSS_SYSTEM_POAM_WEIGHTS
): string[] {
  return [...items]
    .sort((a, b) => {
      const scoreDiff =
        computePoamRiskScore(b, weights) - computePoamRiskScore(a, weights);
      if (scoreDiff !== 0) return scoreDiff;

      if (a.dueDate && b.dueDate) {
        const dateDiff = a.dueDate.localeCompare(b.dueDate);
        if (dateDiff !== 0) return dateDiff;
      } else if (a.dueDate && !b.dueDate) {
        return -1;
      } else if (!a.dueDate && b.dueDate) {
        return 1;
      }

      return a.id.localeCompare(b.id);
    })
    .map((item) => item.id);
}

export function parseCrossSystemPoamPriorityExpectedState(
  expectedState: Record<string, unknown> | null | undefined,
  items: CrossSystemPoamItem[] = []
): CrossSystemPoamPriorityExpectedState {
  const weights = parseCrossSystemPoamWeights(
    isPlainObject(expectedState) ? expectedState.weights : undefined
  );

  let expectedOrder: string[] = [];
  let minPrefixCorrect: number | null = null;

  if (isPlainObject(expectedState)) {
    const raw =
      expectedState.expectedOrder ??
      expectedState.expected_order ??
      expectedState.canonicalOrder ??
      expectedState.order;
    if (Array.isArray(raw)) {
      expectedOrder = raw
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }

    const prefixRaw =
      readFiniteNumber(expectedState.minPrefixCorrect) ??
      readFiniteNumber(expectedState.min_prefix_correct);
    if (prefixRaw !== null && prefixRaw >= 0) {
      minPrefixCorrect = Math.floor(prefixRaw);
    } else if (
      expectedState.minPrefixCorrect === null ||
      expectedState.min_prefix_correct === null
    ) {
      minPrefixCorrect = null;
    }
  }

  if (expectedOrder.length === 0 && items.length > 0) {
    expectedOrder = derivePoamExpectedOrder(items, weights);
  }

  return {
    expectedOrder,
    scoringMode: 'exact_order',
    minPrefixCorrect,
    weights,
  };
}

export function extractCrossSystemPoamPrioritySubmission(
  submission: TicketSubmission
): CrossSystemPoamPrioritySubmission | null {
  const raw =
    submission.orderedIds ??
    submission.ordered_ids ??
    submission.order ??
    submission.remediationOrder ??
    submission.remediation_order;

  if (!Array.isArray(raw)) return null;

  const orderedIds = raw
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (isPlainObject(entry)) {
        if (typeof entry.id === 'string') return entry.id.trim();
        if (typeof entry.poamId === 'string') return entry.poamId.trim();
      }
      return '';
    })
    .filter(Boolean);

  if (orderedIds.length === 0) return null;

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'cross_system_poam_priority',
    orderedIds,
  };
}

function firstMismatchIndex(
  studentOrder: string[],
  expectedOrder: string[]
): number | null {
  const len = Math.max(studentOrder.length, expectedOrder.length);
  for (let i = 0; i < len; i += 1) {
    if (studentOrder[i] !== expectedOrder[i]) return i;
  }
  return null;
}

export function evaluateCrossSystemPoamPriority(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: CrossSystemPoamPrioritySubmission | null;
  structured: CrossSystemPoamPriorityStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const systems = parseCrossSystemPoamSystems(ticket.initial_state);
  const items = flattenPoamItems(systems);
  const expected = parseCrossSystemPoamPriorityExpectedState(
    ticket.expected_state,
    items
  );
  const expectedOrder = expected.expectedOrder;
  const parsed = extractCrossSystemPoamPrioritySubmission(submission);

  const baseStructured: CrossSystemPoamPriorityStructuredResult = {
    style: 'cross_system_poam_priority',
    orderedIds: parsed?.orderedIds ?? [],
    expectedOrder,
    exactMatch: false,
    positionMatches: 0,
    positionTotal: expectedOrder.length,
    firstMismatchIndex: null,
    pairCount: 0,
    agreeingPairs: 0,
    percentage: 0,
    partialScore: 0,
    scoringMode: 'exact_order',
  };

  if (expectedOrder.length === 0) {
    return {
      parsed,
      structured: {
        ...baseStructured,
        reason: 'misconfigured_expected_state',
      },
      ok: false,
      feedback:
        'This ticket is missing expectedOrder (and systems/POA&M items to derive it). Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...baseStructured, reason: 'missing_ordered_ids' },
      ok: false,
      feedback:
        'Submission must include orderedIds: an array of POA&M item IDs from highest to lowest remediation priority.',
    };
  }

  const expectedSet = new Set(expectedOrder);
  const submittedSet = new Set(parsed.orderedIds);
  const missing = expectedOrder.filter((id) => !submittedSet.has(id));
  const extras = parsed.orderedIds.filter((id) => !expectedSet.has(id));
  const uniqueCount = submittedSet.size;

  if (
    missing.length > 0 ||
    extras.length > 0 ||
    uniqueCount !== parsed.orderedIds.length
  ) {
    const parts: string[] = [];
    if (uniqueCount !== parsed.orderedIds.length) {
      parts.push('Duplicate POA&M IDs are not allowed.');
    }
    if (missing.length > 0) {
      parts.push(`Missing IDs: ${missing.join(', ')}.`);
    }
    if (extras.length > 0) {
      parts.push(`Unknown IDs: ${extras.join(', ')}.`);
    }
    return {
      parsed,
      structured: {
        ...baseStructured,
        orderedIds: parsed.orderedIds,
        reason: 'incomplete_permutation',
      },
      ok: false,
      feedback: `Submit a complete ranking of every POA&M item exactly once. ${parts.join(' ')}`,
    };
  }

  const { agreeingPairs, pairCount, percentage } = scoreOrderPairwise(
    parsed.orderedIds,
    expectedOrder
  );

  let positionMatches = 0;
  for (let i = 0; i < expectedOrder.length; i += 1) {
    if (parsed.orderedIds[i] === expectedOrder[i]) {
      positionMatches += 1;
    }
  }

  const exactMatch = positionMatches === expectedOrder.length;
  const rounded = Math.round(percentage * 100) / 100;
  const mismatch = firstMismatchIndex(parsed.orderedIds, expectedOrder);
  // Blend pairwise + position accuracy for analytics even when not resolved.
  const positionPct =
    expectedOrder.length > 0
      ? (positionMatches / expectedOrder.length) * 100
      : 0;
  const partialScore =
    Math.round(((rounded + positionPct) / 2) * 100) / 100;

  const structured: CrossSystemPoamPriorityStructuredResult = {
    ...baseStructured,
    orderedIds: parsed.orderedIds,
    exactMatch,
    positionMatches,
    positionTotal: expectedOrder.length,
    firstMismatchIndex: mismatch,
    pairCount,
    agreeingPairs,
    percentage: rounded,
    partialScore,
    reason: exactMatch ? undefined : 'order_mismatch',
  };

  if (exactMatch) {
    return {
      parsed,
      structured,
      ok: true,
      feedback: `Perfect remediation order — all ${expectedOrder.length} POA&M items ranked by impact × severity (FIPS 199 impact × POA&M severity).`,
    };
  }

  const expectedAt = mismatch !== null ? expectedOrder[mismatch] : '?';
  const gotAt =
    mismatch !== null ? (parsed.orderedIds[mismatch] ?? '(missing)') : '?';
  const positionLabel = mismatch !== null ? mismatch + 1 : '?';

  return {
    parsed,
    structured,
    ok: false,
    feedback: `Remediation order needs revision. First mismatch at position ${positionLabel}: expected ${expectedAt}, got ${gotAt}. Rank by riskScore = impact_weight × severity_weight (high×critical before lower combinations). Pairwise agreement ${rounded}%; ${positionMatches}/${expectedOrder.length} positions exact.`,
  };
}

export const crossSystemPoamPriorityTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateCrossSystemPoamPriority(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
