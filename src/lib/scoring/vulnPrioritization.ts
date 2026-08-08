import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';

/**
 * Vulnerability prioritization / patch schedule scoring.
 *
 * Fully deterministic: student submits an ordered list of vulnerability IDs
 * (patch soonest → last). Compared against `expected_state.expectedOrder`
 * using pairwise concordance (Kendall-tau style): fraction of pairs that
 * appear in the same relative order as the answer key.
 *
 * Weighting logic used to build the answer key (documented for instructors;
 * scorer uses the seeded `expectedOrder` unless it is missing):
 *   priorityScore = cvss
 *     + (exposure === 'internet' ? internetBonus : exposure === 'partner' ? partnerBonus : internalBonus)
 *     + (exploitAvailable ? exploitBonus : 0)
 * Higher score → earlier in the patch schedule. Ties break by id ascending.
 *
 * initial_state:
 *   {
 *     prompt?: string;
 *     vulnerabilities: Array<{
 *       id, title?, description?, cveId?,
 *       cvss, exposedSystem, exposure?, exploitAvailable
 *     }>
 *   }
 *
 * expected_state:
 *   {
 *     expectedOrder: string[];
 *     passThresholdPercent?: number; // default 80
 *     weights?: { internetExposureBonus?, partnerExposureBonus?,
 *                 internalExposureBonus?, exploitAvailableBonus? }
 *   }
 *
 * submission:
 *   { type: 'vuln_prioritization' | 'patch_schedule', orderedIds: string[] }
 */

export const VULN_PRIORITIZATION_TICKET_TYPES = [
  'vuln_prioritization',
  'patch_schedule',
] as const;

export type VulnPrioritizationTicketType =
  (typeof VULN_PRIORITIZATION_TICKET_TYPES)[number];

export type VulnExposure = 'internet' | 'partner' | 'internal';

export type VulnerabilityItem = {
  id: string;
  title: string;
  description: string;
  cveId: string;
  cvss: number;
  exposedSystem: string;
  exposure: VulnExposure;
  exploitAvailable: boolean;
};

export type VulnPrioritizationWeights = {
  internetExposureBonus: number;
  partnerExposureBonus: number;
  internalExposureBonus: number;
  exploitAvailableBonus: number;
};

export const DEFAULT_VULN_PRIORITIZATION_WEIGHTS: VulnPrioritizationWeights = {
  internetExposureBonus: 3,
  partnerExposureBonus: 1.5,
  internalExposureBonus: 0,
  exploitAvailableBonus: 2,
};

export const DEFAULT_VULN_PASS_THRESHOLD_PERCENT = 80;

export type VulnPrioritizationExpectedState = {
  expectedOrder: string[];
  passThresholdPercent: number;
  weights: VulnPrioritizationWeights;
};

export type VulnPrioritizationSubmission = {
  type?: string;
  orderedIds: string[];
};

export type VulnPrioritizationStructuredResult = {
  style: 'vuln_prioritization';
  orderedIds: string[];
  expectedOrder: string[];
  pairCount: number;
  agreeingPairs: number;
  percentage: number;
  passThresholdPercent: number;
  exactMatch: boolean;
  positionMatches: number;
  positionTotal: number;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ticketTypeBase(ticketType: string): string {
  const t = ticketType.trim().toLowerCase();
  return t.includes('.') ? t.slice(t.lastIndexOf('.') + 1) : t;
}

export function isVulnPrioritizationTicketType(ticketType: string): boolean {
  const base = ticketTypeBase(ticketType);
  return (
    base === 'vuln_prioritization' ||
    base === 'patch_schedule' ||
    (VULN_PRIORITIZATION_TICKET_TYPES as readonly string[]).includes(base)
  );
}

function normalizeExposure(value: unknown): VulnExposure {
  if (typeof value !== 'string') return 'internal';
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (
    normalized === 'internet' ||
    normalized === 'external' ||
    normalized === 'public' ||
    normalized === 'internet_facing' ||
    normalized === 'internet-facing'
  ) {
    return 'internet';
  }
  if (
    normalized === 'partner' ||
    normalized === 'extranet' ||
    normalized === 'dmz' ||
    normalized === 'vendor'
  ) {
    return 'partner';
  }
  return 'internal';
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'yes' || normalized === '1') {
      return true;
    }
  }
  if (typeof value === 'number') return value !== 0;
  return false;
}

export function parseVulnerabilities(
  initialState: Record<string, unknown> | null | undefined
): VulnerabilityItem[] {
  if (!isPlainObject(initialState)) return [];

  const raw =
    initialState.vulnerabilities ??
    initialState.vulns ??
    initialState.findings ??
    [];
  if (!Array.isArray(raw)) return [];

  const items: VulnerabilityItem[] = [];

  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;

    const id =
      typeof entry.id === 'string'
        ? entry.id.trim()
        : typeof entry.vulnId === 'string'
          ? entry.vulnId.trim()
          : typeof entry.vuln_id === 'string'
            ? entry.vuln_id.trim()
            : '';
    if (!id) continue;

    const cvss =
      readFiniteNumber(entry.cvss) ??
      readFiniteNumber(entry.cvssScore) ??
      readFiniteNumber(entry.cvss_score) ??
      0;

    const title =
      typeof entry.title === 'string' && entry.title.trim()
        ? entry.title.trim()
        : typeof entry.name === 'string' && entry.name.trim()
          ? entry.name.trim()
          : id;

    const description =
      typeof entry.description === 'string'
        ? entry.description.trim()
        : typeof entry.summary === 'string'
          ? entry.summary.trim()
          : '';

    const cveId =
      typeof entry.cveId === 'string'
        ? entry.cveId.trim()
        : typeof entry.cve_id === 'string'
          ? entry.cve_id.trim()
          : typeof entry.cve === 'string'
            ? entry.cve.trim()
            : '';

    const exposedSystem =
      typeof entry.exposedSystem === 'string'
        ? entry.exposedSystem.trim()
        : typeof entry.exposed_system === 'string'
          ? entry.exposed_system.trim()
          : typeof entry.system === 'string'
            ? entry.system.trim()
            : typeof entry.asset === 'string'
              ? entry.asset.trim()
              : 'Unknown system';

    const exposure = normalizeExposure(
      entry.exposure ?? entry.exposureLevel ?? entry.exposure_level
    );

    const exploitAvailable = readBoolean(
      entry.exploitAvailable ??
        entry.exploit_available ??
        entry.exploit ??
        entry.hasExploit
    );

    items.push({
      id,
      title,
      description,
      cveId,
      cvss,
      exposedSystem,
      exposure,
      exploitAvailable,
    });
  }

  return items;
}

export function parseVulnPrioritizationWeights(
  raw: unknown
): VulnPrioritizationWeights {
  const defaults = { ...DEFAULT_VULN_PRIORITIZATION_WEIGHTS };
  if (!isPlainObject(raw)) return defaults;

  const internet = readFiniteNumber(
    raw.internetExposureBonus ?? raw.internet_exposure_bonus
  );
  const partner = readFiniteNumber(
    raw.partnerExposureBonus ?? raw.partner_exposure_bonus
  );
  const internal = readFiniteNumber(
    raw.internalExposureBonus ?? raw.internal_exposure_bonus
  );
  const exploit = readFiniteNumber(
    raw.exploitAvailableBonus ?? raw.exploit_available_bonus
  );

  return {
    internetExposureBonus: internet ?? defaults.internetExposureBonus,
    partnerExposureBonus: partner ?? defaults.partnerExposureBonus,
    internalExposureBonus: internal ?? defaults.internalExposureBonus,
    exploitAvailableBonus: exploit ?? defaults.exploitAvailableBonus,
  };
}

/** Severity + exposure + exploit weighting used to rank patch order. */
export function computeVulnPriorityScore(
  vuln: Pick<VulnerabilityItem, 'cvss' | 'exposure' | 'exploitAvailable'>,
  weights: VulnPrioritizationWeights = DEFAULT_VULN_PRIORITIZATION_WEIGHTS
): number {
  const exposureBonus =
    vuln.exposure === 'internet'
      ? weights.internetExposureBonus
      : vuln.exposure === 'partner'
        ? weights.partnerExposureBonus
        : weights.internalExposureBonus;

  const exploitBonus = vuln.exploitAvailable
    ? weights.exploitAvailableBonus
    : 0;

  return vuln.cvss + exposureBonus + exploitBonus;
}

/**
 * Derive canonical patch order: higher priorityScore first; id ascending on ties.
 */
export function deriveExpectedOrder(
  vulnerabilities: VulnerabilityItem[],
  weights: VulnPrioritizationWeights = DEFAULT_VULN_PRIORITIZATION_WEIGHTS
): string[] {
  return [...vulnerabilities]
    .sort((a, b) => {
      const scoreDiff =
        computeVulnPriorityScore(b, weights) -
        computeVulnPriorityScore(a, weights);
      if (scoreDiff !== 0) return scoreDiff;
      return a.id.localeCompare(b.id);
    })
    .map((v) => v.id);
}

export function parseVulnPrioritizationExpectedState(
  expectedState: Record<string, unknown> | null | undefined,
  vulnerabilities: VulnerabilityItem[] = []
): VulnPrioritizationExpectedState {
  const weights = parseVulnPrioritizationWeights(
    isPlainObject(expectedState) ? expectedState.weights : undefined
  );

  let passThresholdPercent = DEFAULT_VULN_PASS_THRESHOLD_PERCENT;
  if (isPlainObject(expectedState)) {
    const raw =
      readFiniteNumber(expectedState.passThresholdPercent) ??
      readFiniteNumber(expectedState.pass_threshold_percent);
    if (raw !== null && raw >= 0 && raw <= 100) {
      passThresholdPercent = raw;
    }
  }

  let expectedOrder: string[] = [];
  if (isPlainObject(expectedState)) {
    const raw =
      expectedState.expectedOrder ??
      expectedState.expected_order ??
      expectedState.canonicalOrder ??
      expectedState.order;
    if (Array.isArray(raw)) {
      expectedOrder = raw
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  if (expectedOrder.length === 0 && vulnerabilities.length > 0) {
    expectedOrder = deriveExpectedOrder(vulnerabilities, weights);
  }

  return { expectedOrder, passThresholdPercent, weights };
}

export function extractVulnPrioritizationSubmission(
  submission: TicketSubmission
): VulnPrioritizationSubmission | null {
  const raw =
    submission.orderedIds ??
    submission.ordered_ids ??
    submission.schedule ??
    submission.order ??
    submission.patchOrder ??
    submission.patch_order;

  if (!Array.isArray(raw)) return null;

  const orderedIds = raw
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (isPlainObject(item)) {
        if (typeof item.id === 'string') return item.id.trim();
        if (typeof item.vulnId === 'string') return item.vulnId.trim();
      }
      return '';
    })
    .filter(Boolean);

  if (orderedIds.length === 0) return null;

  return {
    type:
      typeof submission.type === 'string'
        ? submission.type
        : 'vuln_prioritization',
    orderedIds,
  };
}

/**
 * Pairwise concordance: for every pair (a before b) in expected order,
 * count whether the student also places a before b. Returns agreeing / total.
 */
export function scoreOrderPairwise(
  studentOrder: string[],
  expectedOrder: string[]
): { agreeingPairs: number; pairCount: number; percentage: number } {
  const expectedIndex = new Map<string, number>();
  expectedOrder.forEach((id, index) => {
    expectedIndex.set(id, index);
  });

  // Score only IDs present in the answer key; ignore extras.
  const studentRelevant = studentOrder.filter((id) => expectedIndex.has(id));
  const pairCount = (expectedOrder.length * (expectedOrder.length - 1)) / 2;

  if (pairCount === 0) {
    return { agreeingPairs: 0, pairCount: 0, percentage: 0 };
  }

  const studentIndex = new Map<string, number>();
  studentRelevant.forEach((id, index) => {
    studentIndex.set(id, index);
  });

  let agreeingPairs = 0;

  for (let i = 0; i < expectedOrder.length; i += 1) {
    for (let j = i + 1; j < expectedOrder.length; j += 1) {
      const a = expectedOrder[i]!;
      const b = expectedOrder[j]!;
      const sa = studentIndex.get(a);
      const sb = studentIndex.get(b);
      // Missing either ID ⇒ that pair does not agree.
      if (sa !== undefined && sb !== undefined && sa < sb) {
        agreeingPairs += 1;
      }
    }
  }

  const percentage = (agreeingPairs / pairCount) * 100;
  return { agreeingPairs, pairCount, percentage };
}

export function evaluateVulnPrioritization(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: VulnPrioritizationSubmission | null;
  structured: VulnPrioritizationStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const vulnerabilities = parseVulnerabilities(ticket.initial_state);
  const expected = parseVulnPrioritizationExpectedState(
    ticket.expected_state,
    vulnerabilities
  );
  const expectedOrder = expected.expectedOrder;
  const passThresholdPercent = expected.passThresholdPercent;
  const parsed = extractVulnPrioritizationSubmission(submission);

  const baseStructured: VulnPrioritizationStructuredResult = {
    style: 'vuln_prioritization',
    orderedIds: parsed?.orderedIds ?? [],
    expectedOrder,
    pairCount: 0,
    agreeingPairs: 0,
    percentage: 0,
    passThresholdPercent,
    exactMatch: false,
    positionMatches: 0,
    positionTotal: expectedOrder.length,
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
        'This ticket is missing expectedOrder (and vulnerabilities to derive it). Ask an admin to fix the seed.',
    };
  }

  if (!parsed) {
    return {
      parsed: null,
      structured: { ...baseStructured, reason: 'missing_ordered_ids' },
      ok: false,
      feedback:
        'Submission must include orderedIds: an array of vulnerability IDs from highest to lowest patch priority.',
    };
  }

  const expectedSet = new Set(expectedOrder);
  const submittedSet = new Set(parsed.orderedIds);
  const missing = expectedOrder.filter((id) => !submittedSet.has(id));
  const extras = parsed.orderedIds.filter((id) => !expectedSet.has(id));
  const uniqueCount = submittedSet.size;

  if (missing.length > 0 || extras.length > 0 || uniqueCount !== parsed.orderedIds.length) {
    const parts: string[] = [];
    if (uniqueCount !== parsed.orderedIds.length) {
      parts.push('Duplicate vulnerability IDs are not allowed.');
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
      feedback: `Submit a complete ranking of every vulnerability exactly once. ${parts.join(' ')}`,
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
  const ok = rounded >= passThresholdPercent;

  const structured: VulnPrioritizationStructuredResult = {
    ...baseStructured,
    orderedIds: parsed.orderedIds,
    pairCount,
    agreeingPairs,
    percentage: rounded,
    exactMatch,
    positionMatches,
    positionTotal: expectedOrder.length,
    reason: ok ? undefined : 'below_threshold',
  };

  if (ok) {
    return {
      parsed,
      structured,
      ok: true,
      feedback: exactMatch
        ? `Perfect patch schedule — all ${expectedOrder.length} vulnerabilities in the severity/exposure-weighted order.`
        : `Patch schedule accepted (${rounded}% pairwise order agreement; need ≥ ${passThresholdPercent}%). ${positionMatches}/${expectedOrder.length} positions exact.`,
    };
  }

  return {
    parsed,
    structured,
    ok: false,
    feedback: `Patch schedule needs revision: ${rounded}% pairwise order agreement (need ≥ ${passThresholdPercent}%). Prioritize higher CVSS, internet-exposed systems, and exploit-available findings first. ${positionMatches}/${expectedOrder.length} positions exact.`,
  };
}

export const vulnPrioritizationTicketScorer: TicketScorer = {
  score(submission, ticket): TicketScoreResult {
    const result = evaluateVulnPrioritization(submission, ticket);
    return {
      status: result.ok ? 'resolved' : 'needs_revision',
      structuredResult: result.structured,
      feedback: result.feedback,
    };
  },
};
