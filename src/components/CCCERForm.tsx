'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CCCERValues } from '@/types';
import { cn } from '@/lib/utils';

const FIELDS: { key: keyof CCCERValues; label: string; hint: string }[] = [
  {
    key: 'condition',
    label: 'Condition',
    hint: 'Describe the current state or context observed in the evidence.',
  },
  {
    key: 'criteria',
    label: 'Criteria',
    hint: 'State the control requirement or expected standard.',
  },
  {
    key: 'cause',
    label: 'Cause',
    hint: 'Identify the root cause of any gap between condition and criteria.',
  },
  {
    key: 'effect',
    label: 'Effect',
    hint: 'Explain the risk or impact if the gap is not remediated.',
  },
  {
    key: 'recommendation',
    label: 'Recommendation',
    hint: 'Provide actionable remediation steps.',
  },
];

const MIN_LENGTH = 20;

type CCCERFormProps = {
  initialValues?: Partial<CCCERValues>;
  onSubmit?: (values: CCCERValues) => void;
  className?: string;
};

export function CCCERForm({
  initialValues = {},
  onSubmit,
  className,
}: CCCERFormProps) {
  const [values, setValues] = useState<CCCERValues>({
    condition: initialValues.condition ?? '',
    criteria: initialValues.criteria ?? '',
    cause: initialValues.cause ?? '',
    effect: initialValues.effect ?? '',
    recommendation: initialValues.recommendation ?? '',
  });
  const [errors, setErrors] = useState<
    Partial<Record<keyof CCCERValues, string>>
  >({});
  const [submitted, setSubmitted] = useState(false);

  function validate(): boolean {
    const nextErrors: Partial<Record<keyof CCCERValues, string>> = {};
    for (const field of FIELDS) {
      const value = values[field.key].trim();
      if (!value) {
        nextErrors[field.key] = `${field.label} is required.`;
      } else if (value.length < MIN_LENGTH) {
        nextErrors[field.key] =
          `${field.label} must be at least ${MIN_LENGTH} characters.`;
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleChange(key: keyof CCCERValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!validate()) return;
    onSubmit?.(values);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className={cn('space-y-6', className)}
      aria-labelledby="ccc-er-form-heading"
    >
      <div>
        <h3 id="ccc-er-form-heading" className="text-lg font-semibold">
          CCCER Finding
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Document your assessment using Condition, Criteria, Cause, Effect, and
          Recommendation.
        </p>
      </div>

      {FIELDS.map((field) => {
        const fieldId = `ccc-er-${field.key}`;
        const errorId = `${fieldId}-error`;
        const hasError = Boolean(errors[field.key]);

        return (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={fieldId}>{field.label}</Label>
            <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">
              {field.hint}
            </p>
            <Textarea
              id={fieldId}
              name={field.key}
              value={values[field.key]}
              onChange={(e) => handleChange(field.key, e.target.value)}
              aria-describedby={`${fieldId}-hint${hasError ? ` ${errorId}` : ''}`}
              aria-invalid={hasError}
              rows={3}
              className={cn(hasError && 'border-destructive')}
            />
            {hasError ? (
              <p id={errorId} role="alert" className="text-sm text-destructive">
                {errors[field.key]}
              </p>
            ) : null}
          </div>
        );
      })}

      {submitted && Object.keys(errors).length === 0 ? (
        <p
          role="status"
          className="rounded-md border border-status-satisfied-foreground/20 bg-status-satisfied px-4 py-3 text-sm text-status-satisfied-foreground"
        >
          Finding saved locally (mock). In production, this would submit for
          assessor review.
        </p>
      ) : null}

      <Button type="submit">Save finding</Button>
    </form>
  );
}
