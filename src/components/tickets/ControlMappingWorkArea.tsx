'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { parseControlMappingInitialState } from '@/lib/control-mappings/parseInitialState';
import type { ControlFramework } from '@/lib/control-mappings/types';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/types';

const FRAMEWORK_LABELS: Record<ControlFramework, string> = {
  nist_800_53: 'NIST SP 800-53',
  soc2: 'SOC 2 TSC',
  iso27001: 'ISO/IEC 27001',
};

type ControlMappingWorkAreaProps = {
  ticket: Pick<Ticket, 'id' | 'initial_state'>;
  readOnly?: boolean;
  className?: string;
};

type SubmitResponse = {
  success?: boolean;
  status?: string;
  feedback?: string;
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

  const [selected, setSelected] = useState<
    Partial<Record<ControlFramework, Set<string>>>
  >(() => {
    const initial: Partial<Record<ControlFramework, Set<string>>> = {};
    for (const target of prompt?.targets ?? []) {
      initial[target.framework] = new Set();
    }
    return initial;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'ok' | 'error' | null>(null);

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
  }

  async function handleSubmit() {
    if (readOnly || isSubmitting) return;
    setIsSubmitting(true);
    setFeedback(null);
    setFeedbackTone(null);

    const answers: Partial<Record<ControlFramework, string[]>> = {};
    for (const target of prompt!.targets) {
      answers[target.framework] = Array.from(selected[target.framework] ?? []);
    }

    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const body = (await response.json()) as SubmitResponse;
      if (!response.ok) {
        setFeedback(body.error ?? 'Submission failed.');
        setFeedbackTone('error');
        return;
      }
      setFeedback(body.feedback ?? 'Submission received.');
      setFeedbackTone(body.status === 'resolved' ? 'ok' : 'error');
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
            'Identify equivalent controls in the other frameworks. Scoring uses the reference crosswalk table, not an AI guess.'}
        </p>
      </div>

      <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Source control
        </p>
        <p className="mt-1 font-mono text-lg font-semibold tracking-tight">
          {prompt.source_control_id}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {prompt.source_label ?? FRAMEWORK_LABELS[prompt.source_framework]}
        </p>
      </div>

      <div className="space-y-6">
        {prompt.targets.map((target) => {
          const options = target.options ?? [];
          const groupSelected = selected[target.framework] ?? new Set();
          const label = target.label ?? FRAMEWORK_LABELS[target.framework];

          return (
            <fieldset key={target.framework} className="space-y-3">
              <legend className="text-sm font-semibold">{label}</legend>
              {options.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No candidate controls configured for this framework.
                </p>
              ) : (
                <ul className="space-y-2">
                  {options.map((controlId) => {
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
                          <span className="font-mono text-sm">{controlId}</span>
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

      {feedback ? (
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
