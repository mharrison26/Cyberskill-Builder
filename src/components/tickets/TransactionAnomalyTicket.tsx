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
import { Label } from '@/components/ui/label';
import {
  ANOMALY_RULE_DEFINITIONS,
  transactionsToCsv,
  type AnomalyTransaction,
} from '@/lib/anomaly/mockTransactions';
import { parseAnomalyTransactions } from '@/lib/scoring/transactionAnomaly';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type TransactionAnomalyTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type WorkMode = 'select' | 'sandbox';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
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

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Flatten initial_state.files for CodeSandbox. */
function filesFromInitialState(
  initialState: Record<string, unknown>,
  csvText: string
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
      path === 'transactions' ||
      path === 'rows' ||
      path === 'rules' ||
      path === 'prompt' ||
      path === 'title' ||
      path === 'ticketCode' ||
      path === 'ticket_code' ||
      path === 'spreadsheetApproach' ||
      path === 'spreadsheet_approach' ||
      path === 'expected_config' ||
      path === 'expected_state'
    ) {
      continue;
    }
    if (typeof value === 'string') {
      files[path] = value;
    }
  }

  if (Object.keys(files).length > 0) return files;

  return {
    'data/ap_transactions.csv': csvText,
    'README.md': `# AP anomaly detection lab

Analyze \`data/ap_transactions.csv\` using the stated rules, then select the anomalous transaction IDs in the ticket form.

## Rules
1. Duplicate payment — same invoice_id on more than one row (flag every copy)
2. Round-dollar — amount is an exact whole number of dollars (no cents)
3. Weekend — date is Saturday or Sunday

## Path A — WebContainer (PI-04)
\`\`\`bash
node analyze_anomalies.mjs
# or, if Python is available in your environment:
python3 analyze_anomalies.py
\`\`\`

## Path B — Spreadsheet
Download the CSV, then filter/sort:
- Sort by invoice_id and flag groups with more than one row
- Filter amount where the value equals INT(amount) / has no cents
- Filter date to weekend days (Sat/Sun)
`,
    'analyze_anomalies.mjs': `/**
 * Starter: detect AP anomalies in data/ap_transactions.csv
 * Run: node analyze_anomalies.mjs
 */
import fs from 'node:fs';

const csv = fs.readFileSync('data/ap_transactions.csv', 'utf8').trim();
const [header, ...lines] = csv.split(/\\r?\\n/);
const cols = header.split(',');
const idx = Object.fromEntries(cols.map((c, i) => [c, i]));

const rows = lines.filter(Boolean).map((line) => {
  const cells = line.split(',');
  return {
    id: cells[idx.transaction_id],
    date: cells[idx.date],
    invoiceId: cells[idx.invoice_id],
    amount: Number(cells[idx.amount]),
  };
});

// TODO: implement the three rules, then print sorted anomaly IDs.
console.log('Loaded', rows.length, 'transactions. Implement detection rules.');
`,
    'analyze_anomalies.py': `"""Starter: detect AP anomalies in data/ap_transactions.csv

Run (when Python is available): python3 analyze_anomalies.py
In the browser WebContainer, prefer: node analyze_anomalies.mjs
"""

from __future__ import annotations

import csv
from collections import defaultdict
from datetime import date
from pathlib import Path

rows = list(csv.DictReader(Path("data/ap_transactions.csv").open()))

# TODO: implement duplicate invoice_id, round-dollar, and weekend rules.
print(f"Loaded {len(rows)} transactions. Implement detection rules.")
`,
  };
}

const DEFAULT_SPREADSHEET = `Spreadsheet approach (when the sandbox is unavailable):
1. Download the CSV and open it in Excel / Google Sheets / LibreOffice.
2. Duplicate payments — sort by invoice_id; highlight every row in a group that appears more than once.
3. Round-dollar amounts — filter or helper column where amount equals INT(amount) (no cents), e.g. =A2=INT(A2).
4. Weekend transactions — add a weekday column (=WEEKDAY(date,1) or TEXT) and keep Saturday/Sunday rows.
5. Union the three result sets (unique transaction_id), then check those IDs in the form below.`;

export function TransactionAnomalyTicket({
  ticket,
  readOnly = false,
  className,
}: TransactionAnomalyTicketProps) {
  const initialState = asRecord(ticket.initial_state);

  const transactions = useMemo(
    () => parseAnomalyTransactions(initialState),
    [ticket.initial_state]
  );

  const csvText = useMemo(() => {
    const embedded = readString(initialState, ['csv', 'csvText'], '');
    if (embedded) return embedded.endsWith('\n') ? embedded : `${embedded}\n`;
    return transactionsToCsv(transactions);
  }, [initialState, transactions]);

  const sandboxFiles = useMemo(
    () => filesFromInitialState(initialState, csvText),
    [initialState, csvText]
  );

  const rules = useMemo(() => {
    const raw = initialState.rules;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw
        .filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === 'object' && !Array.isArray(item))
        )
        .map((item, index) => ({
          id: typeof item.id === 'string' ? item.id : `rule-${index + 1}`,
          label:
            typeof item.label === 'string'
              ? item.label
              : ANOMALY_RULE_DEFINITIONS[index]?.label ?? `Rule ${index + 1}`,
          detail:
            typeof item.detail === 'string'
              ? item.detail
              : ANOMALY_RULE_DEFINITIONS[index]?.detail ?? '',
        }));
    }
    return ANOMALY_RULE_DEFINITIONS;
  }, [initialState]);

  const meta = useMemo(
    () => ({
      ticketCode: readString(
        initialState,
        ['ticketCode', 'ticket_code'],
        'GRC-ANOMALY'
      ),
      title: readString(
        initialState,
        ['title'],
        'Identify anomalous AP transactions'
      ),
      prompt: readString(
        initialState,
        ['prompt'],
        'Review the accounts-payable CSV. Using only the stated rules, flag every anomalous transaction. You may analyze with the WebContainer sandbox (Python/Node) or a spreadsheet, then select the matching transaction IDs below.'
      ),
      spreadsheetApproach: readString(
        initialState,
        ['spreadsheetApproach', 'spreadsheet_approach'],
        DEFAULT_SPREADSHEET
      ),
    }),
    [initialState]
  );

  const [mode, setMode] = useState<WorkMode>('select');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function toggleId(id: string) {
    if (readOnly) return;
    clearOutcome();
    setError(null);
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function downloadCsv() {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ap_transactions.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    clearOutcome();
    if (selectedIds.length === 0) {
      setError('Select at least one anomalous transaction (or re-check your analysis).');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'transaction_anomaly',
          anomalyTransactionIds: selectedIds,
          anomalyCount: selectedIds.length,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit anomalies.');
      }

      setScoreStatus(payload.status ?? null);
      setFeedback(payload.feedback ?? 'Submission recorded.');
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Something went wrong while submitting.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="transaction-anomaly-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="transaction-anomaly-heading" className="text-lg font-semibold">
          Transaction anomaly detection
        </h2>
        <Badge variant="secondary">{meta.ticketCode}</Badge>
        <Badge variant="outline">{transactions.length} rows</Badge>
        <Badge variant="outline">PI-04 · WebContainer optional</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{meta.prompt}</p>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Anomaly criteria</CardTitle>
          <CardDescription>
            Apply every rule. A transaction can match more than one rule; select
            it once. Do not use judgment beyond these definitions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            {rules.map((rule) => (
              <li key={rule.id}>
                <span className="font-medium text-foreground">{rule.label}</span>
                {rule.detail ? (
                  <p className="mt-0.5 text-muted-foreground">{rule.detail}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{meta.title}</CardTitle>
          <CardDescription>
            CSV columns: transaction_id, date, vendor, invoice_id, amount,
            currency, description, department.
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
          <TransactionTable
            ticketId={ticket.id}
            transactions={transactions}
            selectedSet={selectedSet}
            readOnly={readOnly}
            onToggle={toggleId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Analysis paths</CardTitle>
          <CardDescription>
            Path A uses the in-browser WebContainer. Path B is a spreadsheet
            workflow if the sandbox is unavailable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="inline-flex rounded-lg border border-border p-1"
            role="group"
            aria-label="Work mode"
          >
            <Button
              type="button"
              size="sm"
              variant={mode === 'select' ? 'default' : 'ghost'}
              onClick={() => setMode('select')}
              disabled={readOnly}
            >
              Spreadsheet / select
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'sandbox' ? 'default' : 'ghost'}
              onClick={() => setMode('sandbox')}
              disabled={readOnly}
            >
              WebContainer sandbox
            </Button>
          </div>

          {mode === 'sandbox' ? (
            <div className="space-y-3">
              <p className="max-w-prose text-sm text-muted-foreground">
                Boot the PI-04 WebContainer, inspect{' '}
                <code className="text-foreground">data/ap_transactions.csv</code>
                , and run{' '}
                <code className="text-foreground">node analyze_anomalies.mjs</code>{' '}
                (Python stub{' '}
                <code className="text-foreground">analyze_anomalies.py</code>{' '}
                is included for environments with Python). Then mark the IDs in
                the table above.
              </p>
              <CodeSandbox
                ticketId={ticket.id}
                initialState={sandboxFiles}
                showSubmit={false}
                readOnly={readOnly}
              />
            </div>
          ) : (
            <p className="max-w-prose whitespace-pre-wrap text-sm text-muted-foreground">
              {meta.spreadsheetApproach}
            </p>
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Selected anomalies:{' '}
            <span className="font-medium text-foreground">
              {selectedIds.length}
            </span>
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={readOnly || selectedIds.length === 0}
            onClick={() => {
              clearOutcome();
              setSelectedIds([]);
            }}
          >
            Clear selection
          </Button>
          <Button type="submit" disabled={readOnly || isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit anomalies'}
          </Button>
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}
        {feedback ? (
          <p
            className={cn(
              'text-sm',
              scoreStatus === 'resolved'
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-800 dark:text-amber-300'
            )}
            role="status"
          >
            {scoreStatus ? `[${scoreStatus}] ` : null}
            {feedback}
          </p>
        ) : null}
      </form>
    </section>
  );
}

function TransactionTable({
  ticketId,
  transactions,
  selectedSet,
  readOnly,
  onToggle,
}: {
  ticketId: string;
  transactions: AnomalyTransaction[];
  selectedSet: Set<string>;
  readOnly: boolean;
  onToggle: (id: string) => void;
}) {
  if (transactions.length === 0) {
    return (
      <p className="text-sm text-destructive" role="alert">
        No transactions are configured on this ticket.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Anomaly</th>
            <th className="px-3 py-2 font-medium">ID</th>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Vendor</th>
            <th className="px-3 py-2 font-medium">Invoice</th>
            <th className="px-3 py-2 font-medium">Amount</th>
            <th className="px-3 py-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((row) => {
            const checked = selectedSet.has(row.id);
            const inputId = `${ticketId}-anomaly-${row.id}`;
            return (
              <tr
                key={row.id}
                className={cn(
                  'border-b border-border/70 last:border-0',
                  checked && 'bg-primary/5'
                )}
              >
                <td className="px-3 py-2 align-middle">
                  <Label
                    htmlFor={inputId}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 font-normal',
                      readOnly && 'cursor-default opacity-80'
                    )}
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={checked}
                      disabled={readOnly}
                      onChange={() => onToggle(row.id)}
                    />
                    <span className="sr-only">
                      Mark {row.id} as anomaly
                    </span>
                  </Label>
                </td>
                <td className="px-3 py-2 align-middle font-mono text-xs">
                  {row.id}
                </td>
                <td className="px-3 py-2 align-middle font-mono text-xs">
                  {row.date}
                </td>
                <td className="px-3 py-2 align-middle">{row.vendor}</td>
                <td className="px-3 py-2 align-middle font-mono text-xs">
                  {row.invoiceId}
                </td>
                <td className="px-3 py-2 align-middle font-mono text-xs">
                  {formatAmount(row.amount)}
                </td>
                <td className="px-3 py-2 align-middle text-muted-foreground">
                  {row.description}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
