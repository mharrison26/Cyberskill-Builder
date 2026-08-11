'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  restoredString,
  restoredStringSet,
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
import {
  ISSM_QUALITY_REVIEW_MIN_FEEDBACK_LENGTH,
  parseIssmQualityArtifact,
  parseIssmQualityCandidateIssues,
  parseIssmQualityReviewExpectedState,
} from '@/lib/scoring/issmQualityReview';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type IssmQualityReviewTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = Partial<Record<'issues' | 'feedback', string>>;

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

export function IssmQualityReviewTicket({
  ticket,
  readOnly = false,
  className,
}: IssmQualityReviewTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const artifact = useMemo(
    () => parseIssmQualityArtifact(initialState),
    [initialState]
  );
  const candidateIssues = useMemo(
    () => parseIssmQualityCandidateIssues(initialState),
    [initialState]
  );
  const minFeedbackLength = useMemo(() => {
    const parsed = parseIssmQualityReviewExpectedState(
      expectedState,
      initialState
    );
    return parsed?.minFeedbackLength ?? ISSM_QUALITY_REVIEW_MIN_FEEDBACK_LENGTH;
  }, [expectedState, initialState]);

  const prompt = readString(
    initialState,
    ['prompt'],
    'As ISSM, review the ISSO-submitted artifact, identify quality issues, and draft feedback.'
  );
  const role = readString(initialState, ['role'], 'ISSM');
  const artifactType = readString(
    initialState,
    ['artifactType', 'artifact_type'],
    'poam_entry'
  );

  const system = asRecord(initialState.system);
  const isso = asRecord(initialState.isso);
  const systemName = readString(
    system,
    ['name', 'systemName'],
    readString(
      initialState,
      ['systemName', 'system_name'],
      'Information system'
    )
  );
  const fismaId = readString(system, ['fismaId', 'fisma_id', 'systemId'], '');
  const issoName = readString(isso, ['name'], 'ISSO');
  const issoTitle = readString(isso, ['title'], 'ISSO');

  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(() =>
    restoredStringSet(submission, 'issueIds')
  );
  const [feedback, setFeedbackDraft] = useState(() =>
    restoredString(submission, ['feedback'])
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [scoreFeedback, setScoreFeedback] = useState<string | null>(
    () => lastFeedback
  );
  const [scoreStatus, setScoreStatus] = useState<string | null>(
    () => lastScoreStatus
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearOutcome() {
    setScoreFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function toggleIssue(id: string) {
    clearOutcome();
    setSelectedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    if (selectedIssues.size === 0) {
      nextErrors.issues =
        'Select every quality issue that applies (leave distractors unchecked).';
    }
    const trimmed = feedback.trim();
    if (!trimmed) {
      nextErrors.feedback =
        'Draft written feedback to the ISSO describing the defects and required corrections.';
    } else if (trimmed.length < minFeedbackLength) {
      nextErrors.feedback = `Feedback must be at least ${minFeedbackLength} characters.`;
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
          type: 'issm_quality_review',
          issueIds: Array.from(selectedIssues),
          feedback: feedback.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Failed to submit ISSM quality review.'
        );
      }

      setScoreStatus(payload.status ?? null);
      setScoreFeedback(payload.feedback ?? 'Submission recorded.');
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

  const artifactTypeLabel =
    artifactType === 'ssp_excerpt' ? 'SSP excerpt' : 'POA&M entry';

  return (
    <section
      aria-labelledby="issm-quality-review-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="issm-quality-review-heading" className="text-lg font-semibold">
          ISSM quality review
        </h2>
        <Badge variant="outline">{artifactTypeLabel}</Badge>
        <Badge variant="secondary">Role: {role}</Badge>
      </div>

      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
        {prompt}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {artifact?.title ?? 'ISSO-submitted artifact'}
          </CardTitle>
          <CardDescription>
            {systemName}
            {fismaId ? ` · FISMA ID ${fismaId}` : ''} · Submitted by {issoName}{' '}
            ({issoTitle})
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {artifact?.body ? (
            <p className="whitespace-pre-wrap text-muted-foreground">
              {artifact.body}
            </p>
          ) : null}

          <dl className="grid gap-3 sm:grid-cols-2">
            {artifact?.controlId ? (
              <div>
                <dt className="font-medium text-foreground">Control</dt>
                <dd className="text-muted-foreground">{artifact.controlId}</dd>
              </div>
            ) : null}
            {artifact?.severity ? (
              <div>
                <dt className="font-medium text-foreground">Severity</dt>
                <dd className="text-muted-foreground">{artifact.severity}</dd>
              </div>
            ) : null}
            {artifact?.milestoneDate ? (
              <div>
                <dt className="font-medium text-foreground">
                  Milestone / completion
                </dt>
                <dd className="text-muted-foreground">
                  {artifact.milestoneDate}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="font-medium text-foreground">Owner / POC</dt>
              <dd className="text-muted-foreground">
                {artifact?.owner?.trim() ? artifact.owner : '—'}
              </dd>
            </div>
          </dl>

          {artifact?.weakness ? (
            <div>
              <p className="font-medium text-foreground">Weakness</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {artifact.weakness}
              </p>
            </div>
          ) : null}
          {artifact?.plannedAction ? (
            <div>
              <p className="font-medium text-foreground">Planned action</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {artifact.plannedAction}
              </p>
            </div>
          ) : null}
          {artifact?.resources ? (
            <div>
              <p className="font-medium text-foreground">Resources</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {artifact.resources}
              </p>
            </div>
          ) : null}
          {artifact?.residualRisk ? (
            <div>
              <p className="font-medium text-foreground">Residual risk</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {artifact.residualRisk}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quality issues</CardTitle>
            <CardDescription>
              Select every defect that applies. Some checklist items are
              distractors.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset className="space-y-3">
              <legend className="sr-only">Candidate quality issues</legend>
              <ul className="space-y-2">
                {candidateIssues.map((issue) => (
                  <li key={issue.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/30">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selectedIssues.has(issue.id)}
                        onChange={() => toggleIssue(issue.id)}
                        disabled={formReadOnly || isSubmitting}
                        aria-label={issue.label}
                      />
                      <span>
                        <span className="font-medium">{issue.label}</span>
                        {issue.detail ? (
                          <span className="mt-0.5 block text-muted-foreground">
                            {issue.detail}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
                {candidateIssues.length === 0 ? (
                  <li className="text-sm text-muted-foreground">
                    No candidate issues seeded for this ticket.
                  </li>
                ) : null}
              </ul>
              {errors.issues ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.issues}
                </p>
              ) : null}
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feedback to ISSO</CardTitle>
            <CardDescription>
              Draft specific, actionable feedback (min {minFeedbackLength}{' '}
              characters).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="issm-quality-feedback">Feedback draft</Label>
            <Textarea
              id="issm-quality-feedback"
              value={feedback}
              disabled={formReadOnly || isSubmitting}
              onChange={(event) => {
                clearOutcome();
                setFeedbackDraft(event.target.value);
              }}
              rows={8}
              placeholder="Name each quality defect, why it fails ISSM acceptance criteria, and the concrete revision you expect before the artifact can enter the register…"
            />
            <p className="text-xs text-muted-foreground">
              {feedback.trim().length}/{minFeedbackLength} characters minimum
            </p>
            {errors.feedback ? (
              <p className="text-sm text-destructive" role="alert">
                {errors.feedback}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {!hideSubmit ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit quality review'}
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
        {scoreFeedback ? (
          <p
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
            role="status"
          >
            {scoreFeedback}
          </p>
        ) : null}
      </form>
    </section>
  );
}
