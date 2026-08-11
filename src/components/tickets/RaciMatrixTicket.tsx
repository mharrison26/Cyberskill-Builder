'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  asSubmissionRecord,
  useTicketWorkbenchForm,
} from '@/hooks/useTicketWorkbenchForm';
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
  RACI_CODES,
  RACI_CODE_LABELS,
  parseRaciActivities,
  parseRaciOrgUnits,
  parseRaciRoles,
  type RaciCellValue,
  type RaciCode,
  type RaciOrgUnit,
} from '@/lib/scoring/raciMatrix';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type RaciMatrixTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type AssignmentsState = Record<string, Record<string, RaciCellValue>>;

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

function parseLegend(
  source: Record<string, unknown>
): Record<RaciCode, string> {
  const nested = asRecord(source.raciLegend ?? source.legend);
  return {
    R:
      readString(nested, ['R', 'responsible'], RACI_CODE_LABELS.R) ||
      RACI_CODE_LABELS.R,
    A:
      readString(nested, ['A', 'accountable'], RACI_CODE_LABELS.A) ||
      RACI_CODE_LABELS.A,
    C:
      readString(nested, ['C', 'consulted'], RACI_CODE_LABELS.C) ||
      RACI_CODE_LABELS.C,
    I:
      readString(nested, ['I', 'informed'], RACI_CODE_LABELS.I) ||
      RACI_CODE_LABELS.I,
  };
}

function buildOrgLevels(units: RaciOrgUnit[]): RaciOrgUnit[][] {
  if (units.length === 0) return [];

  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const children = new Map<string | null, RaciOrgUnit[]>();

  for (const unit of units) {
    const parentId =
      unit.reportsTo && byId.has(unit.reportsTo) ? unit.reportsTo : null;
    const list = children.get(parentId) ?? [];
    list.push(unit);
    children.set(parentId, list);
  }

  const levels: RaciOrgUnit[][] = [];
  let current = children.get(null) ?? [];
  const seen = new Set<string>();

  while (current.length > 0) {
    levels.push(current);
    const next: RaciOrgUnit[] = [];
    for (const unit of current) {
      seen.add(unit.id);
      for (const child of children.get(unit.id) ?? []) {
        if (!seen.has(child.id)) next.push(child);
      }
    }
    current = next;
  }

  // Orphans with broken reportsTo edges still appear.
  const leftovers = units.filter((unit) => !seen.has(unit.id));
  if (leftovers.length > 0) levels.push(leftovers);

  return levels;
}

function emptyAssignments(
  activityIds: string[],
  roleIds: string[]
): AssignmentsState {
  const next: AssignmentsState = {};
  for (const activityId of activityIds) {
    next[activityId] = {};
    for (const roleId of roleIds) {
      next[activityId][roleId] = '';
    }
  }
  return next;
}

function restoredAssignments(
  submission: Record<string, unknown> | null | undefined,
  activityIds: string[],
  roleIds: string[]
): AssignmentsState {
  const base = emptyAssignments(activityIds, roleIds);
  const raw = submission?.assignments;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

  for (const activityId of activityIds) {
    const activityRecord = (raw as Record<string, unknown>)[activityId];
    if (!activityRecord || typeof activityRecord !== 'object' || Array.isArray(activityRecord)) {
      continue;
    }
    for (const roleId of roleIds) {
      const cell = (activityRecord as Record<string, unknown>)[roleId];
      if (cell === 'R' || cell === 'A' || cell === 'C' || cell === 'I' || cell === '') {
        base[activityId]![roleId] = cell;
      }
    }
  }
  return base;
}

export function RaciMatrixTicket({
  ticket,
  readOnly = false,
  className,
}: RaciMatrixTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const restored = asSubmissionRecord(submission);
  const initialState = asRecord(ticket.initial_state);

  const orgUnits = useMemo(
    () => parseRaciOrgUnits(initialState),
    [initialState]
  );
  const roles = useMemo(() => parseRaciRoles(initialState), [initialState]);
  const activities = useMemo(
    () => parseRaciActivities(initialState),
    [initialState]
  );
  const orgLevels = useMemo(() => buildOrgLevels(orgUnits), [orgUnits]);
  const legend = useMemo(() => parseLegend(initialState), [initialState]);

  const prompt = readString(
    initialState,
    ['prompt', 'instructions'],
    'Using the org chart, assign Responsible, Accountable, Consulted, and Informed roles for each security activity. Leave a cell blank when that role has no RACI involvement.'
  );
  const activitySummary = readString(
    initialState,
    ['activitySummary', 'activity_summary', 'scenario'],
    ''
  );
  const orgName = readString(
    initialState,
    ['orgName', 'organization', 'org'],
    'Organization'
  );

  const [assignments, setAssignments] = useState<AssignmentsState>(() =>
    restoredAssignments(
      restored,
      activities.map((a) => a.id),
      roles.map((r) => r.id)
    )
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(() => lastScoreStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
    setFormError(null);
  }

  function setCell(activityId: string, roleId: string, value: RaciCellValue) {
    if (formReadOnly || hideSubmit) return;
    clearOutcome();
    setAssignments((prev) => ({
      ...prev,
      [activityId]: {
        ...(prev[activityId] ?? {}),
        [roleId]: value,
      },
    }));
  }

  function validate(): boolean {
    if (activities.length === 0 || roles.length === 0) {
      setFormError(
        'This ticket is missing activities or roles in initial_state.'
      );
      return false;
    }

    for (const activity of activities) {
      let accountable = 0;
      let responsible = 0;
      for (const role of roles) {
        const cell = assignments[activity.id]?.[role.id] ?? '';
        if (cell === 'A') accountable += 1;
        if (cell === 'R') responsible += 1;
      }
      if (accountable !== 1) {
        setFormError(
          `“${activity.label}” needs exactly one Accountable (A) role.`
        );
        return false;
      }
      if (responsible < 1) {
        setFormError(
          `“${activity.label}” needs at least one Responsible (R) role.`
        );
        return false;
      }
    }

    setFormError(null);
    return true;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (formReadOnly || hideSubmit) return;

    clearOutcome();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'raci_matrix',
          assignments,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit RACI matrix.');
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
      aria-labelledby="raci-matrix-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="raci-matrix-heading" className="text-lg font-semibold">
          RACI responsibility matrix
        </h2>
        <Badge variant="outline">GRC · RACI</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Security activity brief</CardTitle>
          <CardDescription>{prompt}</CardDescription>
        </CardHeader>
        {activitySummary ? (
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {activitySummary}
            </p>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{orgName} org chart</CardTitle>
          <CardDescription>
            Use reporting lines and role titles to decide who owns, executes,
            advises on, and receives updates for each activity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orgLevels.length === 0 ? (
            <p className="text-sm text-destructive" role="alert">
              No org chart is configured on this ticket.
            </p>
          ) : (
            <div
              className="space-y-4"
              role="list"
              aria-label="Organization chart"
            >
              {orgLevels.map((level, levelIndex) => (
                <div key={`level-${levelIndex}`} className="space-y-2">
                  {levelIndex > 0 ? (
                    <div
                      className="mx-auto h-4 w-px bg-border"
                      aria-hidden="true"
                    />
                  ) : null}
                  <div className="flex flex-wrap items-stretch justify-center gap-3">
                    {level.map((unit) => (
                      <div
                        key={unit.id}
                        role="listitem"
                        className="min-w-[10rem] max-w-[14rem] rounded-md border border-border bg-muted/30 px-3 py-2 text-center"
                      >
                        <p className="text-sm font-medium text-foreground">
                          {unit.title}
                        </p>
                        {unit.name ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {unit.name}
                          </p>
                        ) : null}
                        {unit.description ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {unit.description}
                          </p>
                        ) : null}
                        {unit.reportsTo ? (
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                            reports to {unit.reportsTo}
                          </p>
                        ) : (
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                            executive sponsor
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">RACI legend</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {RACI_CODES.map((code) => (
              <div
                key={code}
                className="rounded-md border border-border px-3 py-2"
              >
                <dt className="font-mono text-xs font-semibold text-foreground">
                  {code}
                </dt>
                <dd className="text-muted-foreground">{legend[code]}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assign RACI roles</CardTitle>
            <CardDescription>
              One Accountable (A) per activity. At least one Responsible (R).
              Use blank when a role is not involved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activities.length === 0 || roles.length === 0 ? (
              <p className="text-sm text-destructive" role="alert">
                Activities or roles are missing from this ticket&apos;s
                initial_state.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 font-medium">
                        Activity
                      </th>
                      {roles.map((role) => (
                        <th
                          key={role.id}
                          className="px-3 py-2 font-medium normal-case tracking-normal"
                        >
                          <div>{role.title}</div>
                          {role.name ? (
                            <div className="mt-0.5 text-[11px] font-normal text-muted-foreground">
                              {role.name}
                            </div>
                          ) : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((activity) => (
                      <tr
                        key={activity.id}
                        className="border-b border-border/70 last:border-0"
                      >
                        <th
                          scope="row"
                          className="sticky left-0 z-10 bg-background px-3 py-3 align-top font-medium text-foreground"
                        >
                          <div>{activity.label}</div>
                          {activity.description ? (
                            <p className="mt-1 text-xs font-normal text-muted-foreground">
                              {activity.description}
                            </p>
                          ) : null}
                        </th>
                        {roles.map((role) => {
                          const selectId = `${ticket.id}-${activity.id}-${role.id}`;
                          const value =
                            assignments[activity.id]?.[role.id] ?? '';
                          return (
                            <td
                              key={`${activity.id}-${role.id}`}
                              className="px-2 py-2 align-top"
                            >
                              <Label htmlFor={selectId} className="sr-only">
                                {activity.label} · {role.title}
                              </Label>
                              <select
                                id={selectId}
                                className="h-9 w-full min-w-[4.5rem] rounded-md border border-input bg-background px-2 text-sm"
                                value={value}
                                disabled={formReadOnly}
                                onChange={(event) => {
                                  const next = event.target.value;
                                  const cell: RaciCellValue =
                                    next === '' ||
                                    next === 'R' ||
                                    next === 'A' ||
                                    next === 'C' ||
                                    next === 'I'
                                      ? next
                                      : '';
                                  setCell(activity.id, role.id, cell);
                                }}
                              >
                                <option value="">—</option>
                                {RACI_CODES.map((code) => (
                                  <option key={code} value={code}>
                                    {code} · {RACI_CODE_LABELS[code]}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          {!hideSubmit ? (
            <Button type="submit" disabled={formReadOnly || isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit RACI matrix'}
            </Button>
          ) : null}
          {scoreStatus ? (
            <Badge variant={scoreStatus === 'resolved' ? 'default' : 'outline'}>
              {scoreStatus.replace(/_/g, ' ')}
            </Badge>
          ) : null}
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
          <p
            className={cn(
              'rounded-md border px-3 py-2 text-sm',
              scoreStatus === 'resolved'
                ? 'border-status-satisfied-foreground/20 bg-status-satisfied text-status-satisfied-foreground'
                : 'border-border bg-muted/40 text-muted-foreground'
            )}
            role="status"
          >
            {feedback}
          </p>
        ) : null}
      </form>
    </section>
  );
}
