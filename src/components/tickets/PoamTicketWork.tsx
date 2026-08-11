'use client';

import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  asSubmissionRecord,
  useTicketWorkbenchForm,
} from '@/hooks/useTicketWorkbenchForm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  buildPoamSourceGapsMessage,
  usesStudentPoamSourceFindings,
  type PoamSourceFindingGap,
} from '@/lib/grc/poamSourceFindingsShared';
import {
  POAM_STATUSES,
  parsePriorFindings,
  type PoamPriorFinding,
  type PoamStatus,
} from '@/lib/scoring/ticketUi';
import { cn } from '@/lib/utils';

type EntryDraft = {
  weaknessDescription: string;
  milestone: string;
  scheduledCompletionDate: string;
  status: PoamStatus;
};

type PoamTicketWorkProps = {
  ticketId: string;
  initialState: Record<string, unknown>;
  readOnly?: boolean;
  className?: string;
};

type SubmitResponse = {
  error?: string;
  feedback?: string;
  status?: string;
  structuredResult?: Record<string, unknown>;
};

type PriorFindingsResponse = {
  error?: string;
  priorFindings?: PoamPriorFinding[];
  priorFindingsSource?: 'student_history' | 'seed' | 'empty';
  complete?: boolean;
  gaps?: PoamSourceFindingGap[];
  gapsMessage?: string | null;
  iamLessonTitle?: string;
  l02LessonTitle?: string;
  useStudentSourceFindings?: boolean;
};

function emptyEntry(): EntryDraft {
  return {
    weaknessDescription: '',
    milestone: '',
    scheduledCompletionDate: '',
    status: 'open',
  };
}

function findingHeading(finding: PoamPriorFinding): string {
  if (finding.controlId && finding.title) {
    return `${finding.controlId.toUpperCase()} — ${finding.title}`;
  }
  if (finding.title) return finding.title;
  if (finding.controlId) return finding.controlId.toUpperCase();
  return finding.id;
}

function draftsFromFindings(
  findings: PoamPriorFinding[]
): Record<string, EntryDraft> {
  const initial: Record<string, EntryDraft> = {};
  for (const finding of findings) {
    initial[finding.id] = emptyEntry();
  }
  return initial;
}

function draftsFromSubmission(
  submission: Record<string, unknown>,
  findings: PoamPriorFinding[]
): Record<string, EntryDraft> {
  const initial = draftsFromFindings(findings);
  const entries = submission.entries;
  if (!Array.isArray(entries)) return initial;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const findingId =
      typeof record.findingId === 'string' ? record.findingId : '';
    if (!findingId) continue;
    initial[findingId] = {
      weaknessDescription:
        typeof record.weaknessDescription === 'string'
          ? record.weaknessDescription
          : '',
      milestone: typeof record.milestone === 'string' ? record.milestone : '',
      scheduledCompletionDate:
        typeof record.scheduledCompletionDate === 'string'
          ? record.scheduledCompletionDate
          : '',
      status:
        typeof record.status === 'string' &&
        (POAM_STATUSES as readonly string[]).includes(record.status)
          ? (record.status as PoamStatus)
          : 'open',
    };
  }
  return initial;
}

export function PoamTicketWork({
  ticketId,
  initialState,
  readOnly = false,
  className,
}: PoamTicketWorkProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const restored = asSubmissionRecord(submission);
  const usesStudentHistory = usesStudentPoamSourceFindings(initialState);
  const seedFindings = useMemo(
    () => parsePriorFindings(initialState),
    [initialState]
  );

  const [priorFindings, setPriorFindings] = useState<PoamPriorFinding[]>(() =>
    usesStudentHistory ? [] : seedFindings
  );
  const [drafts, setDrafts] = useState<Record<string, EntryDraft>>(() =>
    draftsFromSubmission(restored, usesStudentHistory ? [] : seedFindings)
  );
  const [loading, setLoading] = useState(usesStudentHistory);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gaps, setGaps] = useState<PoamSourceFindingGap[]>([]);
  const [gapsMessage, setGapsMessage] = useState<string | null>(null);
  const [findingsSource, setFindingsSource] = useState<
    'student_history' | 'seed' | 'empty' | null
  >(usesStudentHistory ? null : seedFindings.length > 0 ? 'seed' : 'empty');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(() => lastScoreStatus);

  useEffect(() => {
    if (!usesStudentHistory) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/tickets/${ticketId}/prior-findings`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const data = (await res.json()) as PriorFindingsResponse;
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load source findings');
        }
        if (cancelled) return;

        const findings = Array.isArray(data.priorFindings)
          ? data.priorFindings
          : [];
        setPriorFindings(findings);
        setDrafts(draftsFromSubmission(restored, findings));
        setGaps(Array.isArray(data.gaps) ? data.gaps : []);
        setGapsMessage(
          typeof data.gapsMessage === 'string'
            ? data.gapsMessage
            : findings.length < 2
              ? buildPoamSourceGapsMessage(data.gaps ?? [])
              : null
        );
        setFindingsSource(data.priorFindingsSource ?? 'empty');
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Failed to load source findings'
          );
          setPriorFindings([]);
          setDrafts({});
          setFindingsSource('empty');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [ticketId, usesStudentHistory]);

  function updateDraft(
    findingId: string,
    field: keyof EntryDraft,
    value: string
  ) {
    setDrafts((prev) => ({
      ...prev,
      [findingId]: {
        ...(prev[findingId] ?? emptyEntry()),
        [field]: value,
      },
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (formReadOnly || hideSubmit || isSubmitting || priorFindings.length === 0) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setFeedback(null);
    setScoreStatus(null);

    const entries = priorFindings.map((finding) => {
      const draft = drafts[finding.id] ?? emptyEntry();
      return {
        findingId: finding.id,
        weaknessDescription: draft.weaknessDescription,
        milestone: draft.milestone,
        scheduledCompletionDate: draft.scheduledCompletionDate,
        status: draft.status,
      };
    });

    try {
      const response = await fetch(`/api/tickets/${ticketId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'poam', entries }),
      });

      let body: SubmitResponse | undefined;
      try {
        body = (await response.json()) as SubmitResponse;
      } catch {
        body = undefined;
      }

      if (!response.ok) {
        setSubmitError(
          typeof body?.error === 'string'
            ? body.error
            : 'Submission failed. Please try again.'
        );
        return;
      }

      setScoreStatus(
        typeof body?.status === 'string' ? body.status : 'submitted'
      );
      setFeedback(
        typeof body?.feedback === 'string'
          ? body.feedback
          : 'Submission recorded.'
      );
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section
        aria-labelledby="poam-work-heading"
        className={cn(
          'rounded-lg border border-dashed border-border bg-muted/30 px-5 py-8',
          className
        )}
        data-ticket-id={ticketId}
      >
        <h2 id="poam-work-heading" className="text-base font-semibold">
          POA&M work area
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Loading your prior findings from the IAM lab and Navigating NIST SP
          800-53…
        </p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section
        aria-labelledby="poam-work-heading"
        className={cn(
          'rounded-lg border border-destructive/40 bg-destructive/5 px-5 py-8',
          className
        )}
        data-ticket-id={ticketId}
      >
        <h2 id="poam-work-heading" className="text-base font-semibold">
          POA&M work area
        </h2>
        <p className="mt-2 text-sm text-destructive" role="alert">
          {loadError}
        </p>
      </section>
    );
  }

  if (priorFindings.length === 0 || (usesStudentHistory && gaps.length > 0)) {
    return (
      <section
        aria-labelledby="poam-work-heading"
        className={cn(
          'rounded-lg border border-dashed border-border bg-muted/30 px-5 py-8',
          className
        )}
        data-ticket-id={ticketId}
        data-findings-source={findingsSource ?? 'empty'}
      >
        <h2 id="poam-work-heading" className="text-base font-semibold">
          Prerequisites required
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {usesStudentHistory
            ? gapsMessage ||
              'This POA&M ticket uses your own prior lab findings. Complete the prerequisite lessons first — placeholder findings are not used.'
            : 'This ticket has no prior findings in initial_state.prior_findings. An admin should seed 2–3 findings before students can draft POA&M entries.'}
        </p>
        {usesStudentHistory && gaps.length > 0 ? (
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-foreground">
            {gaps.map((gap) => (
              <li key={gap.key}>{gap.message}</li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="poam-work-heading"
      className={cn('space-y-6', className)}
      data-ticket-id={ticketId}
      data-ticket-type="poam"
      data-findings-source={findingsSource ?? undefined}
    >
      <div>
        <h2 id="poam-work-heading" className="text-base font-semibold">
          Draft POA&M entries
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          {findingsSource === 'student_history'
            ? 'These two source findings come from your prior IAM lab finding and your Navigating NIST SP 800-53 submission. Draft a POA&M entry for each with a realistic remediation milestone.'
            : 'Review each prior finding, then write a weakness description, a realistic remediation milestone, a scheduled completion date, and a status.'}
        </p>
      </div>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
        className="space-y-8"
      >
        {priorFindings.map((finding, index) => {
          const draft = drafts[finding.id] ?? emptyEntry();
          const prefix = `poam-${finding.id}`;

          return (
            <fieldset
              key={finding.id}
              className="space-y-4 rounded-lg border border-border px-4 py-5"
            >
              <legend className="px-1 text-sm font-semibold">
                Finding {index + 1}: {findingHeading(finding)}
              </legend>

              <div className="rounded-md bg-muted/40 px-3 py-3 text-sm">
                <p className="font-medium text-foreground">{finding.id}</p>
                {finding.summary ? (
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {finding.summary}
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">
                    No finding summary provided.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${prefix}-weakness`}>
                  Weakness description
                </Label>
                <Textarea
                  id={`${prefix}-weakness`}
                  value={draft.weaknessDescription}
                  onChange={(event) =>
                    updateDraft(
                      finding.id,
                      'weaknessDescription',
                      event.target.value
                    )
                  }
                  disabled={formReadOnly || isSubmitting}
                  rows={3}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${prefix}-milestone`}>
                  Remediation milestone
                </Label>
                <Textarea
                  id={`${prefix}-milestone`}
                  value={draft.milestone}
                  onChange={(event) =>
                    updateDraft(finding.id, 'milestone', event.target.value)
                  }
                  disabled={formReadOnly || isSubmitting}
                  rows={3}
                  required
                  placeholder="Specific, verifiable corrective action…"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${prefix}-date`}>
                    Scheduled completion date
                  </Label>
                  <Input
                    id={`${prefix}-date`}
                    type="date"
                    value={draft.scheduledCompletionDate}
                    onChange={(event) =>
                      updateDraft(
                        finding.id,
                        'scheduledCompletionDate',
                        event.target.value
                      )
                    }
                    disabled={formReadOnly || isSubmitting}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`${prefix}-status`}>Status</Label>
                  <select
                    id={`${prefix}-status`}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    value={draft.status}
                    onChange={(event) =>
                      updateDraft(
                        finding.id,
                        'status',
                        event.target.value as PoamStatus
                      )
                    }
                    disabled={formReadOnly || isSubmitting}
                    required
                  >
                    {POAM_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>
          );
        })}

        <div className="flex flex-wrap items-center gap-3">
          {!hideSubmit ? (
            <Button type="submit" disabled={formReadOnly || isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit POA&M'}
            </Button>
          ) : null}
          {readOnly ? (
            <p className="text-sm text-muted-foreground">
              Preview mode — submissions disabled.
            </p>
          ) : null}
        </div>
      </form>

      {submitError ? (
        <p className="text-sm text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}

      {feedback ? (
        <div
          className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm"
          role="status"
        >
          {scoreStatus ? (
            <p className="font-medium capitalize">
              Result: {scoreStatus.replace(/_/g, ' ')}
            </p>
          ) : null}
          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
            {feedback}
          </p>
        </div>
      ) : null}
    </section>
  );
}
