import {
  computeKpisFromCsv,
  extractCsvFromInitialState,
  KPI_REPORT_OUTPUT_JSON,
  KPI_REPORT_OUTPUT_MD,
  type HelpdeskKpis,
} from '@/lib/helpdesk/kpiMetrics';
import type {
  ScorableTicket,
  TicketScoreResult,
  TicketScorer,
  TicketSubmission,
} from '@/lib/scoring/index';
import {
  isKpiReportTicketType,
  KPI_REPORT_MIN_REPORT_LENGTH,
} from '@/lib/scoring/ticketUi';

export { isKpiReportTicketType };

/**
 * Helpdesk KPI report scoring (HD-05).
 *
 * Students analyze a seeded CSV of resolved tickets and report:
 *   1. average resolution time (hours)
 *   2. SLA compliance rate (%)
 *   3. ticket volume by category
 *   4. median resolution time (hours) — optional fourth KPI
 *
 * Paths:
 *   a) Manual form submission with numeric KPIs + short written report
 *   b) Script path: CodeSandbox files with output/kpis.json (+ report.md)
 *
 * Grading is deterministic against expected_state (or recomputed from CSV)
 * with numeric tolerances. Light narrative checks are optional.
 */

export type KpiReportExpectedState = {
  averageResolutionHours?: number;
  medianResolutionHours?: number;
  slaCompliancePercent?: number;
  volumeByCategory?: Record<string, number>;
  /** Absolute tolerance for average/median hours (default 0.05). */
  hoursTolerance?: number;
  /** Absolute tolerance for SLA % points (default 1). */
  slaTolerancePoints?: number;
  minReportLength?: number;
  /** When true (default), require medianResolutionHours. */
  requireMedian?: boolean;
  /** Optional substrings that should appear in the report (case-insensitive). */
  reportKeywords?: string[];
  /** Minimum fraction of reportKeywords that must match (default 0.5). */
  reportKeywordMatchRatio?: number;
};

export type KpiReportSubmission = {
  type?: string;
  mode?: 'manual' | 'script';
  averageResolutionHours: number;
  slaCompliancePercent: number;
  volumeByCategory: Record<string, number>;
  medianResolutionHours?: number;
  report: string;
};

export type KpiFieldMatch = {
  field: string;
  expected: number | Record<string, number> | null;
  actual: number | Record<string, number> | null;
  matched: boolean;
  detail?: string;
};

export type KpiReportStructuredResult = {
  style: 'kpi_report';
  mode: 'manual' | 'script' | null;
  ticketCount: number | null;
  matches: KpiFieldMatch[];
  matchedCount: number;
  requiredCount: number;
  reportLength: number;
  minReportLength: number;
  reportOk: boolean;
  keywordsMatched: string[];
  keywordsMissing: string[];
  keywordsOk: boolean;
  reason?: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const cleaned = value.trim().replace(/%$/, '');
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeCategoryKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function parseVolumeByCategory(value: unknown): Record<string, number> | null {
  if (typeof value === 'string' && value.trim()) {
    try {
      return parseVolumeByCategory(JSON.parse(value));
    } catch {
      // Also accept "access:18, hardware:12" style.
      const out: Record<string, number> = {};
      const parts = value.split(/[,;\n]+/);
      for (const part of parts) {
        const m = part.trim().match(/^([a-z0-9_ -]+)\s*[:=]\s*(\d+)\s*$/i);
        if (!m) continue;
        out[normalizeCategoryKey(m[1]!)] = Number(m[2]);
      }
      return Object.keys(out).length > 0 ? out : null;
    }
  }

  if (!isPlainObject(value)) return null;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const n = asFiniteNumber(raw);
    if (n === null) continue;
    out[normalizeCategoryKey(key)] = Math.round(n);
  }
  return Object.keys(out).length > 0 ? out : null;
}

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\/+/g, '/');
}

function asStringRecord(value: unknown): Record<string, string> | null {
  if (!isPlainObject(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') {
      out[normalizePath(key)] = entry;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Extract flat path→content map from a CodeSandbox-style submission. */
export function extractKpiSubmissionFiles(
  submission: TicketSubmission
): Record<string, string> {
  const direct =
    asStringRecord(submission.files) ??
    asStringRecord(submission.filesystem) ??
    asStringRecord(submission);
  return direct ?? {};
}

function withinTolerance(
  actual: number,
  expected: number,
  tolerance: number
): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

function volumesMatch(
  actual: Record<string, number>,
  expected: Record<string, number>
): boolean {
  const keys = Array.from(
    new Set([...Object.keys(actual), ...Object.keys(expected)])
  );
  for (const key of keys) {
    if ((actual[key] ?? 0) !== (expected[key] ?? 0)) return false;
  }
  return true;
}

export function parseKpiReportExpectedState(
  expectedState: Record<string, unknown> | null | undefined
): KpiReportExpectedState {
  if (!isPlainObject(expectedState)) return {};

  const volume = parseVolumeByCategory(
    expectedState.volumeByCategory ?? expectedState.volume_by_category
  );

  let reportKeywords: string[] | undefined;
  const rawKeywords =
    expectedState.reportKeywords ?? expectedState.report_keywords;
  if (Array.isArray(rawKeywords)) {
    reportKeywords = rawKeywords
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return {
    averageResolutionHours:
      asFiniteNumber(
        expectedState.averageResolutionHours ??
          expectedState.average_resolution_hours
      ) ?? undefined,
    medianResolutionHours:
      asFiniteNumber(
        expectedState.medianResolutionHours ??
          expectedState.median_resolution_hours
      ) ?? undefined,
    slaCompliancePercent:
      asFiniteNumber(
        expectedState.slaCompliancePercent ??
          expectedState.sla_compliance_percent
      ) ?? undefined,
    volumeByCategory: volume ?? undefined,
    hoursTolerance:
      asFiniteNumber(
        expectedState.hoursTolerance ?? expectedState.hours_tolerance
      ) ?? undefined,
    slaTolerancePoints:
      asFiniteNumber(
        expectedState.slaTolerancePoints ?? expectedState.sla_tolerance_points
      ) ?? undefined,
    minReportLength:
      asFiniteNumber(
        expectedState.minReportLength ?? expectedState.min_report_length
      ) ?? undefined,
    requireMedian:
      typeof expectedState.requireMedian === 'boolean'
        ? expectedState.requireMedian
        : typeof expectedState.require_median === 'boolean'
          ? expectedState.require_median
          : undefined,
    reportKeywords,
    reportKeywordMatchRatio:
      asFiniteNumber(
        expectedState.reportKeywordMatchRatio ??
          expectedState.report_keyword_match_ratio
      ) ?? undefined,
  };
}

function resolveExpectedKpis(ticket: ScorableTicket): HelpdeskKpis | null {
  const parsed = parseKpiReportExpectedState(ticket.expected_state);
  if (
    typeof parsed.averageResolutionHours === 'number' &&
    typeof parsed.slaCompliancePercent === 'number' &&
    parsed.volumeByCategory &&
    typeof parsed.medianResolutionHours === 'number'
  ) {
    return {
      ticketCount: 0,
      averageResolutionHours: parsed.averageResolutionHours,
      medianResolutionHours: parsed.medianResolutionHours,
      slaCompliancePercent: parsed.slaCompliancePercent,
      volumeByCategory: parsed.volumeByCategory,
    };
  }

  const csv = extractCsvFromInitialState(ticket.initial_state);
  if (!csv) return null;
  return computeKpisFromCsv(csv);
}

function extractReportFromFiles(files: Record<string, string>): string | null {
  const preferred = [
    KPI_REPORT_OUTPUT_MD,
    'output/report.md',
    'report.txt',
    'output/report.txt',
  ];
  for (const path of preferred) {
    const value = files[normalizePath(path)];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  for (const [path, value] of Object.entries(files)) {
    if (
      /(^|\/)report\.(md|txt)$/i.test(path) &&
      typeof value === 'string' &&
      value.trim()
    ) {
      return value.trim();
    }
  }
  return null;
}

function extractKpisFromFiles(
  files: Record<string, string>
): Partial<KpiReportSubmission> | null {
  const preferred = [
    KPI_REPORT_OUTPUT_JSON,
    'output/kpi.json',
    'kpis.json',
    'output/metrics.json',
  ];
  let raw: string | null = null;
  for (const path of preferred) {
    const value = files[normalizePath(path)];
    if (typeof value === 'string' && value.trim()) {
      raw = value;
      break;
    }
  }
  if (!raw) {
    for (const [path, value] of Object.entries(files)) {
      if (
        /kpi|metric/i.test(path) &&
        path.toLowerCase().endsWith('.json') &&
        typeof value === 'string' &&
        value.trim()
      ) {
        raw = value;
        break;
      }
    }
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      averageResolutionHours:
        asFiniteNumber(
          parsed.averageResolutionHours ?? parsed.average_resolution_hours
        ) ?? undefined,
      slaCompliancePercent:
        asFiniteNumber(
          parsed.slaCompliancePercent ?? parsed.sla_compliance_percent
        ) ?? undefined,
      medianResolutionHours:
        asFiniteNumber(
          parsed.medianResolutionHours ?? parsed.median_resolution_hours
        ) ?? undefined,
      volumeByCategory:
        parseVolumeByCategory(
          parsed.volumeByCategory ?? parsed.volume_by_category
        ) ?? undefined,
      report:
        typeof parsed.report === 'string' ? parsed.report.trim() : undefined,
    } as Partial<KpiReportSubmission>;
  } catch {
    return null;
  }
}

export function extractKpiReportSubmission(
  submission: TicketSubmission
): KpiReportSubmission | null {
  const files = extractKpiSubmissionFiles(submission);
  const fromFiles = Object.keys(files).length > 0 ? extractKpisFromFiles(files) : null;
  const reportFromFiles =
    Object.keys(files).length > 0 ? extractReportFromFiles(files) : null;

  const averageResolutionHours =
    asFiniteNumber(
      submission.averageResolutionHours ??
        submission.average_resolution_hours ??
        fromFiles?.averageResolutionHours
    ) ?? null;

  const slaCompliancePercent =
    asFiniteNumber(
      submission.slaCompliancePercent ??
        submission.sla_compliance_percent ??
        fromFiles?.slaCompliancePercent
    ) ?? null;

  const volumeByCategory =
    parseVolumeByCategory(
      submission.volumeByCategory ??
        submission.volume_by_category ??
        fromFiles?.volumeByCategory
    ) ?? null;

  const medianResolutionHours =
    asFiniteNumber(
      submission.medianResolutionHours ??
        submission.median_resolution_hours ??
        fromFiles?.medianResolutionHours
    ) ?? undefined;

  const reportRaw =
    (typeof submission.report === 'string' && submission.report.trim()
      ? submission.report.trim()
      : null) ??
    (typeof submission.narrative === 'string' && submission.narrative.trim()
      ? submission.narrative.trim()
      : null) ??
    (typeof fromFiles?.report === 'string' && fromFiles.report
      ? fromFiles.report
      : null) ??
    reportFromFiles;

  if (
    averageResolutionHours === null ||
    slaCompliancePercent === null ||
    !volumeByCategory ||
    !reportRaw
  ) {
    return null;
  }

  const modeRaw = submission.mode ?? submission.path;
  const mode =
    modeRaw === 'script' || modeRaw === 'manual'
      ? modeRaw
      : Object.keys(files).length > 0
        ? 'script'
        : 'manual';

  return {
    type: typeof submission.type === 'string' ? submission.type : 'kpi_report',
    mode,
    averageResolutionHours,
    slaCompliancePercent,
    volumeByCategory,
    medianResolutionHours,
    report: reportRaw,
  };
}

export function evaluateKpiReportDeterministic(
  submission: TicketSubmission,
  ticket: ScorableTicket
): {
  parsed: KpiReportSubmission | null;
  structured: KpiReportStructuredResult;
  ok: boolean;
  feedback: string;
} {
  const expectedKnobs = parseKpiReportExpectedState(ticket.expected_state);
  const minReportLength =
    typeof expectedKnobs.minReportLength === 'number' &&
    expectedKnobs.minReportLength > 0
      ? Math.floor(expectedKnobs.minReportLength)
      : KPI_REPORT_MIN_REPORT_LENGTH;
  const hoursTolerance =
    typeof expectedKnobs.hoursTolerance === 'number'
      ? expectedKnobs.hoursTolerance
      : 0.05;
  const slaTolerance =
    typeof expectedKnobs.slaTolerancePoints === 'number'
      ? expectedKnobs.slaTolerancePoints
      : 1;
  const requireMedian = expectedKnobs.requireMedian !== false;
  const keywords = expectedKnobs.reportKeywords ?? [
    'sla',
    'resolution',
    'category',
  ];
  const keywordRatio =
    typeof expectedKnobs.reportKeywordMatchRatio === 'number'
      ? expectedKnobs.reportKeywordMatchRatio
      : 0.5;

  const expected = resolveExpectedKpis(ticket);
  const parsed = extractKpiReportSubmission(submission);

  if (!expected) {
    const structured: KpiReportStructuredResult = {
      style: 'kpi_report',
      mode: parsed?.mode ?? null,
      ticketCount: null,
      matches: [],
      matchedCount: 0,
      requiredCount: 0,
      reportLength: parsed?.report.length ?? 0,
      minReportLength,
      reportOk: false,
      keywordsMatched: [],
      keywordsMissing: keywords,
      keywordsOk: false,
      reason: 'missing_expected_kpis',
    };
    return {
      parsed,
      structured,
      ok: false,
      feedback:
        'Ticket is missing expected KPI values and CSV data; cannot grade.',
    };
  }

  if (!parsed) {
    const structured: KpiReportStructuredResult = {
      style: 'kpi_report',
      mode: null,
      ticketCount: expected.ticketCount || null,
      matches: [],
      matchedCount: 0,
      requiredCount: requireMedian ? 4 : 3,
      reportLength: 0,
      minReportLength,
      reportOk: false,
      keywordsMatched: [],
      keywordsMissing: keywords,
      keywordsOk: false,
      reason: 'missing_fields',
    };
    return {
      parsed: null,
      structured,
      ok: false,
      feedback:
        'Submission must include averageResolutionHours, slaCompliancePercent, volumeByCategory, and a short written report (form fields or output/kpis.json + report.md).',
    };
  }

  const matches: KpiFieldMatch[] = [];

  const avgOk = withinTolerance(
    parsed.averageResolutionHours,
    expected.averageResolutionHours,
    hoursTolerance
  );
  matches.push({
    field: 'averageResolutionHours',
    expected: expected.averageResolutionHours,
    actual: parsed.averageResolutionHours,
    matched: avgOk,
    detail: avgOk
      ? undefined
      : `expected ${expected.averageResolutionHours} ± ${hoursTolerance}`,
  });

  const slaOk = withinTolerance(
    parsed.slaCompliancePercent,
    expected.slaCompliancePercent,
    slaTolerance
  );
  matches.push({
    field: 'slaCompliancePercent',
    expected: expected.slaCompliancePercent,
    actual: parsed.slaCompliancePercent,
    matched: slaOk,
    detail: slaOk
      ? undefined
      : `expected ${expected.slaCompliancePercent} ± ${slaTolerance}`,
  });

  const volumeOk = volumesMatch(
    parsed.volumeByCategory,
    expected.volumeByCategory
  );
  matches.push({
    field: 'volumeByCategory',
    expected: expected.volumeByCategory,
    actual: parsed.volumeByCategory,
    matched: volumeOk,
    detail: volumeOk ? undefined : 'category counts must match exactly',
  });

  if (requireMedian) {
    const actualMedian = parsed.medianResolutionHours;
    const medianOk =
      typeof actualMedian === 'number' &&
      withinTolerance(
        actualMedian,
        expected.medianResolutionHours,
        hoursTolerance
      );
    matches.push({
      field: 'medianResolutionHours',
      expected: expected.medianResolutionHours,
      actual: actualMedian ?? null,
      matched: medianOk,
      detail: medianOk
        ? undefined
        : `expected ${expected.medianResolutionHours} ± ${hoursTolerance}`,
    });
  }

  const reportLength = parsed.report.length;
  const reportOk = reportLength >= minReportLength;
  const reportLower = parsed.report.toLowerCase();
  const keywordsMatched = keywords.filter((kw) =>
    reportLower.includes(kw.toLowerCase())
  );
  const keywordsMissing = keywords.filter(
    (kw) => !reportLower.includes(kw.toLowerCase())
  );
  const requiredKeywordHits = Math.ceil(keywords.length * keywordRatio);
  const keywordsOk = keywordsMatched.length >= requiredKeywordHits;

  const matchedCount = matches.filter((m) => m.matched).length;
  const requiredCount = matches.length;
  const kpisOk = matchedCount === requiredCount;
  const ok = kpisOk && reportOk && keywordsOk;

  const structured: KpiReportStructuredResult = {
    style: 'kpi_report',
    mode: parsed.mode ?? null,
    ticketCount: expected.ticketCount || null,
    matches,
    matchedCount,
    requiredCount,
    reportLength,
    minReportLength,
    reportOk,
    keywordsMatched,
    keywordsMissing,
    keywordsOk,
    reason: ok ? undefined : 'kpi_mismatch',
  };

  if (ok) {
    return {
      parsed,
      structured,
      ok: true,
      feedback: `KPI report accepted (${matchedCount}/${requiredCount} metrics match; report ${reportLength} chars).`,
    };
  }

  const failed = matches
    .filter((m) => !m.matched)
    .map((m) => m.field)
    .join(', ');
  const parts: string[] = [];
  if (!kpisOk) {
    parts.push(
      `KPI mismatch on: ${failed || 'unknown'}. Re-check formulas against the CSV (avg/median hours to 2 decimals; SLA % rounded; category counts exact).`
    );
  }
  if (!reportOk) {
    parts.push(
      `Report must be at least ${minReportLength} characters.`
    );
  }
  if (!keywordsOk) {
    parts.push(
      `Report should discuss the metrics (missing cues: ${keywordsMissing.join(', ') || 'n/a'}).`
    );
  }

  return {
    parsed,
    structured,
    ok: false,
    feedback: parts.join(' '),
  };
}

export const kpiReportTicketScorer: TicketScorer = {
  score(submission, ticket) {
    const { structured, ok, feedback } = evaluateKpiReportDeterministic(
      submission,
      ticket
    );

    return {
      status: ok ? 'resolved' : 'needs_revision',
      structuredResult: structured,
      feedback,
    } satisfies TicketScoreResult;
  },
};
