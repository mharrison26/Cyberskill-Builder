'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CCCER_MIN_LENGTH } from '@/lib/lessons/cccerValidation';
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

type CCCERFormProps = {
  initialValues?: Partial<CCCERValues>;
  onSubmit?: (values: CCCERValues) => void | Promise<void>;
  isSubmitting?: boolean;
  submitError?: string | null;
  submitSuccess?: boolean;
  submitLabel?: string;
  className?: string;
};

export function CCCERForm({
  initialValues = {},
  onSubmit,
  isSubmitting = false,
  submitError = null,
  submitSuccess = false,
  submitLabel = 'Submit finding',
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

  function validate(): boolean {
    const nextErrors: Partial<Record<keyof CCCERValues, string>> = {};
    for (const field of FIELDS) {
      const value = values[field.key].trim();
      if (!value) {
        nextErrors[field.key] = `${field.label} is required.`;
      } else if (value.length < CCCER_MIN_LENGTH) {
        nextErrors[field.key] =
          `${field.label} must be at least ${CCCER_MIN_LENGTH} characters.`;
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    await onSubmit?.(values);
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
              disabled={isSubmitting}
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

      {submitError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {submitError}
        </p>
      ) : null}

      {submitSuccess ? (
        <p
          role="status"
          className="rounded-md border border-status-satisfied-foreground/20 bg-status-satisfied px-4 py-3 text-sm text-status-satisfied-foreground"
        >
          Finding submitted successfully. It will be reviewed by an assessor.
        </p>
      ) : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Submitting…' : submitLabel}
      </Button>
    </form>
  );
}
