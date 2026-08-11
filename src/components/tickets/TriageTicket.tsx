'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  restoredString,
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
  TRIAGE_CATEGORIES,
  TRIAGE_CATEGORY_LABELS,
  TRIAGE_PRIORITIES,
  TRIAGE_PRIORITY_LABELS,
  type TriageCategory,
  type TriagePriority,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type TriageTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = Partial<Record<'priority' | 'category', string>>;

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

function resolveCategoryOptions(
  initialState: Record<string, unknown>,
  expectedState: Record<string, unknown>
): string[] {
  const raw =
    initialState.categoryOptions ??
    initialState.categories ??
    expectedState.categoryOptions ??
    expectedState.categories;

  if (Array.isArray(raw)) {
    const opts = raw
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().toLowerCase().replace(/\s+/g, '_'))
      .filter(Boolean);
    if (opts.length > 0) return opts;
  }

  return [...TRIAGE_CATEGORIES];
}

function categoryLabel(category: string): string {
  if (category in TRIAGE_CATEGORY_LABELS) {
    return TRIAGE_CATEGORY_LABELS[category as TriageCategory];
  }
  return category.replace(/_/g, ' ');
}

function restoredPriority(
  submission: Record<string, unknown> | null | undefined
): TriagePriority | '' {
  const value = restoredString(submission, 'priority');
  return (TRIAGE_PRIORITIES as readonly string[]).includes(value)
    ? (value as TriagePriority)
    : '';
}

export function TriageTicket({
  ticket,
  readOnly = false,
  className,
}: TriageTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const inbound = useMemo(() => {
    const nested = asRecord(initialState.request ?? initialState.inbound);
    return {
      subject: readString(
        nested,
        ['subject'],
        readString(initialState, ['subject'], 'Untitled request')
      ),
      body: readString(
        nested,
        ['body', 'description', 'message'],
        readString(
          initialState,
          ['body', 'description', 'message'],
          'See scenario brief.'
        )
      ),
      affectedUserRole: readString(
        nested,
        ['affectedUserRole', 'affected_user_role', 'userRole', 'role'],
        readString(
          initialState,
          ['affectedUserRole', 'affected_user_role', 'userRole', 'role'],
          'Unknown role'
        )
      ),
      requesterName: readString(
        nested,
        ['requesterName', 'requester', 'from'],
        readString(initialState, ['requesterName', 'requester', 'from'], '')
      ),
    };
  }, [initialState]);

  const categoryOptions = useMemo(
    () => resolveCategoryOptions(initialState, expectedState),
    [initialState, expectedState]
  );

  const [priority, setPriority] = useState<TriagePriority | ''>(() =>
    restoredPriority(submission)
  );
  const [category, setCategory] = useState(() => restoredString(submission, 'category'));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(() => lastScoreStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    if (!priority) {
      nextErrors.priority = 'Assign a priority (P1–P4).';
    }
    if (!category) {
      nextErrors.category = 'Select a category.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (formReadOnly || hideSubmit) return;

    clearOutcome();
    if (!validate() || !priority || !category) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'triage',
          priority,
          category,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit triage.');
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
      aria-labelledby="triage-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="triage-heading" className="text-lg font-semibold">
          Inbound request triage
        </h2>
        <Badge variant="outline">Tier 1 · Priority + category</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Raw support request</CardTitle>
          <CardDescription>
            Read the inbound request, then assign priority and category using
            the impact × urgency rubric in the scenario brief.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {inbound.requesterName ? (
            <p>
              <span className="font-medium text-foreground">From: </span>
              <span className="text-muted-foreground">
                {inbound.requesterName}
              </span>
            </p>
          ) : null}
          <p>
            <span className="font-medium text-foreground">Subject: </span>
            <span className="text-muted-foreground">{inbound.subject}</span>
          </p>
          <p>
            <span className="font-medium text-foreground">
              Affected user role:{' '}
            </span>
            <span className="text-muted-foreground">
              {inbound.affectedUserRole}
            </span>
          </p>
          <div>
            <p className="font-medium text-foreground">Body</p>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              {inbound.body}
            </p>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your triage decision</CardTitle>
            <CardDescription>
              Priority is scored against the seeded impact × urgency matrix.
              Category must match the expected ITSM classification.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="triage-priority">Priority</Label>
              <select
                id="triage-priority"
                name="priority"
                value={priority}
                disabled={formReadOnly || isSubmitting}
                aria-invalid={errors.priority ? true : undefined}
                aria-describedby={
                  errors.priority ? 'triage-priority-error' : undefined
                }
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                  errors.priority && 'border-destructive'
                )}
                onChange={(event) => {
                  setPriority(event.target.value as TriagePriority | '');
                  clearOutcome();
                  if (errors.priority) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.priority;
                      return next;
                    });
                  }
                }}
              >
                <option value="">Select priority…</option>
                {TRIAGE_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {TRIAGE_PRIORITY_LABELS[value]}
                  </option>
                ))}
              </select>
              {errors.priority ? (
                <p
                  id="triage-priority-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.priority}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="triage-category">Category</Label>
              <select
                id="triage-category"
                name="category"
                value={category}
                disabled={formReadOnly || isSubmitting}
                aria-invalid={errors.category ? true : undefined}
                aria-describedby={
                  errors.category ? 'triage-category-error' : undefined
                }
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                  errors.category && 'border-destructive'
                )}
                onChange={(event) => {
                  setCategory(event.target.value);
                  clearOutcome();
                  if (errors.category) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.category;
                      return next;
                    });
                  }
                }}
              >
                <option value="">Select category…</option>
                {categoryOptions.map((value) => (
                  <option key={value} value={value}>
                    {categoryLabel(value)}
                  </option>
                ))}
              </select>
              {errors.category ? (
                <p
                  id="triage-category-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.category}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

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
            {isSubmitting ? 'Submitting…' : 'Submit triage'}
          </Button>
        ) : null}
      </form>
    </section>
  );
}
