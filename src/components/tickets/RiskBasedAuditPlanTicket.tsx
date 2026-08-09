'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

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
import { Textarea } from '@/components/ui/textarea';
import {
  parseRiskRegister,
  type RiskRegisterArea,
  type RiskRating,
} from '@/lib/scoring/riskBasedAuditPlan';
import {
  RISK_BASED_AUDIT_PLAN_DEFAULT_CAPACITY,
  RISK_BASED_AUDIT_PLAN_MIN_CAPACITY_NOTES_LENGTH,
  RISK_BASED_AUDIT_PLAN_MIN_JUSTIFICATION_LENGTH,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type RiskBasedAuditPlanTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type PlanRow = {
  areaId: string;
  justification: string;
};

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
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function resolvePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

function residualTone(rating: RiskRating): string {
  if (rating === 'critical') {
    return 'border-destructive/30 bg-destructive/10 text-destructive';
  }
  if (rating === 'high') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400';
  }
  if (rating === 'medium') {
    return 'border-border bg-muted/50 text-foreground';
  }
  return 'border-border bg-muted/30 text-muted-foreground';
}

function formatOrgProfile(initialState: Record<string, unknown>): {
  name: string;
  lines: string[];
} {
  const org = initialState.organization ?? initialState.orgProfile;
  if (typeof org === 'string' && org.trim()) {
    return { name: org.trim(), lines: [] };
  }
  const record = asRecord(org);
  const name =
    (typeof record.name === 'string' && record.name.trim()) ||
    readString(initialState, ['organizationName'], 'Organization');

  const lines: string[] = [];
  for (const key of [
    'industry',
    'employees',
    'revenue',
    'description',
    'auditUniverse',
    'fiscalYear',
    'notes',
  ]) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      lines.push(value.trim());
    }
  }
  return { name, lines };
}

export function RiskBasedAuditPlanTicket({
  ticket,
  readOnly = false,
  className,
}: RiskBasedAuditPlanTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const riskRegister = useMemo(
    () => parseRiskRegister(initialState),
    [initialState]
  );

  const auditCapacity = resolvePositiveInt(
    expectedState.auditCapacity ??
      initialState.auditCapacity ??
      initialState.audit_capacity ??
      initialState.capacity,
    RISK_BASED_AUDIT_PLAN_DEFAULT_CAPACITY
  );

  const minJustificationLength = resolvePositiveInt(
    expectedState.minJustificationLength,
    RISK_BASED_AUDIT_PLAN_MIN_JUSTIFICATION_LENGTH
  );
  const minCapacityNotesLength = resolvePositiveInt(
    expectedState.minCapacityNotesLength,
    RISK_BASED_AUDIT_PLAN_MIN_CAPACITY_NOTES_LENGTH
  );

  const prompt = readString(
    initialState,
    ['prompt'],
    `Build a prioritized annual audit plan of ${auditCapacity} engagements from the risk register. Justify each selection and note capacity tradeoffs.`
  );

  const org = useMemo(() => formatOrgProfile(initialState), [initialState]);

  const byId = useMemo(() => {
    const map = new Map<string, RiskRegisterArea>();
    for (const area of riskRegister) {
      map.set(area.id, area);
    }
    return map;
  }, [riskRegister]);

  const [planRows, setPlanRows] = useState<PlanRow[]>(() =>
    Array.from({ length: auditCapacity }, () => ({
      areaId: '',
      justification: '',
    }))
  );
  const [capacityNotes, setCapacityNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedIds = planRows.map((row) => row.areaId).filter(Boolean);

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
    setFormError(null);
  }

  function updateRow(index: number, patch: Partial<PlanRow>) {
    if (readOnly) return;
    clearOutcome();
    setPlanRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  function moveRow(index: number, direction: -1 | 1) {
    if (readOnly) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= planRows.length) return;
    clearOutcome();
    setPlanRows((prev) => {
      const next = [...prev];
      const tmp = next[index]!;
      next[index] = next[nextIndex]!;
      next[nextIndex] = tmp;
      return next;
    });
  }

  function availableAreasForRow(rowIndex: number): RiskRegisterArea[] {
    const currentId = planRows[rowIndex]?.areaId;
    return riskRegister.filter(
      (area) => area.id === currentId || !selectedIds.includes(area.id)
    );
  }

  function validate(): boolean {
    if (planRows.length !== auditCapacity) {
      setFormError(`Plan must include exactly ${auditCapacity} audit areas.`);
      return false;
    }

    for (let i = 0; i < planRows.length; i++) {
      const row = planRows[i]!;
      if (!row.areaId) {
        setFormError(
          `Priority ${i + 1}: select an audit area from the register.`
        );
        return false;
      }
      if (row.justification.trim().length < minJustificationLength) {
        setFormError(
          `Priority ${i + 1}: justification must be at least ${minJustificationLength} characters.`
        );
        return false;
      }
    }

    const unique = new Set(planRows.map((row) => row.areaId));
    if (unique.size !== planRows.length) {
      setFormError('Each audit area may appear only once in the plan.');
      return false;
    }

    if (capacityNotes.trim().length < minCapacityNotesLength) {
      setFormError(
        `Capacity / deferral notes must be at least ${minCapacityNotesLength} characters.`
      );
      return false;
    }

    setFormError(null);
    return true;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    clearOutcome();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'risk_based_audit_plan',
          planEntries: planRows.map((row) => ({
            areaId: row.areaId,
            justification: row.justification.trim(),
          })),
          capacityNotes: capacityNotes.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit annual audit plan.');
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

  return (
    <section
      aria-labelledby="risk-based-audit-plan-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="risk-based-audit-plan-heading"
          className="text-lg font-semibold"
        >
          Annual audit plan (capstone)
        </h2>
        <Badge variant="outline">Tier 3 · Risk-based planning</Badge>
        <Badge variant="secondary">Capacity {auditCapacity}/year</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{org.name}</CardTitle>
          <CardDescription>
            Use the risk register to prioritize which areas to audit this year
            and explain why. Higher residual risk and stale coverage should
            generally come first.
          </CardDescription>
        </CardHeader>
        {org.lines.length > 0 ? (
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            {org.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </CardContent>
        ) : null}
      </Card>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Organization risk register</caption>
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Audit area</th>
              <th className="px-3 py-2 font-medium">Inherent</th>
              <th className="px-3 py-2 font-medium">Residual</th>
              <th className="px-3 py-2 font-medium">Last audit</th>
              <th className="px-3 py-2 font-medium">Materiality / impact</th>
              <th className="px-3 py-2 font-medium">Known issues</th>
            </tr>
          </thead>
          <tbody>
            {riskRegister.map((area) => (
              <tr
                key={area.id}
                className="border-b border-border/70 align-top last:border-0"
              >
                <td className="px-3 py-2 font-mono text-xs">{area.id}</td>
                <td className="px-3 py-2 font-medium text-foreground">
                  {area.area}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      'inline-flex rounded-md border px-1.5 py-0.5 text-xs capitalize',
                      residualTone(area.inherentRisk)
                    )}
                  >
                    {area.inherentRisk}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      'inline-flex rounded-md border px-1.5 py-0.5 text-xs capitalize',
                      residualTone(area.residualRisk)
                    )}
                  >
                    {area.residualRisk}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {area.lastAuditDate}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {area.materialityNotes || '—'}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {area.knownIssues || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold">
              Prioritized plan ({auditCapacity} engagements)
            </h3>
            <p className="text-xs text-muted-foreground">
              Priority 1 = audit first. Select from the register and justify
              each choice (≥{minJustificationLength} chars).
            </p>
          </div>

          {planRows.map((row, index) => {
            const selected = row.areaId ? byId.get(row.areaId) : undefined;
            return (
              <div
                key={`plan-row-${index}`}
                className="rounded-md border border-border bg-card/40 p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Priority {index + 1}</Badge>
                  {selected ? (
                    <Badge
                      variant="secondary"
                      className={cn(
                        'capitalize',
                        residualTone(selected.residualRisk)
                      )}
                    >
                      Residual {selected.residualRisk}
                    </Badge>
                  ) : null}
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={readOnly || index === 0}
                      onClick={() => moveRow(index, -1)}
                      aria-label={`Move priority ${index + 1} up`}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={readOnly || index === planRows.length - 1}
                      onClick={() => moveRow(index, 1)}
                      aria-label={`Move priority ${index + 1} down`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`area-${index}`}>Audit area</Label>
                  <select
                    id={`area-${index}`}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={readOnly}
                    value={row.areaId}
                    onChange={(event) =>
                      updateRow(index, { areaId: event.target.value })
                    }
                  >
                    <option value="">Select from risk register…</option>
                    {availableAreasForRow(index).map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.id} — {area.area} (residual {area.residualRisk})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`why-${index}`}>
                    Why this area, in this order?
                  </Label>
                  <Textarea
                    id={`why-${index}`}
                    disabled={readOnly}
                    rows={3}
                    placeholder="Cite residual risk, last audit date, materiality, and known issues…"
                    value={row.justification}
                    onChange={(event) =>
                      updateRow(index, { justification: event.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {row.justification.trim().length}/{minJustificationLength}+
                    characters
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="capacity-notes">Capacity / deferral notes</Label>
          <Textarea
            id="capacity-notes"
            disabled={readOnly}
            rows={4}
            placeholder="Which areas did you defer and why? What would accelerate them?"
            value={capacityNotes}
            onChange={(event) => {
              clearOutcome();
              setCapacityNotes(event.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {capacityNotes.trim().length}/{minCapacityNotesLength}+ characters
          </p>
        </div>

        {formError ? (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        ) : null}
        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}
        {feedback ? (
          <div
            className={cn(
              'rounded-md border px-3 py-2 text-sm',
              scoreStatus === 'resolved'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-foreground'
                : 'border-border bg-muted/40 text-foreground'
            )}
            role="status"
          >
            {scoreStatus ? (
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status: {scoreStatus.replace(/_/g, ' ')}
              </p>
            ) : null}
            <p>{feedback}</p>
          </div>
        ) : null}

        {!readOnly ? (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit annual audit plan'}
          </Button>
        ) : null}
      </form>
    </section>
  );
}
