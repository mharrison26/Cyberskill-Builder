'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTicketWorkbenchForm } from '@/hooks/useTicketWorkbenchForm';
import {
  IMPLEMENTATION_STATUSES,
  isImplementationStatus,
  NIST_800_171_REV3_SUBSET,
  OSCAL_SSP_MIN_NARRATIVE_LENGTH,
  SSP_RESPONSIBLE_ROLES,
  type ImplementationStatus,
  type Nist800171Requirement,
} from '@/lib/oscal/nist800171Subset';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type OscalSspFormProps = {
  ticket: Pick<Ticket, 'id' | 'ticket_type' | 'initial_state'>;
  readOnly?: boolean;
  className?: string;
};

type AnswerDraft = {
  implementationStatus: ImplementationStatus | '';
  responsibleRoleId: string;
  implementationNarrative: string;
};

type FieldErrors = Record<string, string>;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseRequirements(
  initialState: Record<string, unknown>
): Nist800171Requirement[] {
  const raw = initialState.requirements;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...NIST_800_171_REV3_SUBSET];
  }

  const parsed: Nist800171Requirement[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const oscalControlId =
      typeof record.oscalControlId === 'string'
        ? record.oscalControlId.trim()
        : id
          ? `r${id}`
          : '';
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const family =
      typeof record.family === 'string' ? record.family.trim() : 'General';
    const statement =
      typeof record.statement === 'string' ? record.statement.trim() : '';
    if (!id || !oscalControlId || !title || !statement) continue;
    parsed.push({ id, oscalControlId, family, title, statement });
  }

  return parsed.length > 0 ? parsed : [...NIST_800_171_REV3_SUBSET];
}

function emptyDraft(): AnswerDraft {
  return {
    implementationStatus: '',
    responsibleRoleId: '',
    implementationNarrative: '',
  };
}

export function OscalSspForm({
  ticket,
  readOnly = false,
  className,
}: OscalSspFormProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const requirements = useMemo(
    () => parseRequirements(asRecord(ticket.initial_state)),
    [ticket.initial_state]
  );
  const systemMeta = useMemo(() => {
    const initial = asRecord(ticket.initial_state);
    const systemName =
      typeof initial.systemName === 'string' && initial.systemName.trim()
        ? initial.systemName.trim()
        : null;
    const systemDescription =
      typeof initial.systemDescription === 'string' &&
      initial.systemDescription.trim()
        ? initial.systemDescription.trim()
        : null;
    return { systemName, systemDescription };
  }, [ticket.initial_state]);
  const { systemName, systemDescription } = systemMeta;

  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>(() => {
    const initial: Record<string, AnswerDraft> = {};
    const answers = Array.isArray(submission?.answers)
      ? submission!.answers
      : [];
    const byId = new Map<string, Record<string, unknown>>();
    for (const entry of answers) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const record = entry as Record<string, unknown>;
      const id =
        typeof record.requirementId === 'string'
          ? record.requirementId
          : typeof record.id === 'string'
            ? record.id
            : '';
      if (id) byId.set(id, record);
    }
    for (const req of requirements) {
      const restored = byId.get(req.id);
      if (!restored) {
        initial[req.id] = emptyDraft();
        continue;
      }
      initial[req.id] = {
        implementationStatus: isImplementationStatus(
          restored.implementationStatus
        )
          ? restored.implementationStatus
          : '',
        responsibleRoleId:
          typeof restored.responsibleRoleId === 'string'
            ? restored.responsibleRoleId
            : '',
        implementationNarrative:
          typeof restored.implementationNarrative === 'string'
            ? restored.implementationNarrative
            : '',
      };
    }
    return initial;
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [schemaErrors, setSchemaErrors] = useState<
    Array<{ instancePath: string; message: string }>
  >([]);
  const [scoreStatus, setScoreStatus] = useState<string | null>(
    () => lastScoreStatus
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateDraft(requirementId: string, patch: Partial<AnswerDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [requirementId]: { ...prev[requirementId]!, ...patch },
    }));
    setFeedback(null);
    setSchemaErrors([]);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function validate(): boolean {
    const nextErrors: FieldErrors = {};
    for (const req of requirements) {
      const draft = drafts[req.id] ?? emptyDraft();
      if (!draft.implementationStatus) {
        nextErrors[`${req.id}.status`] = 'Implementation status is required.';
      }
      if (!draft.responsibleRoleId) {
        nextErrors[`${req.id}.role`] = 'Responsible role is required.';
      }
      const narrative = draft.implementationNarrative.trim();
      if (!narrative) {
        nextErrors[`${req.id}.narrative`] =
          'Implementation narrative is required.';
      } else if (narrative.length < OSCAL_SSP_MIN_NARRATIVE_LENGTH) {
        nextErrors[`${req.id}.narrative`] =
          `Narrative must be at least ${OSCAL_SSP_MIN_NARRATIVE_LENGTH} characters.`;
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
    setSchemaErrors([]);
    setScoreStatus(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const answers = requirements.map((req) => {
        const draft = drafts[req.id]!;
        return {
          requirementId: req.id,
          implementationStatus: draft.implementationStatus,
          responsibleRoleId: draft.responsibleRoleId,
          implementationNarrative: draft.implementationNarrative.trim(),
        };
      });

      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'oscal_ssp',
          answers,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
        structuredResult?: {
          schemaErrors?: Array<{ instancePath: string; message: string }>;
        };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit OSCAL SSP form.');
      }

      setScoreStatus(payload.status ?? null);
      setFeedback(payload.feedback ?? 'Submission recorded.');

      const nextSchemaErrors =
        payload.status !== 'resolved' &&
        Array.isArray(payload.structuredResult?.schemaErrors)
          ? payload.structuredResult.schemaErrors.filter(
              (error) =>
                error &&
                typeof error.message === 'string' &&
                error.message.trim().length > 0
            )
          : [];
      setSchemaErrors(nextSchemaErrors);
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
      aria-labelledby="oscal-ssp-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="oscal-ssp-heading" className="text-lg font-semibold">
            OSCAL SSP form
          </h2>
          <Badge variant="outline">NIST SP 800-171 Rev 3</Badge>
        </div>
        <p className="max-w-prose text-sm text-muted-foreground">
          For each requirement, record implementation status, the responsible
          role, and a short implementation narrative. Your answers are compiled
          into a minimal OSCAL System Security Plan JSON fragment and validated
          against the NIST OSCAL SSP schema before acceptance.
        </p>
        {systemName || systemDescription ? (
          <div className="max-w-prose space-y-1 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
            {systemName ? (
              <p className="font-medium text-foreground">{systemName}</p>
            ) : null}
            {systemDescription ? (
              <p className="leading-relaxed text-muted-foreground">
                {systemDescription}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Complete implementation statements for:{' '}
              {requirements.map((req) => req.id).join(', ')}.
            </p>
          </div>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-8">
        {requirements.map((req) => {
          const draft = drafts[req.id] ?? emptyDraft();
          const statusError = errors[`${req.id}.status`];
          const roleError = errors[`${req.id}.role`];
          const narrativeError = errors[`${req.id}.narrative`];
          const statusId = `ssp-${req.id}-status`;
          const roleId = `ssp-${req.id}-role`;
          const narrativeId = `ssp-${req.id}-narrative`;

          return (
            <fieldset
              key={req.id}
              className="space-y-4 rounded-lg border border-border px-4 py-4"
            >
              <legend className="px-1 text-sm font-semibold">
                {req.id} — {req.title}
              </legend>
              <p className="text-xs text-muted-foreground">{req.family}</p>
              <p className="text-sm leading-relaxed">{req.statement}</p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={statusId}>Implementation status</Label>
                  <select
                    id={statusId}
                    name={`${req.id}-status`}
                    value={draft.implementationStatus}
                    disabled={formReadOnly || isSubmitting}
                    aria-invalid={statusError ? true : undefined}
                    aria-describedby={
                      statusError ? `${statusId}-error` : undefined
                    }
                    className={cn(
                      'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                      statusError && 'border-destructive'
                    )}
                    onChange={(event) => {
                      updateDraft(req.id, {
                        implementationStatus: event.target.value as
                          ImplementationStatus | '',
                      });
                      if (statusError) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next[`${req.id}.status`];
                          return next;
                        });
                      }
                    }}
                  >
                    <option value="">Select status…</option>
                    {IMPLEMENTATION_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  {statusError ? (
                    <p
                      id={`${statusId}-error`}
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {statusError}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={roleId}>Responsible role</Label>
                  <select
                    id={roleId}
                    name={`${req.id}-role`}
                    value={draft.responsibleRoleId}
                    disabled={formReadOnly || isSubmitting}
                    aria-invalid={roleError ? true : undefined}
                    aria-describedby={roleError ? `${roleId}-error` : undefined}
                    className={cn(
                      'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                      roleError && 'border-destructive'
                    )}
                    onChange={(event) => {
                      updateDraft(req.id, {
                        responsibleRoleId: event.target.value,
                      });
                      if (roleError) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next[`${req.id}.role`];
                          return next;
                        });
                      }
                    }}
                  >
                    <option value="">Select role…</option>
                    {SSP_RESPONSIBLE_ROLES.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.title}
                      </option>
                    ))}
                  </select>
                  {roleError ? (
                    <p
                      id={`${roleId}-error`}
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {roleError}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={narrativeId}>Implementation narrative</Label>
                <Textarea
                  id={narrativeId}
                  name={`${req.id}-narrative`}
                  value={draft.implementationNarrative}
                  rows={4}
                  disabled={formReadOnly || isSubmitting}
                  aria-invalid={narrativeError ? true : undefined}
                  aria-describedby={
                    narrativeError
                      ? `${narrativeId}-error`
                      : `${narrativeId}-hint`
                  }
                  className={cn(narrativeError && 'border-destructive')}
                  placeholder="Describe how this requirement is implemented for the lab system…"
                  onChange={(event) => {
                    updateDraft(req.id, {
                      implementationNarrative: event.target.value,
                    });
                    if (narrativeError) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next[`${req.id}.narrative`];
                        return next;
                      });
                    }
                  }}
                />
                <p
                  id={`${narrativeId}-hint`}
                  className="text-xs text-muted-foreground"
                >
                  Minimum {OSCAL_SSP_MIN_NARRATIVE_LENGTH} characters. Becomes
                  the OSCAL by-component description.
                </p>
                {narrativeError ? (
                  <p
                    id={`${narrativeId}-error`}
                    role="alert"
                    className="text-sm text-destructive"
                  >
                    {narrativeError}
                  </p>
                ) : null}
              </div>
            </fieldset>
          );
        })}

        {submitError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {submitError}
          </p>
        ) : null}

        {feedback || schemaErrors.length > 0 ? (
          <div
            role={schemaErrors.length > 0 ? 'alert' : 'status'}
            data-testid="oscal-ssp-feedback"
            className={cn(
              'rounded-md border px-4 py-3 text-sm',
              scoreStatus === 'resolved'
                ? 'border-status-satisfied-foreground/20 bg-status-satisfied text-status-satisfied-foreground'
                : schemaErrors.length > 0
                  ? 'border-destructive/30 bg-destructive/10 text-foreground'
                  : 'border-border bg-muted/40 text-foreground'
            )}
          >
            {scoreStatus ? (
              <p className="mb-1 font-medium capitalize">
                {scoreStatus.replace(/_/g, ' ')}
              </p>
            ) : null}
            {feedback ? (
              <p className="whitespace-pre-wrap">{feedback}</p>
            ) : null}
            {schemaErrors.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="font-medium text-destructive">
                  OSCAL SSP schema errors
                </p>
                <ul className="list-disc space-y-1 pl-5 text-destructive">
                  {schemaErrors.map((error, index) => {
                    const pathLabel =
                      !error.instancePath || error.instancePath === ''
                        ? '/'
                        : error.instancePath;
                    return (
                      <li key={`${pathLabel}-${error.message}-${index}`}>
                        <span className="font-mono text-xs">{pathLabel}</span>
                        {': '}
                        {error.message}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {!hideSubmit ? (
          <Button type="submit" disabled={formReadOnly || isSubmitting}>
            {isSubmitting ? 'Validating SSP…' : 'Submit OSCAL SSP'}
          </Button>
        ) : null}
      </form>
    </section>
  );
}
