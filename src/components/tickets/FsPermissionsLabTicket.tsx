'use client';

import { useMemo, useState } from 'react';

import { CodeSandbox } from '@/components/CodeSandbox';
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
  parseFsPermissionsLabQuestions,
  type FsPermissionsLabQuestion,
} from '@/lib/scoring/fsPermissionsLab';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type FsPermissionsLabTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/** Flatten initial_state.files (or top-level string paths) for CodeSandbox. */
export function filesFromInitialState(
  initialState: Record<string, unknown>
): Record<string, string> {
  const nested = initialState.files;
  const source =
    typeof nested === 'object' && nested !== null && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : initialState;

  const files: Record<string, string> = {};
  for (const [path, value] of Object.entries(source)) {
    if (
      path === 'files' ||
      path === 'modes' ||
      path === 'fileModes' ||
      path === 'file_modes' ||
      path === 'questions' ||
      path === 'prompt' ||
      path === 'expected_config' ||
      path === 'expected_state' ||
      path === 'rules'
    ) {
      continue;
    }
    if (typeof value === 'string') {
      files[path] = value;
    }
  }
  return files;
}

function modesFromInitialState(
  initialState: Record<string, unknown>
): Record<string, string> {
  const raw =
    initialState.modes ?? initialState.fileModes ?? initialState.file_modes;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [path, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) {
      out[path] = value.trim();
    }
  }
  return out;
}

export function FsPermissionsLabTicket({
  ticket,
  readOnly = false,
  className,
}: FsPermissionsLabTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const restored = asSubmissionRecord(submission);
  const initialState = asRecord(ticket.initial_state);

  const files = useMemo(
    () => filesFromInitialState(asRecord(ticket.initial_state)),
    [ticket.initial_state]
  );
  const modes = useMemo(
    () => modesFromInitialState(asRecord(ticket.initial_state)),
    [ticket.initial_state]
  );
  const questions = useMemo(
    () => parseFsPermissionsLabQuestions(asRecord(ticket.initial_state)),
    [ticket.initial_state]
  );

  const prompt =
    typeof initialState.prompt === 'string' && initialState.prompt.trim()
      ? initialState.prompt.trim()
      : 'Boot the sandbox, navigate the seeded directories with cd and ls, inspect permissions with ls -l, then answer the questions below.';

  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    const saved = restored.answers;
    const savedRecord =
      saved && typeof saved === 'object' && !Array.isArray(saved)
        ? (saved as Record<string, unknown>)
        : {};
    for (const q of questions) {
      const value = savedRecord[q.id];
      init[q.id] = typeof value === 'string' ? value : '';
    }
    return init;
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(() => lastScoreStatus);

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setFieldErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (formReadOnly || hideSubmit) return;

    const errors: Record<string, string> = {};
    for (const q of questions) {
      if (!(answers[q.id] ?? '').trim()) {
        errors[q.id] = 'Answer required.';
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setFeedback(null);
    setScoreStatus(null);

    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'fs_permissions_lab',
          answers,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit answers.');
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
      aria-labelledby="fs-permissions-lab-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="fs-permissions-lab-heading" className="text-lg font-semibold">
          Filesystem permissions lab
        </h2>
        <Badge variant="outline">PI-04 · WebContainer</Badge>
      </div>

      <p className="max-w-prose text-sm text-muted-foreground">{prompt}</p>

      <CodeSandbox
        ticketId={ticket.id}
        initialState={files}
        fileModes={modes}
        showFileBrowser={false}
        showSubmit={false}
        readOnly={readOnly}
      />

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lab questions</CardTitle>
            <CardDescription>
              Use the terminal above — navigate with <code>cd</code>, list with{' '}
              <code>ls -l</code>, and read files with <code>cat</code> — then
              answer based on what you find.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No questions were seeded for this ticket.
              </p>
            ) : (
              questions.map((question, index) => (
                <QuestionField
                  key={question.id}
                  question={question}
                  index={index}
                  value={answers[question.id] ?? ''}
                  error={fieldErrors[question.id]}
                  disabled={formReadOnly || isSubmitting}
                  onChange={(value) => setAnswer(question.id, value)}
                />
              ))
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          {!hideSubmit ? (
            <Button
              type="submit"
              disabled={formReadOnly || isSubmitting || questions.length === 0}
            >
              {isSubmitting ? 'Submitting…' : 'Submit answers'}
            </Button>
          ) : null}
          {scoreStatus ? (
            <Badge
              variant={scoreStatus === 'resolved' ? 'default' : 'secondary'}
            >
              {scoreStatus === 'resolved' ? 'Resolved' : 'Needs revision'}
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
              'text-sm',
              scoreStatus === 'resolved'
                ? 'text-[color:var(--status-satisfied-foreground)]'
                : 'text-muted-foreground'
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

function QuestionField({
  question,
  index,
  value,
  error,
  disabled,
  onChange,
}: {
  question: FsPermissionsLabQuestion;
  index: number;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const fieldId = `fs-lab-q-${question.id}`;
  const errorId = `${fieldId}-error`;

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>
        {index + 1}. {question.prompt}
      </Label>
      {question.input === 'select' && question.options?.length ? (
        <select
          id={fieldId}
          name={question.id}
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Select an answer…</option>
          {question.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={fieldId}
          name={question.id}
          value={value}
          disabled={disabled}
          placeholder={question.placeholder ?? 'Your answer'}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-sm"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
