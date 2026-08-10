'use client';

import { useMemo, useState } from 'react';

import { TrainingFeedbackPanel } from '@/components/feedback/TrainingFeedbackPanel';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { parseControlMappingInitialState } from '@/lib/control-mappings/parseInitialState';
import { parseControlMappingOptions } from '@/lib/control-mappings/parseOptions';
import type { ControlFramework } from '@/lib/control-mappings/types';
import {
  extractTrainingFeedback,
  isTrainingFeedback,
  type TrainingFeedback,
} from '@/lib/feedback/types';
import { CONTROL_MAPPING_MIN_OVERLAP_NARRATIVE_LENGTH } from '@/lib/scoring/ticketUi';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/types';

const FRAMEWORK_LABELS: Record<ControlFramework, string> = {
  nist_800_53: 'NIST SP 800-53',
  soc2: 'SOC 2 TSC',
  iso27001: 'ISO/IEC 27001',
};

type ControlMappingWorkAreaProps = {
  ticket: Pick<Ticket, 'id' | 'initial_state' | 'expected_state'>;
  readOnly?: boolean;
  className?: string;
};

type SubmitResponse = {
  success?: boolean;
  status?: string;
  feedback?: string;
  structuredResult?: Record<string, unknown>;
  trainingFeedback?: TrainingFeedback;
  error?: string;
};

export function ControlMappingWorkArea({
  ticket,
  readOnly = false,
  className,
}: ControlMappingWorkAreaProps) {
  const prompt = useMemo(
    () => parseControlMappingInitialState(ticket.initial_state),
    [ticket.initial_state]
  );

  const gradeOverlapNarrative = useMemo(() => {
    const expected = ticket.expected_state;
    return (
      !!expected &&
      typeof expected === 'object' &&
      !Array.isArray(expected) &&
      (expected as { gradeOverlapNarrative?: unknown })
        .gradeOverlapNarrative === true
    );
  }, [ticket.expected_state]);

  const minOverlapNarrativeLength = useMemo(() => {
    const expected = ticket.expected_state;
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const value = (expected as { minOverlapNarrativeLength?: unknown })
        .minOverlapNarrativeLength;
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
      }
    }
    return CONTROL_MAPPING_MIN_OVERLAP_NARRATIVE_LENGTH;
  }, [ticket.expected_state]);

  const [selected, setSelected] = useState<
    Partial<Record<ControlFramework, Set<string>>>
  >(() => {
    const initial: Partial<Record<ControlFramework, Set<string>>> = {};
    for (const target of prompt?.targets ?? []) {
      initial[target.framework] = new Set();
    }
    return initial;
  });
  const [overlapNarrative, setOverlapNarrative] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'ok' | 'error' | null>(null);
  const [trainingFeedback, setTrainingFeedback] =
    useState<TrainingFeedback | null>(null);

  if (!prompt) {
    return (
      <section
        className={cn(
          'rounded-lg border border-dashed border-border bg-muted/30 px-5 py-8',
          className
        )}
      >
        <h2 className="text-base font-semibold">Control mapping</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This ticket is missing a valid control mapping prompt
          (source_framework, source_control_id, targets).
        </p>
      </section>
    );
  }

  function toggle(framework: ControlFramework, controlId: string) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev[framework] ?? []);
      if (next.has(controlId)) next.delete(controlId);
      else next.add(controlId);
      return { ...prev, [framework]: next };
    });
    setFeedback(null);
    setFeedbackTone(null);
    setTrainingFeedback(null);
  }

  async function handleSubmit() {
    if (readOnly || isSubmitting) return;

    if (
      gradeOverlapNarrative &&
      overlapNarrative.trim().length < minOverlapNarrativeLength
    ) {
      setFeedback(
        `Overlap narrative must be at least ${minOverlapNarrativeLength} characters.`
      );
      setFeedbackTone('error');
      setTrainingFeedback(null);
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    setFeedbackTone(null);
    setTrainingFeedback(null);

    const answers: Partial<Record<ControlFramework, string[]>> = {};
    for (const target of prompt!.targets) {
      answers[target.framework] = Array.from(selected[target.framework] ?? []);
    }

    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          ...(gradeOverlapNarrative
            ? { overlapNarrative: overlapNarrative.trim() }
            : {}),
        }),
      });
      const body = (await response.json()) as SubmitResponse;
      if (!response.ok) {
        setFeedback(body.error ?? 'Submission failed.');
        setFeedbackTone('error');
        return;
      }
      setFeedback(body.feedback ?? 'Submission received.');
      setFeedbackTone(body.status === 'resolved' ? 'ok' : 'error');
      const rich =
        (isTrainingFeedback(body.trainingFeedback)
          ? body.trainingFeedback
          : null) ?? extractTrainingFeedback(body.structuredResult ?? null);
      setTrainingFeedback(rich);
    } catch {
      setFeedback('Network error while submitting.');
      setFeedbackTone('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="control-mapping-heading"
      className={cn('space-y-5 rounded-lg border border-border p-5', className)}
      data-ticket-type="control_mapping"
      data-ticket-id={ticket.id}
    >
      <div className="space-y-2">
        <h2 id="control-mapping-heading" className="text-base font-semibold">
          Control mapping
        </h2>
        <p className="text-sm text-muted-foreground">
          {prompt.prompt ??
            `Given ${prompt.source_control_id}, select every equivalent control in the other frameworks. Scoring uses the reference crosswalk table, not an AI guess.`}
        </p>
      </div>

      <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Given control ID
        </p>
        <p className="mt-1 font-mono text-lg font-semibold tracking-tight">
          {prompt.source_control_id}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {prompt.source_label ?? FRAMEWORK_LABELS[prompt.source_framework]}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Task: mark every equivalent in each framework below. Leave distractors
          unchecked.
        </p>
      </div>

      <div className="space-y-6">
        {prompt.targets.map((target) => {
          const options = parseControlMappingOptions(target.options);
          const groupSelected = selected[target.framework] ?? new Set();
          const label = target.label ?? FRAMEWORK_LABELS[target.framework];

          return (
            <fieldset key={target.framework} className="space-y-3">
              <legend className="text-sm font-semibold">
                Equivalents in {label}
              </legend>
              {options.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No candidate controls configured for this framework.
                </p>
              ) : (
                <ul className="space-y-2">
                  {options.map((option) => {
                    const controlId = option.id;
                    const inputId = `${ticket.id}-${target.framework}-${controlId}`;
                    const checked = groupSelected.has(controlId);
                    return (
                      <li key={controlId}>
                        <Label
                          htmlFor={inputId}
                          className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2.5 font-normal transition-colors',
                            checked
                              ? 'border-primary/40 bg-primary/5'
                              : 'hover:bg-muted/50',
                            readOnly && 'cursor-default opacity-80'
                          )}
                        >
                          <input
                            id={inputId}
                            type="checkbox"
                            className="size-4 accent-primary"
                            checked={checked}
                            disabled={readOnly}
                            onChange={() => toggle(target.framework, controlId)}
                          />
                          <span className="font-mono text-sm">
                            {option.label ?? controlId}
                          </span>
                        </Label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>
          );
        })}
      </div>

      {gradeOverlapNarrative ? (
        <div className="space-y-2">
          <Label htmlFor={`${ticket.id}-overlap-narrative`}>
            Overlap narrative (strong vs partial)
          </Label>
          <Textarea
            id={`${ticket.id}-overlap-narrative`}
            value={overlapNarrative}
            disabled={readOnly}
            rows={5}
            placeholder="Explain where the SOC 2 and ISO mappings are strong versus only partially overlapping relative to AC-2 (for example account review cadence)."
            onChange={(event) => {
              setOverlapNarrative(event.target.value);
              setFeedback(null);
              setFeedbackTone(null);
              setTrainingFeedback(null);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {overlapNarrative.trim().length}/{minOverlapNarrativeLength}{' '}
            characters minimum
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={readOnly || isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Scoring…' : 'Submit mapping'}
        </Button>
        {readOnly ? (
          <p className="text-sm text-muted-foreground">Preview mode</p>
        ) : null}
      </div>

      {trainingFeedback ? (
        <TrainingFeedbackPanel feedback={trainingFeedback} />
      ) : feedback ? (
        <p
          role={feedbackTone === 'error' ? 'alert' : 'status'}
          className={cn(
            'text-sm',
            feedbackTone === 'ok'
              ? 'text-[color:var(--status-satisfied-foreground)]'
              : 'text-destructive'
          )}
        >
          {feedback}
        </p>
      ) : null}
    </section>
  );
}
