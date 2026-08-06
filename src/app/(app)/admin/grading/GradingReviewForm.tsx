'use client';

import { useFormState, useFormStatus } from 'react-dom';

import {
  updateFinding,
  type FindingActionResult,
} from '@/app/(app)/admin/grading/actions';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { STATUS_LABELS, type StatusKey } from '@/lib/status';
import type { FindingState } from '@/types';
import { cn } from '@/lib/utils';

const GRADING_STATES: FindingState[] = [
  'satisfied',
  'insufficient_evidence',
  'not_satisfied',
];

const selectClassName = cn(
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm',
  'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
  'disabled:cursor-not-allowed disabled:opacity-50'
);

const initialState: FindingActionResult = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Mark reviewed'}
    </Button>
  );
}

type GradingReviewFormProps = {
  findingId: string;
  findingState: string;
  feedback: string;
};

export function GradingReviewForm({
  findingId,
  findingState,
  feedback,
}: GradingReviewFormProps) {
  const [state, formAction] = useFormState(updateFinding, initialState);
  const stateSelectId = `finding-state-${findingId}`;
  const feedbackId = `feedback-${findingId}`;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={findingId} />

      <div className="space-y-2">
        <Label htmlFor={stateSelectId}>Finding state override</Label>
        <select
          id={stateSelectId}
          name="finding_state"
          required
          defaultValue={
            GRADING_STATES.includes(findingState as FindingState)
              ? findingState
              : 'insufficient_evidence'
          }
          className={selectClassName}
          aria-invalid={state.fieldErrors?.finding_state ? true : undefined}
          aria-describedby={
            state.fieldErrors?.finding_state
              ? `${stateSelectId}-error`
              : undefined
          }
        >
          {GRADING_STATES.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABELS[value as StatusKey]}
            </option>
          ))}
        </select>
        {state.fieldErrors?.finding_state ? (
          <p
            id={`${stateSelectId}-error`}
            role="alert"
            className="text-sm text-destructive"
          >
            {state.fieldErrors.finding_state}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor={feedbackId}>AI feedback override</Label>
        <Textarea
          id={feedbackId}
          name="feedback"
          rows={4}
          defaultValue={feedback}
          placeholder="Assessor feedback shown to the student…"
          aria-invalid={state.fieldErrors?.feedback ? true : undefined}
        />
        {state.fieldErrors?.feedback ? (
          <p role="alert" className="text-sm text-destructive">
            {state.fieldErrors.feedback}
          </p>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
