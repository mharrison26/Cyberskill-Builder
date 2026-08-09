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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  INCIDENT_NOTIFICATION_MIN_DRAFT_LENGTH,
  parseIncidentFacts,
  parseIncidentNotificationPolicyRules,
  type IncidentNotificationRule,
} from '@/lib/scoring/incidentNotification';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type IncidentNotificationTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = Partial<Record<'notifications' | 'draft', string>>;

type RowState = {
  selected: boolean;
  deadlineHours: string;
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
  fallback = ''
): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return fallback;
}

function resolveMinDraftLength(expectedState: Record<string, unknown>): number {
  const value = expectedState.minDraftLength ?? expectedState.min_draft_length;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return INCIDENT_NOTIFICATION_MIN_DRAFT_LENGTH;
}

function initialRowState(
  rules: IncidentNotificationRule[]
): Record<string, RowState> {
  const rows: Record<string, RowState> = {};
  for (const rule of rules) {
    rows[rule.recipientId] = {
      selected: false,
      deadlineHours: '',
    };
  }
  return rows;
}

function formatDiscoveredAt(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace('.000Z', 'Z');
}

export function IncidentNotificationTicket({
  ticket,
  readOnly = false,
  className,
}: IncidentNotificationTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const minDraftLength = resolveMinDraftLength(expectedState);

  const incident = useMemo(
    () => parseIncidentFacts(initialState),
    [initialState]
  );
  const policyRules = useMemo(
    () => parseIncidentNotificationPolicyRules(initialState),
    [initialState]
  );

  const policyTitle = useMemo(() => {
    const nested = asRecord(initialState.policy);
    return readString(
      nested,
      ['title', 'name'],
      readString(
        initialState,
        ['policyTitle'],
        'Incident notification timeline policy'
      )
    );
  }, [initialState]);

  const prompt = readString(
    initialState,
    ['prompt'],
    'Identify every required notification recipient and deadline from the pinned policy, then draft the incident notification.'
  );

  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    initialRowState(policyRules)
  );
  const [draft, setDraft] = useState('');
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

  function updateRow(recipientId: string, patch: Partial<RowState>) {
    clearOutcome();
    setRows((prev) => ({
      ...prev,
      [recipientId]: {
        selected: prev[recipientId]?.selected ?? false,
        deadlineHours: prev[recipientId]?.deadlineHours ?? '',
        ...patch,
      },
    }));
  }

  function buildNotifications(): Array<{
    recipientId: string;
    deadlineHours: number;
  }> {
    const notifications: Array<{ recipientId: string; deadlineHours: number }> =
      [];
    for (const rule of policyRules) {
      const row = rows[rule.recipientId];
      if (!row?.selected) continue;
      const hours = Number.parseFloat(row.deadlineHours.trim());
      if (!Number.isFinite(hours) || hours <= 0) continue;
      notifications.push({
        recipientId: rule.recipientId,
        deadlineHours: hours,
      });
    }
    return notifications;
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    const notifications = buildNotifications();

    if (notifications.length === 0) {
      nextErrors.notifications =
        'Select each required recipient and enter their deadline in hours.';
    } else {
      for (const rule of policyRules) {
        const row = rows[rule.recipientId];
        if (!row?.selected) continue;
        const hours = Number.parseFloat(row.deadlineHours.trim());
        if (!Number.isFinite(hours) || hours <= 0) {
          nextErrors.notifications =
            'Every selected recipient needs a positive deadline in hours.';
          break;
        }
      }
    }

    const trimmed = draft.trim();
    if (!trimmed) {
      nextErrors.draft = 'Draft the incident notification content.';
    } else if (trimmed.length < minDraftLength) {
      nextErrors.draft = `Notification draft must be at least ${minDraftLength} characters.`;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
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
          type: 'incident_notification',
          notifications: buildNotifications(),
          draft: draft.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Failed to submit incident notification.'
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
      aria-labelledby="incident-notification-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2
          id="incident-notification-heading"
          className="text-lg font-semibold"
        >
          Incident notification
        </h2>
        <Badge variant="outline">ISSO · Timeline policy</Badge>
        {incident.id ? <Badge variant="secondary">{incident.id}</Badge> : null}
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{incident.title}</CardTitle>
          <CardDescription>
            Use only these incident facts when drafting the notification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <span className="font-medium text-foreground">Discovered: </span>
            <span className="text-muted-foreground">
              {formatDiscoveredAt(incident.discoveredAt)}
            </span>
          </p>
          {incident.system ? (
            <p>
              <span className="font-medium text-foreground">System: </span>
              <span className="text-muted-foreground">{incident.system}</span>
            </p>
          ) : null}
          {incident.classification ? (
            <p>
              <span className="font-medium text-foreground">
                Classification:{' '}
              </span>
              <span className="text-muted-foreground">
                {incident.classification}
              </span>
            </p>
          ) : null}
          {incident.summary ? (
            <div>
              <p className="font-medium text-foreground">What happened</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {incident.summary}
              </p>
            </div>
          ) : null}
          {incident.impact ? (
            <div>
              <p className="font-medium text-foreground">Impact</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {incident.impact}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{policyTitle}</CardTitle>
          <CardDescription>
            Pin this notification timeline. Deadlines are measured in hours from
            discovery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {policyRules.length === 0 ? (
            <p className="text-muted-foreground">
              Policy rules are not loaded on this ticket. Ask an admin to seed{' '}
              <span className="font-medium">initial_state.policy.rules</span>.
            </p>
          ) : (
            policyRules.map((rule) => (
              <div
                key={rule.recipientId}
                className="rounded-md border border-border bg-muted/20 px-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">
                    {rule.recipientLabel}
                  </p>
                  <Badge variant="outline">{rule.deadlineHours}h</Badge>
                </div>
                {rule.description ? (
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {rule.description}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Required recipients and deadlines
            </CardTitle>
            <CardDescription>
              Select every recipient required for this incident and enter the
              policy deadline in hours from discovery. Do not select recipients
              that the policy does not require for these facts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {policyRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No candidate recipients available.
              </p>
            ) : (
              <div className="space-y-2">
                {policyRules.map((rule) => {
                  const row = rows[rule.recipientId] ?? {
                    selected: false,
                    deadlineHours: '',
                  };
                  return (
                    <div
                      key={rule.recipientId}
                      className={cn(
                        'grid gap-3 rounded-md border px-3 py-3 sm:grid-cols-[auto_1fr_8rem] sm:items-center',
                        row.selected
                          ? 'border-foreground bg-muted/40'
                          : 'border-border'
                      )}
                    >
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-foreground"
                          checked={row.selected}
                          disabled={readOnly || isSubmitting}
                          aria-label={`Notify ${rule.recipientLabel}`}
                          onChange={(event) =>
                            updateRow(rule.recipientId, {
                              selected: event.target.checked,
                              deadlineHours: event.target.checked
                                ? row.deadlineHours
                                : '',
                            })
                          }
                        />
                        {rule.recipientLabel}
                      </label>
                      <p className="text-xs text-muted-foreground sm:px-2">
                        {rule.description || rule.recipientId}
                      </p>
                      <div className="space-y-1">
                        <Label
                          htmlFor={`deadline-${rule.recipientId}`}
                          className="text-xs"
                        >
                          Deadline (hours)
                        </Label>
                        <Input
                          id={`deadline-${rule.recipientId}`}
                          type="number"
                          min={0.1}
                          step="any"
                          inputMode="decimal"
                          placeholder="e.g. 1"
                          value={row.deadlineHours}
                          disabled={readOnly || isSubmitting || !row.selected}
                          onChange={(event) =>
                            updateRow(rule.recipientId, {
                              deadlineHours: event.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {errors.notifications ? (
              <p className="text-sm text-destructive" role="alert">
                {errors.notifications}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notification draft</CardTitle>
            <CardDescription>
              Draft the notification content (min {minDraftLength} characters).
              Completeness is gated by length; recipient/deadline matching is
              scored deterministically against the policy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="incident-notification-draft">Draft</Label>
            <Textarea
              id="incident-notification-draft"
              value={draft}
              disabled={readOnly || isSubmitting}
              onChange={(event) => {
                clearOutcome();
                setDraft(event.target.value);
              }}
              rows={8}
              placeholder="Include incident ID, discovery time, affected system, impact, and the notifications you are issuing with their deadlines…"
            />
            <p className="text-xs text-muted-foreground">
              {draft.trim().length}/{minDraftLength} characters minimum
            </p>
            {errors.draft ? (
              <p className="text-sm text-destructive" role="alert">
                {errors.draft}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit notification plan'}
            </Button>
            {scoreStatus ? (
              <Badge
                variant={scoreStatus === 'resolved' ? 'default' : 'secondary'}
              >
                {scoreStatus.replace(/_/g, ' ')}
              </Badge>
            ) : null}
          </div>
        ) : null}

        {submitError ? (
          <p className="text-sm text-destructive" role="alert">
            {submitError}
          </p>
        ) : null}
        {feedback ? (
          <p
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
            role="status"
          >
            {feedback}
          </p>
        ) : null}
      </form>
    </section>
  );
}
