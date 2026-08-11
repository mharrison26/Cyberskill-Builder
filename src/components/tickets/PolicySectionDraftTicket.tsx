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
import { POLICY_SECTION_DRAFT_MIN_LENGTH } from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type PolicySectionDraftTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = {
  draft?: string;
};

type OrganizationProfile = {
  name: string;
  industry: string;
  size: string;
  systems: string[];
  constraints: string;
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

function parseOrganization(
  initialState: Record<string, unknown>
): OrganizationProfile {
  const nested = asRecord(initialState.organization ?? initialState.org);

  const systemsRaw = nested.systems;
  const systems = Array.isArray(systemsRaw)
    ? systemsRaw
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  return {
    name: readString(nested, ['name', 'title'], 'Organization'),
    industry: readString(nested, ['industry', 'sector'], ''),
    size: readString(nested, ['size', 'headcount'], ''),
    systems,
    constraints: readString(nested, ['constraints', 'notes'], ''),
  };
}

function resolveMinDraftLength(
  expectedState: Record<string, unknown>,
  initialState: Record<string, unknown>
): number {
  for (const source of [expectedState, initialState]) {
    const value = source.minDraftLength ?? source.min_draft_length;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  }
  return POLICY_SECTION_DRAFT_MIN_LENGTH;
}

export function PolicySectionDraftTicket({
  ticket,
  readOnly = false,
  className,
}: PolicySectionDraftTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const organization = useMemo(
    () => parseOrganization(initialState),
    [initialState]
  );
  const minDraftLength = resolveMinDraftLength(expectedState, initialState);

  const sectionTitle = readString(
    initialState,
    ['sectionTitle', 'section_title', 'section'],
    'Policy section'
  );
  const requirement = readString(
    initialState,
    ['requirement', 'policyRequirement', 'policy_requirement'],
    'See scenario brief for the policy requirement.'
  );
  const workPrompt = readString(
    initialState,
    ['prompt', 'instructions'],
    `Draft the ${sectionTitle} policy section. Cover clear scope, enforceable requirements, and a defined exceptions process.`
  );

  const [draft, setDraft] = useState(() => restoredString(submission, 'draft'));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(
    () => lastScoreStatus
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    const trimmed = draft.trim();
    if (!trimmed) {
      nextErrors.draft = 'A policy section draft is required.';
    } else if (trimmed.length < minDraftLength) {
      nextErrors.draft = `Draft must be at least ${minDraftLength} characters.`;
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
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
          type: 'policy_section_draft',
          draft: draft.trim(),
          sectionTitle,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit policy draft.');
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
      aria-labelledby="policy-section-draft-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="policy-section-draft-heading" className="text-lg font-semibold">
          Policy section draft
        </h2>
        <Badge variant="outline">{sectionTitle}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization profile</CardTitle>
          <CardDescription>
            Draft for this fictional organization — match scope and constraints.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid gap-2 sm:grid-cols-[7rem_1fr]">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium">{organization.name}</dd>
            {organization.industry ? (
              <>
                <dt className="text-muted-foreground">Industry</dt>
                <dd>{organization.industry}</dd>
              </>
            ) : null}
            {organization.size ? (
              <>
                <dt className="text-muted-foreground">Size</dt>
                <dd>{organization.size}</dd>
              </>
            ) : null}
            {organization.systems.length > 0 ? (
              <>
                <dt className="text-muted-foreground">Systems</dt>
                <dd>{organization.systems.join('; ')}</dd>
              </>
            ) : null}
            {organization.constraints ? (
              <>
                <dt className="text-muted-foreground">Constraints</dt>
                <dd>{organization.constraints}</dd>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Requirement</CardTitle>
          <CardDescription>
            One-paragraph requirement for the {sectionTitle} section.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm whitespace-pre-wrap"
            data-testid="policy-requirement"
          >
            {requirement}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your task</CardTitle>
          <CardDescription>{workPrompt}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Graded against a pinned policy-writing rubric: clear scope,
            enforceable must/shall language, and a defined exceptions process.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Draft: {sectionTitle}</CardTitle>
          <CardDescription>
            Write the full policy section text (not just bullet notes).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="policy-section-draft-body">Policy draft</Label>
              <Textarea
                id="policy-section-draft-body"
                value={draft}
                onChange={(event) => {
                  clearOutcome();
                  setDraft(event.target.value);
                }}
                disabled={formReadOnly || isSubmitting}
                rows={14}
                placeholder={`1. Scope\nThis policy applies to…\n\n2. Requirements\nUsers must…\n\n3. Exceptions\nException requests must…`}
                aria-invalid={Boolean(errors.draft)}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {draft.trim().length} / {minDraftLength} characters minimum
                </span>
                {errors.draft ? (
                  <span className="text-destructive">{errors.draft}</span>
                ) : null}
              </div>
            </div>

            {!hideSubmit ? (
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting…' : 'Submit draft'}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Preview mode — submission disabled.
              </p>
            )}

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
                    ? 'border-status-satisfied-foreground/20 bg-status-satisfied'
                    : 'border-status-insufficient-foreground/20 bg-status-insufficient'
                )}
                role="status"
              >
                {scoreStatus ? (
                  <p className="mb-1 font-medium capitalize">
                    {scoreStatus.replace(/_/g, ' ')}
                  </p>
                ) : null}
                <p>{feedback}</p>
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
