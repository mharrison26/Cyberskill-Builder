'use client';

import { useMemo, useState } from 'react';

import { CodeSandbox } from '@/components/CodeSandbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  extractCsvFromInitialState,
  parseResolvedTicketsCsv,
} from '@/lib/helpdesk/kpiMetrics';
import { KPI_REPORT_MIN_REPORT_LENGTH } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type KpiReportTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type WorkMode = 'manual' | 'script';

type FormErrors = Partial<
  Record<
    | 'averageResolutionHours'
    | 'slaCompliancePercent'
    | 'medianResolutionHours'
    | 'volumeByCategory'
    | 'report',
    string
  >
>;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Flatten initial_state.files (or top-level string paths) for CodeSandbox. */
function initialStateToFiles(
  initialState: Record<string, unknown>
): Record<string, string> {
  const nested = initialState.files;
  const source =
    typeof nested === 'object' && nested !== null && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : initialState;

  const files: Record<string, string> = {};
  for (const [path, value] of Object.entries(source)) {
    if (
      path === 'files' ||
      path === 'csv' ||
      path === 'csvText' ||
      path === 'expected_config' ||
      path === 'expected_state' ||
      path === 'rules'
    ) {
      continue;
    }
    if (typeof value === 'string') {
      files[path] = value;
    }
  }
  return files;
}

function readString(
  source: Record<string, unknown>,
  keys: string[],
  fallback: string
): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return fallback;
}

function resolveMinReportLength(expectedState: Record<string, unknown>): number {
  const value = expectedState.minReportLength ?? expectedState.min_report_length;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return KPI_REPORT_MIN_REPORT_LENGTH;
}

function parseVolumeInput(raw: string): Record<string, number> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        const n = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(n)) return null;
        out[key.trim().toLowerCase().replace(/\s+/g, '_')] = Math.round(n);
      }
      return Object.keys(out).length > 0 ? out : null;
    }
  } catch {
    // fall through to key:value parser
  }

  const out: Record<string, number> = {};
  for (const part of trimmed.split(/[,;\n]+/)) {
    const m = part.trim().match(/^([a-z0-9_ -]+)\s*[:=]\s*(\d+)\s*$/i);
    if (!m) continue;
    out[m[1]!.trim().toLowerCase().replace(/\s+/g, '_')] = Number(m[2]);
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function KpiReportTicket({
  ticket,
  readOnly = false,
  className,
}: KpiReportTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const minReportLength = resolveMinReportLength(expectedState);

  const csvText = useMemo(
    () => extractCsvFromInitialState(initialState) ?? '',
    [initialState]
  );

  const preview = useMemo(() => {
    const rows = parseResolvedTicketsCsv(csvText);
    const categories = Array.from(
      new Set(rows.map((row) => row.category))
    ).sort();
    return {
      rowCount: rows.length,
      categories,
      sampleRows: rows.slice(0, 8),
    };
  }, [csvText]);

  const sandboxFiles = useMemo(() => {
    const fromInitial = initialStateToFiles(initialState);
    if (Object.keys(fromInitial).length > 0) return fromInitial;
    if (!csvText) return {};
    return {
      'data/resolved_tickets.csv': csvText,
      'README.md':
        '# KPI report lab\n\nAnalyze `data/resolved_tickets.csv` and write `output/kpis.json` plus `report.md`.\n',
      'analyze.mjs':
        "// Complete analyze.mjs — see ticket instructions.\nconsole.log('TODO');\n",
    };
  }, [csvText, initialState]);

  const meta = useMemo(
    () => ({
      ticketCode: readString(initialState, ['ticketCode', 'ticket_code'], 'HD-05'),
      title: readString(
        initialState,
        ['title'],
        'Compute helpdesk KPIs from resolved tickets'
      ),
      prompt: readString(
        initialState,
        ['prompt'],
        'Using the CSV of resolved tickets, compute average resolution time (hours), SLA compliance rate (%), ticket volume by category, and median resolution time (hours). Present the results in a short written report.'
      ),
    }),
    [initialState]
  );

  const [mode, setMode] = useState<WorkMode>('manual');
  const [averageResolutionHours, setAverageResolutionHours] = useState('');
  const [slaCompliancePercent, setSlaCompliancePercent] = useState('');
  const [medianResolutionHours, setMedianResolutionHours] = useState('');
  const [volumeByCategory, setVolumeByCategory] = useState(
    preview.categories.length > 0
      ? JSON.stringify(
          Object.fromEntries(preview.categories.map((c) => [c, 0])),
          null,
          2
        )
      : '{\n  "access": 0\n}'
  );
  const [report, setReport] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function validate(): boolean {
    const next: FormErrors = {};
    if (!averageResolutionHours.trim() || Number.isNaN(Number(averageResolutionHours))) {
      next.averageResolutionHours = 'Enter average resolution hours (number).';
    }
    if (
      !slaCompliancePercent.trim() ||
      Number.isNaN(Number(slaCompliancePercent.replace(/%$/, '')))
    ) {
      next.slaCompliancePercent = 'Enter SLA compliance percent (number).';
    }
    if (!medianResolutionHours.trim() || Number.isNaN(Number(medianResolutionHours))) {
      next.medianResolutionHours = 'Enter median resolution hours (number).';
    }
    if (!parseVolumeInput(volumeByCategory)) {
      next.volumeByCategory =
        'Enter volume by category as JSON or access:18, hardware:12, …';
    }
    if (report.trim().length < minReportLength) {
      next.report = `Report must be at least ${minReportLength} characters.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    clearOutcome();
    if (!validate()) return;

    const volume = parseVolumeInput(volumeByCategory);
    if (!volume) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'kpi_report',
          mode,
          averageResolutionHours: Number(averageResolutionHours),
          slaCompliancePercent: Number(
            slaCompliancePercent.trim().replace(/%$/, '')
          ),
          medianResolutionHours: Number(medianResolutionHours),
          volumeByCategory: volume,
          report: report.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit KPI report.');
      }

      setScoreStatus(payload.status ?? null);
      setFeedback(payload.feedback ?? 'Submission recorded.');
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Something went wrong while submitting.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function downloadCsv() {
    if (!csvText) return;
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'resolved_tickets.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      aria-labelledby="kpi-report-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="kpi-report-heading" className="text-lg font-semibold">
          KPI report
        </h2>
        <Badge variant="secondary">{meta.ticketCode}</Badge>
        <Badge variant="outline">{preview.rowCount} tickets</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{meta.prompt}</p>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{meta.title}</CardTitle>
          <CardDescription>
            CSV columns: ticket_id, category, priority, created_at, resolved_at,
            sla_minutes. Compute hours from created→resolved; a ticket meets SLA
            when that duration ≤ sla_minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadCsv}
              disabled={!csvText}
            >
              Download CSV
            </Button>
          </div>
          {preview.sampleRows.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">ticket_id</th>
                    <th className="px-2 py-1.5 font-medium">category</th>
                    <th className="px-2 py-1.5 font-medium">priority</th>
                    <th className="px-2 py-1.5 font-medium">created_at</th>
                    <th className="px-2 py-1.5 font-medium">resolved_at</th>
                    <th className="px-2 py-1.5 font-medium">sla_minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.map((row) => (
                    <tr key={row.ticketId} className="border-t border-border">
                      <td className="px-2 py-1 font-mono">{row.ticketId}</td>
                      <td className="px-2 py-1">{row.category}</td>
                      <td className="px-2 py-1">{row.priority}</td>
                      <td className="px-2 py-1 font-mono">{row.createdAt}</td>
                      <td className="px-2 py-1 font-mono">{row.resolvedAt}</td>
                      <td className="px-2 py-1 font-mono">{row.slaMinutes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
                Showing first {preview.sampleRows.length} of {preview.rowCount}{' '}
                rows. Download the full CSV for analysis.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No CSV rows available on this ticket.
            </p>
          )}
        </CardContent>
      </Card>

      <div
        className="inline-flex rounded-lg border border-border p-1"
        role="group"
        aria-label="Work mode"
      >
        <Button
          type="button"
          size="sm"
          variant={mode === 'manual' ? 'default' : 'ghost'}
          onClick={() => setMode('manual')}
          disabled={readOnly}
        >
          Manual
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'script' ? 'default' : 'ghost'}
          onClick={() => setMode('script')}
          disabled={readOnly}
        >
          Script (Node / Python)
        </Button>
      </div>

      {mode === 'script' ? (
        <div className="space-y-3">
          <p className="max-w-prose text-sm text-muted-foreground">
            Use the lab sandbox to analyze the CSV. In this browser environment
            run <code className="text-foreground">node analyze.mjs</code>. Python
            track students can complete <code className="text-foreground">analyze.py</code>{' '}
            with the same output contract. Write{' '}
            <code className="text-foreground">output/kpis.json</code> and{' '}
            <code className="text-foreground">report.md</code>, then submit from
            the sandbox — or paste results into the form below.
          </p>
          <CodeSandbox
            ticketId={ticket.id}
            initialState={sandboxFiles}
            readOnly={readOnly}
          />
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="kpi-avg">Average resolution (hours)</Label>
            <Input
              id="kpi-avg"
              inputMode="decimal"
              value={averageResolutionHours}
              onChange={(e) => {
                clearOutcome();
                setAverageResolutionHours(e.target.value);
              }}
              disabled={readOnly}
              placeholder="e.g. 7.27"
              aria-invalid={Boolean(errors.averageResolutionHours)}
            />
            {errors.averageResolutionHours ? (
              <p className="text-xs text-destructive">
                {errors.averageResolutionHours}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="kpi-sla">SLA compliance (%)</Label>
            <Input
              id="kpi-sla"
              inputMode="decimal"
              value={slaCompliancePercent}
              onChange={(e) => {
                clearOutcome();
                setSlaCompliancePercent(e.target.value);
              }}
              disabled={readOnly}
              placeholder="e.g. 83"
              aria-invalid={Boolean(errors.slaCompliancePercent)}
            />
            {errors.slaCompliancePercent ? (
              <p className="text-xs text-destructive">
                {errors.slaCompliancePercent}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="kpi-median">Median resolution (hours)</Label>
            <Input
              id="kpi-median"
              inputMode="decimal"
              value={medianResolutionHours}
              onChange={(e) => {
                clearOutcome();
                setMedianResolutionHours(e.target.value);
              }}
              disabled={readOnly}
              placeholder="e.g. 3.5"
              aria-invalid={Boolean(errors.medianResolutionHours)}
            />
            {errors.medianResolutionHours ? (
              <p className="text-xs text-destructive">
                {errors.medianResolutionHours}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="kpi-volume">Ticket volume by category</Label>
          <Textarea
            id="kpi-volume"
            value={volumeByCategory}
            onChange={(e) => {
              clearOutcome();
              setVolumeByCategory(e.target.value);
            }}
            disabled={readOnly}
            rows={6}
            className="font-mono text-xs"
            aria-invalid={Boolean(errors.volumeByCategory)}
          />
          {errors.volumeByCategory ? (
            <p className="text-xs text-destructive">{errors.volumeByCategory}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              JSON object or comma-separated pairs. Categories in this CSV:{' '}
              {preview.categories.join(', ') || 'n/a'}.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="kpi-report">Short written report</Label>
          <Textarea
            id="kpi-report"
            value={report}
            onChange={(e) => {
              clearOutcome();
              setReport(e.target.value);
            }}
            disabled={readOnly}
            rows={6}
            placeholder="Summarize average resolution, SLA compliance, category volume, and what the median suggests about the distribution…"
            aria-invalid={Boolean(errors.report)}
          />
          {errors.report ? (
            <p className="text-xs text-destructive">{errors.report}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {report.trim().length}/{minReportLength} characters minimum. Mention
              SLA, resolution time, and category volume.
            </p>
          )}
        </div>

        {!readOnly ? (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit KPI report'}
          </Button>
        ) : null}

        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}
        {feedback ? (
          <div
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
            role="status"
          >
            {scoreStatus ? (
              <p className="mb-1 font-medium capitalize">
                Status: {scoreStatus.replace(/_/g, ' ')}
              </p>
            ) : null}
            <p className="text-muted-foreground">{feedback}</p>
          </div>
        ) : null}
      </form>
    </section>
  );
}
