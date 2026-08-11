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
import { Textarea } from '@/components/ui/textarea';
import { BACKUP_DR_PLAN_MIN_FIELD_LENGTH } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type BackupDrPlanTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type RequiredFieldKey =
  | 'backupFrequency'
  | 'retention'
  | 'rpoTargets'
  | 'rtoTargets'
  | 'restoreTestingCadence';

type FieldKey = RequiredFieldKey | 'planNotes';

type FormErrors = Partial<Record<RequiredFieldKey, string>>;

const REQUIRED_FIELD_META: Array<{
  key: RequiredFieldKey;
  label: string;
  description: string;
  placeholder: string;
  rows: number;
}> = [
  {
    key: 'backupFrequency',
    label: 'Backup frequency',
    description:
      'How often each major system is backed up (and why that cadence fits change rate / criticality).',
    placeholder:
      'e.g. SQL: hourly transaction logs + nightly full; file server: nightly incremental + weekly full; CRM: daily export…',
    rows: 4,
  },
  {
    key: 'retention',
    label: 'Retention',
    description:
      'How long versions/copies are kept per system, including any longer-term or offsite copies.',
    placeholder:
      'e.g. 30 days of dailies, 12 weekly fulls, monthly CRM exports for 12 months…',
    rows: 4,
  },
  {
    key: 'rpoTargets',
    label: 'RPO targets',
    description:
      'Maximum acceptable data loss (time) per system, tied to backup cadence and business impact.',
    placeholder:
      'e.g. Invoicing DB RPO 1 hour; file server RPO 24 hours; CRM RPO 24 hours…',
    rows: 4,
  },
  {
    key: 'rtoTargets',
    label: 'RTO targets',
    description:
      'Maximum acceptable downtime per system and what “restored” means.',
    placeholder:
      'e.g. SQL RTO 4 hours (priority 1); file server RTO 8 hours; CRM RTO 24 hours…',
    rows: 4,
  },
  {
    key: 'restoreTestingCadence',
    label: 'Restore-testing cadence',
    description:
      'How often you prove restores work, what you test, success criteria, and who owns the drill.',
    placeholder:
      'e.g. Monthly sample-file + DB restore to staging; quarterly full share drill with owner sign-off…',
    rows: 4,
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function resolveMinFieldLength(expectedState: Record<string, unknown>): number {
  const value = expectedState.minFieldLength;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return BACKUP_DR_PLAN_MIN_FIELD_LENGTH;
}

function stringField(
  record: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function labelize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatBusinessContext(initialState: Record<string, unknown>): {
  title: string;
  lines: string[];
} {
  const profile =
    initialState.businessProfile ??
    initialState.business_profile ??
    initialState.systemProfile ??
    initialState.system_profile;

  let title = 'Business systems inventory';
  const lines: string[] = [];

  if (typeof profile === 'string' && profile.trim()) {
    lines.push(
      ...profile
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    );
  } else {
    const record = asRecord(profile);
    if (typeof record.name === 'string' && record.name.trim()) {
      title = record.name.trim();
    }
    for (const [key, value] of Object.entries(record)) {
      if (key === 'name') continue;
      if (typeof value === 'string' && value.trim()) {
        lines.push(`${labelize(key)}: ${value.trim()}`);
      } else if (Array.isArray(value)) {
        const items = value.filter(
          (entry) => typeof entry === 'string'
        ) as string[];
        if (items.length > 0) {
          lines.push(`${labelize(key)}: ${items.join(', ')}`);
        }
      }
    }
  }

  const systems = initialState.systems ?? initialState.inventory;
  if (Array.isArray(systems)) {
    for (const entry of systems) {
      if (typeof entry === 'string' && entry.trim()) {
        lines.push(entry.trim());
        continue;
      }
      const record = asRecord(entry);
      const name = stringField(record, 'name', 'system') ?? 'System';
      const detailParts = [
        stringField(record, 'description', 'notes'),
        stringField(record, 'criticality'),
        stringField(record, 'dataTypes', 'data_types'),
        stringField(record, 'location'),
      ].filter(Boolean);
      lines.push(
        detailParts.length > 0 ? `${name}: ${detailParts.join(' — ')}` : name
      );
    }
  }

  const prompt = stringField(initialState, 'prompt');
  if (prompt) {
    lines.push(`Prompt: ${prompt}`);
  }

  return { title, lines };
}

export function BackupDrPlanTicket({
  ticket,
  readOnly = false,
  className,
}: BackupDrPlanTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const minFieldLength = resolveMinFieldLength(expectedState);
  const context = useMemo(
    () => formatBusinessContext(initialState),
    [initialState]
  );

  const [fields, setFields] = useState<Record<FieldKey, string>>(() => ({
    backupFrequency: restoredString(submission, 'backupFrequency'),
    retention: restoredString(submission, 'retention'),
    rpoTargets: restoredString(submission, 'rpoTargets'),
    rtoTargets: restoredString(submission, 'rtoTargets'),
    restoreTestingCadence: restoredString(submission, 'restoreTestingCadence'),
    planNotes: restoredString(submission, 'planNotes'),
  }));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(() => lastScoreStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(key: FieldKey, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
    if (key !== 'planNotes' && errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    for (const meta of REQUIRED_FIELD_META) {
      const value = fields[meta.key].trim();
      if (!value) {
        nextErrors[meta.key] = `${meta.label} is required.`;
      } else if (value.length < minFieldLength) {
        nextErrors[meta.key] = `Must be at least ${minFieldLength} characters.`;
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (formReadOnly || hideSubmit) return;

    setSubmitError(null);
    setFeedback(null);
    setScoreStatus(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const planNotes = fields.planNotes.trim();
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'backup_dr_plan',
          backupFrequency: fields.backupFrequency.trim(),
          retention: fields.retention.trim(),
          rpoTargets: fields.rpoTargets.trim(),
          rtoTargets: fields.rtoTargets.trim(),
          restoreTestingCadence: fields.restoreTestingCadence.trim(),
          ...(planNotes ? { planNotes } : {}),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit backup/DR plan.');
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
      aria-labelledby="backup-dr-plan-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="backup-dr-plan-heading" className="text-lg font-semibold">
          Backup &amp; disaster recovery plan
        </h2>
        <Badge variant="outline">Backup / DR</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{context.title}</CardTitle>
          <CardDescription>
            Use this fictional small-business inventory to set frequency,
            retention, RPO/RTO, and restore-testing decisions. Graded against a
            pinned backup/DR best-practices checklist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {context.lines.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {context.lines.map((line) => (
                <li key={line} className="whitespace-pre-wrap">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No business systems inventory was provided on this ticket.
            </p>
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {REQUIRED_FIELD_META.map((meta) => (
          <Card key={meta.key}>
            <CardHeader>
              <CardTitle className="text-base">{meta.label}</CardTitle>
              <CardDescription>{meta.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor={`backup-dr-${meta.key}`}>{meta.label}</Label>
              <Textarea
                id={`backup-dr-${meta.key}`}
                value={fields[meta.key]}
                onChange={(event) => updateField(meta.key, event.target.value)}
                rows={meta.rows}
                placeholder={meta.placeholder}
                aria-invalid={errors[meta.key] ? true : undefined}
                disabled={formReadOnly || isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Minimum {minFieldLength} characters.
              </p>
              {errors[meta.key] ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors[meta.key]}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Overall plan notes (optional)
            </CardTitle>
            <CardDescription>
              Offsite/immutable copies, roles, or other assumptions that do not
              fit the fields above.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="backup-dr-planNotes">Plan notes</Label>
            <Textarea
              id="backup-dr-planNotes"
              value={fields.planNotes}
              onChange={(event) => updateField('planNotes', event.target.value)}
              rows={4}
              placeholder="e.g. One backup copy lives in a separate cloud account; Finance owns restore sign-off…"
              disabled={formReadOnly || isSubmitting}
            />
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
            {isSubmitting ? 'Submitting…' : 'Submit backup / DR plan'}
          </Button>
        ) : null}
      </form>
    </section>
  );
}
