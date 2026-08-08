/**
 * Client-safe helpers for helpdesk KPI report tickets.
 * Parse a resolved-ticket CSV and compute deterministic KPIs.
 *
 * Formulas:
 *   averageResolutionHours = mean((resolved_at - created_at) hours), round half-up to 2 decimals
 *   medianResolutionHours  = median of those hours, round half-up to 2 decimals
 *   slaCompliancePercent   = round(100 * within_sla / countable) where within_sla means
 *                            (resolved_at - created_at) <= sla_minutes
 *   volumeByCategory       = integer counts keyed by lowercase category
 */

export type ResolvedTicketRow = {
  ticketId: string;
  category: string;
  priority: string;
  createdAt: string;
  resolvedAt: string;
  slaMinutes: number;
  /** Resolution duration in hours (fractional). */
  resolutionHours: number;
  withinSla: boolean;
};

export type HelpdeskKpis = {
  ticketCount: number;
  averageResolutionHours: number;
  medianResolutionHours: number;
  slaCompliancePercent: number;
  volumeByCategory: Record<string, number>;
};

export const KPI_REPORT_CSV_FILENAME = 'data/resolved_tickets.csv';
export const KPI_REPORT_OUTPUT_JSON = 'output/kpis.json';
export const KPI_REPORT_OUTPUT_MD = 'report.md';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function headerIndex(headers: string[], ...aliases: string[]): number {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Parse resolved-ticket CSV text into typed rows (skips invalid lines). */
export function parseResolvedTicketsCsv(csvText: string): ResolvedTicketRow[] {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]!);
  const idIdx = headerIndex(headers, 'ticket_id', 'id', 'ticketid');
  const catIdx = headerIndex(headers, 'category');
  const priIdx = headerIndex(headers, 'priority');
  const createdIdx = headerIndex(headers, 'created_at', 'created', 'opened_at');
  const resolvedIdx = headerIndex(
    headers,
    'resolved_at',
    'resolved',
    'closed_at'
  );
  const slaIdx = headerIndex(headers, 'sla_minutes', 'sla', 'sla_min');

  if (createdIdx < 0 || resolvedIdx < 0 || slaIdx < 0 || catIdx < 0) {
    return [];
  }

  const rows: ResolvedTicketRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const createdAt = cells[createdIdx] ?? '';
    const resolvedAt = cells[resolvedIdx] ?? '';
    const slaMinutes = Number(cells[slaIdx]);
    const category = (cells[catIdx] ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');

    if (!createdAt || !resolvedAt || !category) continue;
    if (!Number.isFinite(slaMinutes) || slaMinutes < 0) continue;

    const createdMs = Date.parse(createdAt);
    const resolvedMs = Date.parse(resolvedAt);
    if (Number.isNaN(createdMs) || Number.isNaN(resolvedMs)) continue;
    if (resolvedMs < createdMs) continue;

    const resolutionMs = resolvedMs - createdMs;
    const resolutionHours = resolutionMs / 3_600_000;
    const withinSla = resolutionMs <= slaMinutes * 60_000;

    rows.push({
      ticketId: (cells[idIdx] ?? `row-${i}`).trim(),
      category,
      priority: (cells[priIdx] ?? '').trim().toUpperCase(),
      createdAt,
      resolvedAt,
      slaMinutes,
      resolutionHours,
      withinSla,
    });
  }

  return rows;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Compute the four KPIs from parsed rows. */
export function computeHelpdeskKpis(rows: ResolvedTicketRow[]): HelpdeskKpis {
  if (rows.length === 0) {
    return {
      ticketCount: 0,
      averageResolutionHours: 0,
      medianResolutionHours: 0,
      slaCompliancePercent: 0,
      volumeByCategory: {},
    };
  }

  const hours = rows.map((row) => row.resolutionHours);
  const avg = hours.reduce((sum, h) => sum + h, 0) / hours.length;
  const within = rows.filter((row) => row.withinSla).length;
  const volumeByCategory: Record<string, number> = {};

  for (const row of rows) {
    volumeByCategory[row.category] = (volumeByCategory[row.category] ?? 0) + 1;
  }

  return {
    ticketCount: rows.length,
    averageResolutionHours: round2(avg),
    medianResolutionHours: round2(median(hours)),
    slaCompliancePercent: Math.round((within / rows.length) * 100),
    volumeByCategory,
  };
}

/** Parse CSV text and compute KPIs in one step. */
export function computeKpisFromCsv(csvText: string): HelpdeskKpis {
  return computeHelpdeskKpis(parseResolvedTicketsCsv(csvText));
}

/** Extract CSV text from ticket.initial_state (csv field or sandbox files). */
export function extractCsvFromInitialState(
  initialState: Record<string, unknown> | null | undefined
): string | null {
  if (!initialState || typeof initialState !== 'object') return null;

  if (typeof initialState.csv === 'string' && initialState.csv.trim()) {
    return initialState.csv;
  }
  if (typeof initialState.csvText === 'string' && initialState.csvText.trim()) {
    return initialState.csvText;
  }

  const files = initialState.files;
  if (files && typeof files === 'object' && !Array.isArray(files)) {
    const map = files as Record<string, unknown>;
    const preferred = [
      KPI_REPORT_CSV_FILENAME,
      'data/resolved_tickets.csv',
      'resolved_tickets.csv',
      'tickets.csv',
    ];
    for (const path of preferred) {
      const value = map[path];
      if (typeof value === 'string' && value.trim()) return value;
    }
    for (const [path, value] of Object.entries(map)) {
      if (
        typeof value === 'string' &&
        value.trim() &&
        path.toLowerCase().endsWith('.csv')
      ) {
        return value;
      }
    }
  }

  return null;
}
