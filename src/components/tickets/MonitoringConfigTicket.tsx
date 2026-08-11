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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  MONITORING_ALERT_ROUTE_LABELS,
  MONITORING_ALERT_ROUTES,
  MONITORING_ALERT_THRESHOLD_HINTS,
  MONITORING_ALERT_TYPE_LABELS,
  MONITORING_ALERT_TYPES,
  type MonitoringAlertRoute,
  type MonitoringAlertType,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type MonitoringConfigTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type AlertDraft = {
  key: string;
  alertType: MonitoringAlertType | '';
  threshold: string;
  route: MonitoringAlertRoute | '';
};

type ServiceInfo = {
  name: string;
  role: string;
  slo: string;
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

function parseServices(initialState: Record<string, unknown>): ServiceInfo[] {
  const raw = initialState.services;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry): ServiceInfo | null => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const name = readString(record, ['name', 'service', 'id']);
      if (!name) return null;
      return {
        name,
        role: readString(record, ['role', 'description', 'purpose']),
        slo: readString(record, ['slo', 'sli', 'target']),
      };
    })
    .filter((entry): entry is ServiceInfo => entry !== null);
}

function resolveAlertTypeOptions(
  initialState: Record<string, unknown>
): MonitoringAlertType[] {
  const raw = initialState.alertTypeOptions ?? initialState.alertTypes;
  if (Array.isArray(raw)) {
    const opts = raw
      .filter((item): item is string => typeof item === 'string')
      .map((item) =>
        item
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, '_')
      )
      .filter((item): item is MonitoringAlertType =>
        (MONITORING_ALERT_TYPES as readonly string[]).includes(item)
      );
    if (opts.length > 0) return opts;
  }
  return [...MONITORING_ALERT_TYPES];
}

function resolveRouteOptions(
  initialState: Record<string, unknown>
): MonitoringAlertRoute[] {
  const raw = initialState.routeOptions ?? initialState.routes;
  if (Array.isArray(raw)) {
    const opts = raw
      .filter((item): item is string => typeof item === 'string')
      .map((item) =>
        item
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, '_')
      )
      .filter((item): item is MonitoringAlertRoute =>
        (MONITORING_ALERT_ROUTES as readonly string[]).includes(item)
      );
    if (opts.length > 0) return opts;
  }
  return [...MONITORING_ALERT_ROUTES];
}

function newDraft(partial?: Partial<AlertDraft>): AlertDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    alertType: '',
    threshold: '',
    route: '',
    ...partial,
  };
}

const selectClassName =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

function restoredAlerts(
  submission: Record<string, unknown> | null | undefined
): AlertDraft[] {
  const raw = submission?.alerts;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [newDraft(), newDraft(), newDraft()];
  }
  return raw.map((entry, index) => {
    if (!entry || typeof entry !== 'object') return newDraft();
    const record = entry as Record<string, unknown>;
    return newDraft({
      key: `restored-${index}`,
      alertType:
        typeof record.alertType === 'string'
          ? (record.alertType as AlertDraft['alertType'])
          : '',
      threshold:
        typeof record.threshold === 'number'
          ? String(record.threshold)
          : typeof record.threshold === 'string'
            ? record.threshold
            : '',
      route:
        typeof record.route === 'string'
          ? (record.route as AlertDraft['route'])
          : '',
    });
  });
}

export function MonitoringConfigTicket({
  ticket,
  readOnly = false,
  className,
}: MonitoringConfigTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const restored = asSubmissionRecord(submission);
  const initialState = asRecord(ticket.initial_state);

  const systemName = readString(
    initialState,
    ['systemName', 'system_name', 'name'],
    'Target system'
  );
  const prompt = readString(
    initialState,
    ['prompt', 'instructions'],
    'Define monitoring alerts for the system below: choose alert types, thresholds, and routing destinations.'
  );
  const context = readString(initialState, ['context', 'notes', 'background']);
  const services = useMemo(() => parseServices(initialState), [initialState]);
  const alertTypeOptions = useMemo(
    () => resolveAlertTypeOptions(initialState),
    [initialState]
  );
  const routeOptions = useMemo(
    () => resolveRouteOptions(initialState),
    [initialState]
  );

  const [alerts, setAlerts] = useState<AlertDraft[]>(() => restoredAlerts(restored));
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

  function updateAlert(key: string, patch: Partial<AlertDraft>) {
    clearOutcome();
    setAlerts((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  }

  function addAlert() {
    clearOutcome();
    setAlerts((prev) => [...prev, newDraft()]);
  }

  function removeAlert(key: string) {
    clearOutcome();
    setAlerts((prev) =>
      prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)
    );
  }

  function validate(): boolean {
    const complete = alerts.filter(
      (row) => row.alertType && row.threshold.trim() && row.route
    );
    if (complete.length === 0) {
      setFormError(
        'Add at least one complete alert (type, threshold, and route).'
      );
      return false;
    }
    for (const row of complete) {
      const n = Number(row.threshold);
      if (!Number.isFinite(n)) {
        setFormError('Each threshold must be a number.');
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

    const payloadAlerts = alerts
      .filter((row) => row.alertType && row.threshold.trim() && row.route)
      .map((row) => ({
        alertType: row.alertType,
        threshold: Number(row.threshold),
        route: row.route,
      }));

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'monitoring_config',
          alerts: payloadAlerts,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit monitoring config.');
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
      aria-labelledby="monitoring-config-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="monitoring-config-heading" className="text-lg font-semibold">
          Monitoring configuration
        </h2>
        <Badge variant="outline">Alerts · thresholds · routing</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{systemName}</CardTitle>
          <CardDescription>{prompt}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {context ? (
            <p className="whitespace-pre-wrap text-muted-foreground">
              {context}
            </p>
          ) : null}

          {services.length > 0 ? (
            <div className="space-y-2">
              <p className="font-medium text-foreground">Services</p>
              <ul className="space-y-2">
                {services.map((service) => (
                  <li
                    key={service.name}
                    className="rounded-md border border-border bg-muted/30 px-3 py-2"
                  >
                    <p className="font-medium text-foreground">
                      {service.name}
                    </p>
                    {service.role ? (
                      <p className="text-muted-foreground">{service.role}</p>
                    ) : null}
                    {service.slo ? (
                      <p className="mt-1 text-muted-foreground">
                        <span className="font-medium text-foreground">
                          SLO:{' '}
                        </span>
                        {service.slo}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alert rules</CardTitle>
            <CardDescription>
              Cover the failure modes implied by the scenario. Extra alerts are
              fine; scoring checks required types, threshold ranges, and
              routing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {alerts.map((row, index) => {
              const hint =
                row.alertType && MONITORING_ALERT_THRESHOLD_HINTS[row.alertType]
                  ? MONITORING_ALERT_THRESHOLD_HINTS[row.alertType]
                  : 'Numeric threshold for the selected alert type';

              return (
                <div
                  key={row.key}
                  className="space-y-3 rounded-md border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Alert {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={formReadOnly || isSubmitting || alerts.length <= 1}
                      onClick={() => removeAlert(row.key)}
                    >
                      Remove
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor={`alert-type-${row.key}`}>
                        Alert type
                      </Label>
                      <select
                        id={`alert-type-${row.key}`}
                        value={row.alertType}
                        disabled={formReadOnly || isSubmitting}
                        className={selectClassName}
                        onChange={(event) =>
                          updateAlert(row.key, {
                            alertType: event.target.value as
                              MonitoringAlertType | '',
                          })
                        }
                      >
                        <option value="">Select type…</option>
                        {alertTypeOptions.map((value) => (
                          <option key={value} value={value}>
                            {MONITORING_ALERT_TYPE_LABELS[value]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`alert-threshold-${row.key}`}>
                        Threshold
                      </Label>
                      <Input
                        id={`alert-threshold-${row.key}`}
                        type="number"
                        inputMode="decimal"
                        value={row.threshold}
                        disabled={formReadOnly || isSubmitting}
                        placeholder="e.g. 90"
                        onChange={(event) =>
                          updateAlert(row.key, {
                            threshold: event.target.value,
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">{hint}</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`alert-route-${row.key}`}>Route to</Label>
                      <select
                        id={`alert-route-${row.key}`}
                        value={row.route}
                        disabled={formReadOnly || isSubmitting}
                        className={selectClassName}
                        onChange={(event) =>
                          updateAlert(row.key, {
                            route: event.target.value as
                              MonitoringAlertRoute | '',
                          })
                        }
                      >
                        <option value="">Select destination…</option>
                        {routeOptions.map((value) => (
                          <option key={value} value={value}>
                            {MONITORING_ALERT_ROUTE_LABELS[value]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              disabled={formReadOnly || isSubmitting}
              onClick={addAlert}
            >
              Add alert
            </Button>
          </CardContent>
        </Card>

        {formError ? (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        {submitError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {submitError}
          </p>
        ) : null}

        {feedback ? (
          <p
            role="status"
            className={cn(
              'rounded-md border px-4 py-3 text-sm',
              scoreStatus === 'resolved'
                ? 'border-status-satisfied-foreground/20 bg-status-satisfied text-status-satisfied-foreground'
                : 'border-border bg-muted/40 text-foreground'
            )}
          >
            {scoreStatus ? (
              <span className="mb-1 block font-medium capitalize">
                {scoreStatus.replace(/_/g, ' ')}
              </span>
            ) : null}
            {feedback}
          </p>
        ) : null}

        {!hideSubmit ? (
          <Button type="submit" disabled={formReadOnly || isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit monitoring config'}
          </Button>
        ) : null}
      </form>
    </section>
  );
}
