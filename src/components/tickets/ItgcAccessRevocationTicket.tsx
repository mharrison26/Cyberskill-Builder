'use client';

import { useMemo, useState } from 'react';

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
  ITGC_CONTROL_OUTCOMES,
  parseItgcAccessPolicy,
  parseItgcAccessUsers,
  type ItgcAccessUser,
  type ItgcControlOutcome,
} from '@/lib/scoring/itgcAccessRevocation';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type ItgcAccessRevocationTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = Partial<Record<'controlOutcome' | 'exceptions', string>>;

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

function outcomeLabel(outcome: ItgcControlOutcome): string {
  return outcome === 'pass' ? 'Pass (effective)' : 'Fail (exceptions noted)';
}

function employmentLabel(user: ItgcAccessUser): string {
  return user.employmentStatus === 'terminated' ? 'Terminated' : 'Active';
}

function accessLabel(user: ItgcAccessUser): string {
  return user.accessStatus === 'revoked' ? 'Revoked' : 'Active';
}

export function ItgcAccessRevocationTicket({
  ticket,
  readOnly = false,
  className,
}: ItgcAccessRevocationTicketProps) {
  const initialState = asRecord(ticket.initial_state);

  const users = useMemo(
    () => parseItgcAccessUsers(initialState),
    [initialState]
  );
  const policy = useMemo(
    () => parseItgcAccessPolicy(initialState),
    [initialState]
  );

  const controlObjective = readString(
    initialState,
    ['controlObjective', 'control_objective', 'objective'],
    'Access for terminated personnel is revoked within the policy SLA.'
  );

  const prompt = readString(
    initialState,
    ['prompt'],
    'Review the user access extract against the timely revocation policy. Select pass or fail, then mark every exception user.'
  );

  const [controlOutcome, setControlOutcome] = useState<ItgcControlOutcome | ''>(
    ''
  );
  const [selectedExceptionIds, setSelectedExceptionIds] = useState<string[]>(
    []
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedSet = useMemo(
    () => new Set(selectedExceptionIds),
    [selectedExceptionIds]
  );

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function toggleException(userId: string) {
    if (readOnly) return;
    clearOutcome();
    setSelectedExceptionIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    if (!controlOutcome) {
      nextErrors.controlOutcome = 'Select pass or fail for the control.';
    }
    if (controlOutcome === 'fail' && selectedExceptionIds.length === 0) {
      nextErrors.exceptions =
        'A fail conclusion requires at least one exception user.';
    }
    if (controlOutcome === 'pass' && selectedExceptionIds.length > 0) {
      nextErrors.exceptions =
        'A pass conclusion cannot include exception users. Clear the selection or mark fail.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    clearOutcome();
    if (!validate() || !controlOutcome) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'itgc_access_revocation',
          controlOutcome,
          exceptionUserIds: selectedExceptionIds,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Failed to submit access revocation test.'
        );
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
      aria-labelledby="itgc-access-revocation-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="itgc-access-revocation-heading"
          className="text-lg font-semibold"
        >
          ITGC timely access revocation
        </h2>
        <Badge variant="outline">ITGC · access revocation</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Control objective</CardTitle>
          <CardDescription>{prompt}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="whitespace-pre-wrap text-muted-foreground">
            {controlObjective}
          </p>
          {policy ? (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-3">
              <p className="font-medium text-foreground">{policy.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {policy.criteria}
              </p>
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Revoke within</dt>
                  <dd className="font-medium text-foreground">
                    {policy.revokeWithinDays} calendar days
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Testing as-of</dt>
                  <dd className="font-mono font-medium text-foreground">
                    {policy.asOfDate}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Basis</dt>
                  <dd className="font-medium text-foreground">
                    {policy.calendarBasis.replace(/_/g, ' ')}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">User access evidence</CardTitle>
          <CardDescription>
            Mark each user who violates the timely revocation policy as an
            exception. Active employees and on-time revocations are not
            exceptions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-destructive" role="alert">
              No user access evidence is configured on this ticket.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Exception</th>
                    <th className="px-3 py-2 font-medium">User</th>
                    <th className="px-3 py-2 font-medium">Department</th>
                    <th className="px-3 py-2 font-medium">Employment</th>
                    <th className="px-3 py-2 font-medium">Terminated</th>
                    <th className="px-3 py-2 font-medium">Access</th>
                    <th className="px-3 py-2 font-medium">Revoked</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const checked = selectedSet.has(user.id);
                    const inputId = `${ticket.id}-exception-${user.id}`;
                    return (
                      <tr
                        key={user.id}
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
                              onChange={() => toggleException(user.id)}
                            />
                            <span className="sr-only">
                              Mark {user.displayName} as exception
                            </span>
                          </Label>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="font-medium text-foreground">
                            {user.displayName}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {user.username} · {user.id}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle text-muted-foreground">
                          {user.department || '—'}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {employmentLabel(user)}
                        </td>
                        <td className="px-3 py-2 align-middle font-mono text-xs">
                          {user.terminationDate ?? '—'}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {accessLabel(user)}
                        </td>
                        <td className="px-3 py-2 align-middle font-mono text-xs">
                          {user.accessRevokedDate ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {errors.exceptions ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {errors.exceptions}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Control conclusion</CardTitle>
            <CardDescription>
              Pass only if every terminated user was revoked within the policy
              window (or is still inside that window as of the testing date).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <fieldset
              disabled={readOnly}
              className="space-y-2"
              aria-describedby={
                errors.controlOutcome
                  ? 'itgc-control-outcome-error'
                  : undefined
              }
            >
              <legend className="mb-1 text-sm font-medium">
                Pass / fail outcome
              </legend>
              <div className="flex flex-wrap gap-3">
                {ITGC_CONTROL_OUTCOMES.map((outcome) => {
                  const inputId = `${ticket.id}-outcome-${outcome}`;
                  return (
                    <Label
                      key={outcome}
                      htmlFor={inputId}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 font-normal transition-colors',
                        controlOutcome === outcome
                          ? 'border-primary/40 bg-primary/5'
                          : 'hover:bg-muted/50',
                        readOnly && 'cursor-default opacity-80'
                      )}
                    >
                      <input
                        id={inputId}
                        type="radio"
                        name={`${ticket.id}-control-outcome`}
                        className="size-4 accent-primary"
                        checked={controlOutcome === outcome}
                        disabled={readOnly}
                        onChange={() => {
                          clearOutcome();
                          setControlOutcome(outcome);
                        }}
                      />
                      <span>{outcomeLabel(outcome)}</span>
                    </Label>
                  );
                })}
              </div>
            </fieldset>
            {errors.controlOutcome ? (
              <p
                id="itgc-control-outcome-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.controlOutcome}
              </p>
            ) : null}

            <p className="text-sm text-muted-foreground">
              Selected exceptions:{' '}
              <span className="font-medium text-foreground">
                {selectedExceptionIds.length === 0
                  ? 'none'
                  : selectedExceptionIds.join(', ')}
              </span>
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={readOnly || isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit test conclusion'}
          </Button>
          {scoreStatus ? (
            <Badge
              variant={scoreStatus === 'resolved' ? 'default' : 'outline'}
            >
              {scoreStatus.replace(/_/g, ' ')}
            </Badge>
          ) : null}
        </div>

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
                ? 'border-emerald-500/30 bg-emerald-500/10 text-foreground'
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
