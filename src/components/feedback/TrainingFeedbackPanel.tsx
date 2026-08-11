'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import type {
  ChecklistOptionFeedback,
  OptionVerdict,
  RubricDimensionFeedback,
  TrainingFeedback,
} from '@/lib/feedback/types';
import {
  OPTION_VERDICT_HINTS,
  OPTION_VERDICT_LABELS,
} from '@/lib/feedback/verdicts';
import { cn } from '@/lib/utils';

type TrainingFeedbackPanelProps = {
  feedback: TrainingFeedback;
  className?: string;
};

const VERDICT_BADGE_CLASS: Record<OptionVerdict, string> = {
  true_positive:
    'border-status-satisfied-foreground/20 bg-status-satisfied text-status-satisfied-foreground',
  false_positive: 'border-destructive/40 bg-destructive/10 text-destructive',
  false_negative:
    'border-status-insufficient-foreground/20 bg-status-insufficient text-status-insufficient-foreground',
  true_negative: 'border-border bg-muted/40 text-muted-foreground',
};

function ScoreStrip({ feedback }: { feedback: TrainingFeedback }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Score
        </dt>
        <dd className="mt-1 font-mono text-xl font-semibold tabular-nums">
          {feedback.scorePercent}%
        </dd>
      </div>
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Percentile
        </dt>
        <dd className="mt-1 font-mono text-xl font-semibold tabular-nums">
          {feedback.percentile === null ? '—' : `${feedback.percentile}th`}
        </dd>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {feedback.percentile === null
            ? 'Not enough peer attempts yet'
            : 'vs other learners on this scenario'}
        </p>
      </div>
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Time vs SLA
        </dt>
        <dd className="mt-1 font-mono text-xl font-semibold tabular-nums">
          {feedback.sla?.minutesTaken === null ||
          feedback.sla?.minutesTaken === undefined
            ? '—'
            : `${feedback.sla.minutesTaken}m`}
          <span className="text-sm font-normal text-muted-foreground">
            {feedback.sla ? ` / ${feedback.sla.minutesAllowed}m` : ''}
          </span>
        </dd>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {feedback.sla?.withinSla === null ||
          feedback.sla?.withinSla === undefined
            ? 'SLA not counted yet'
            : feedback.sla.withinSla
              ? 'Within SLA'
              : 'Over SLA'}
        </p>
      </div>
    </dl>
  );
}

function ControlInline({ option }: { option: ChecklistOptionFeedback }) {
  const control = option.control;
  if (!control) return null;

  return (
    <div className="mt-2 rounded-md border border-border/80 bg-background/80 px-3 py-2 text-sm">
      <p className="font-medium text-foreground">
        <span className="font-mono">{control.controlId}</span>
        {control.title && control.title !== control.controlId
          ? ` — ${control.title}`
          : null}
      </p>
      {control.statementExcerpt ? (
        <p className="mt-1 text-muted-foreground">{control.statementExcerpt}</p>
      ) : null}
      <Link
        href={control.catalogHref}
        className="mt-1.5 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Open in Control Catalog
      </Link>
    </div>
  );
}

function ChecklistSection({ options }: { options: ChecklistOptionFeedback[] }) {
  const ordered = [...options].sort((a, b) => {
    const rank: Record<OptionVerdict, number> = {
      false_negative: 0,
      false_positive: 1,
      true_positive: 2,
      true_negative: 3,
    };
    return rank[a.verdict] - rank[b.verdict];
  });

  return (
    <section aria-labelledby="training-checklist-heading" className="space-y-3">
      <h3
        id="training-checklist-heading"
        className="text-sm font-semibold text-foreground"
      >
        Option-by-option review
      </h3>
      <ul className="space-y-3">
        {ordered.map((option) => (
          <li
            key={option.optionId}
            className="rounded-md border border-border px-3 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground">
                {option.label}
              </p>
              <Badge
                variant="outline"
                className={cn(
                  'font-normal',
                  VERDICT_BADGE_CLASS[option.verdict]
                )}
              >
                {OPTION_VERDICT_LABELS[option.verdict]}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {option.selected
                ? 'You selected this'
                : 'You left this unselected'}
              {' · '}
              {OPTION_VERDICT_HINTS[option.verdict]}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {option.rationale}
            </p>
            <ControlInline option={option} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RubricSection({
  dimensions,
  modelAnswer,
}: {
  dimensions: RubricDimensionFeedback[];
  modelAnswer?: string;
}) {
  return (
    <section aria-labelledby="training-rubric-heading" className="space-y-3">
      <h3
        id="training-rubric-heading"
        className="text-sm font-semibold text-foreground"
      >
        Rubric breakdown
      </h3>
      <ul className="space-y-3">
        {dimensions.map((dim) => (
          <li
            key={dim.id}
            className="rounded-md border border-border px-3 py-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{dim.label}</p>
              <p className="font-mono text-sm tabular-nums text-muted-foreground">
                {dim.score}/{dim.maxScore}
              </p>
            </div>
            {dim.criteria ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {dim.criteria}
              </p>
            ) : null}
            {dim.strengths.length > 0 ? (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Strengths from your text
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                  {dim.strengths.map((s) => (
                    <li key={s}>
                      <q>{s}</q>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {dim.omissions.length > 0 ? (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Omissions
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {dim.omissions.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {dim.modelAnswer ? (
              <div className="mt-2 rounded-md bg-muted/40 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Model answer
                </p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">
                  {dim.modelAnswer}
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {modelAnswer ? (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Overall model answer
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {modelAnswer}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function TrainingFeedbackPanel({
  feedback,
  className,
}: TrainingFeedbackPanelProps) {
  return (
    <section
      aria-labelledby="training-feedback-heading"
      className={cn(
        'space-y-5 rounded-lg border border-border bg-card p-5',
        className
      )}
      data-training-feedback="true"
    >
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id="training-feedback-heading"
            className="text-base font-semibold"
          >
            Training feedback
          </h2>
          <Badge variant="outline" className="font-normal capitalize">
            {feedback.status.replace('_', ' ')}
          </Badge>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {feedback.summary}
        </p>
      </header>

      <ScoreStrip feedback={feedback} />

      {feedback.checklist && feedback.checklist.options.length > 0 ? (
        <ChecklistSection options={feedback.checklist.options} />
      ) : null}

      {feedback.rubric && feedback.rubric.dimensions.length > 0 ? (
        <RubricSection
          dimensions={feedback.rubric.dimensions}
          modelAnswer={feedback.rubric.modelAnswer}
        />
      ) : null}

      {feedback.reviewNext ? (
        <aside className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            What to review next
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            <Link
              href={feedback.reviewNext.href}
              className="underline-offset-4 hover:underline"
            >
              {feedback.reviewNext.title}
            </Link>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {feedback.reviewNext.reason}
          </p>
        </aside>
      ) : null}
    </section>
  );
}
