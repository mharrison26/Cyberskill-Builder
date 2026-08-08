'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
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
  SEC_MATERIALITY_FACTOR_KEYS,
  SEC_MATERIALITY_FACTOR_LABELS,
  SEC_MATERIALITY_MIN_FACTOR_LENGTH,
  SEC_MATERIALITY_MIN_RATIONALE_LENGTH,
  type SecMaterialityDetermination,
  type SecMaterialityFactorKey,
} from '@/lib/scoring/secMateriality';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type SecMaterialityTicketProps = {
  ticket: Pick<Ticket, 'id' | 'ticket_type' | 'initial_state' | 'expected_state'>;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = Partial<
  Record<SecMaterialityFactorKey | 'determination' | 'rationale', string>
>;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function resolveMinLength(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

function emptyFactors(): Record<SecMaterialityFactorKey, string> {
  return {
    nature_scope: '',
    data_compromise: '',
    operational_impact: '',
    financial_impact: '',
    reputational_legal: '',
    reasonable_investor: '',
  };
}

export function SecMaterialityTicket({
  ticket,
  readOnly = false,
  className,
}: SecMaterialityTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);

  const minFactorLength = resolveMinLength(
    expectedState.minFactorLength,
    SEC_MATERIALITY_MIN_FACTOR_LENGTH
  );
  const minRationaleLength = resolveMinLength(
    expectedState.minRationaleLength,
    SEC_MATERIALITY_MIN_RATIONALE_LENGTH
  );

  const breach = useMemo(() => {
    const nested = asRecord(initialState.breach);
    return {
      company:
        typeof nested.company === 'string'
          ? nested.company
          : typeof initialState.company === 'string'
            ? initialState.company
            : 'Northline Analytics, Inc. (fictional public company)',
      discoveredAt:
        typeof nested.discoveredAt === 'string'
          ? nested.discoveredAt
          : 'Day 0 (discovery)',
      systemsAffected:
        typeof nested.systemsAffected === 'string'
          ? nested.systemsAffected
          : 'See scenario brief.',
      dataExposed:
        typeof nested.dataExposed === 'string'
          ? nested.dataExposed
          : 'See scenario brief.',
      businessImpact:
        typeof nested.businessImpact === 'string'
          ? nested.businessImpact
          : 'See scenario brief.',
    };
  }, [initialState]);

  const [determination, setDetermination] =
    useState<SecMaterialityDetermination | ''>('');
  const [rationale, setRationale] = useState('');
  const [factors, setFactors] =
    useState<Record<SecMaterialityFactorKey, string>>(emptyFactors);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};

    if (!determination) {
      nextErrors.determination =
        'Select whether the incident is material or not material.';
    }

    const trimmedRationale = rationale.trim();
    if (!trimmedRationale) {
      nextErrors.rationale =
        'Explain your determination and the Item 1.05 four-business-day clock.';
    } else if (trimmedRationale.length < minRationaleLength) {
      nextErrors.rationale = `Rationale must be at least ${minRationaleLength} characters.`;
    }

    for (const key of SEC_MATERIALITY_FACTOR_KEYS) {
      const text = factors[key].trim();
      if (!text) {
        nextErrors[key] = 'This factor section is required.';
      } else if (text.length < minFactorLength) {
        nextErrors[key] = `Expand to at least ${minFactorLength} characters.`;
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    clearOutcome();
    if (!validate() || !determination) return;

    setIsSubmitting(true);
    try {
      const factorPayload = Object.fromEntries(
        SEC_MATERIALITY_FACTOR_KEYS.map((key) => [key, factors[key].trim()])
      );

      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'sec_materiality',
          determination,
          determinationRationale: rationale.trim(),
          factors: factorPayload,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit materiality memo.');
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
      aria-labelledby="sec-materiality-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="sec-materiality-heading" className="text-lg font-semibold">
          SEC materiality determination memo
        </h2>
        <Badge variant="outline">Form 8-K Item 1.05</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fictional breach snapshot</CardTitle>
          <CardDescription>
            Draft your memo from these facts and the scenario brief. Educational
            exercise only — not legal advice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <span className="font-medium text-foreground">Company: </span>
            <span className="text-muted-foreground">{breach.company}</span>
          </p>
          <p>
            <span className="font-medium text-foreground">Discovered: </span>
            <span className="text-muted-foreground">{breach.discoveredAt}</span>
          </p>
          <div>
            <p className="font-medium text-foreground">Systems affected</p>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              {breach.systemsAffected}
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Data exposed</p>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              {breach.dataExposed}
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground">Business impact</p>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              {breach.businessImpact}
            </p>
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              8-K Item 1.05 determination
            </CardTitle>
            <CardDescription>
              Decide whether the incident is material for disclosure and explain
              whether the four-business-day filing clock has started.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Materiality</legend>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="sec-determination"
                    value="material"
                    checked={determination === 'material'}
                    onChange={() => {
                      setDetermination('material');
                      clearOutcome();
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.determination;
                        return next;
                      });
                    }}
                    disabled={readOnly || isSubmitting}
                  />
                  Material (Item 1.05 may be required)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="sec-determination"
                    value="not_material"
                    checked={determination === 'not_material'}
                    onChange={() => {
                      setDetermination('not_material');
                      clearOutcome();
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.determination;
                        return next;
                      });
                    }}
                    disabled={readOnly || isSubmitting}
                  />
                  Not material
                </label>
              </div>
              {errors.determination ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors.determination}
                </p>
              ) : null}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="sec-determination-rationale">
                Determination &amp; four-business-day rationale
              </Label>
              <Textarea
                id="sec-determination-rationale"
                value={rationale}
                onChange={(event) => {
                  setRationale(event.target.value);
                  clearOutcome();
                  if (errors.rationale) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.rationale;
                      return next;
                    });
                  }
                }}
                rows={5}
                placeholder="State when materiality was determined, why the conclusion follows from the factors below, and whether the four-business-day Item 1.05 clock has started…"
                aria-invalid={errors.rationale ? true : undefined}
                disabled={readOnly || isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Minimum {minRationaleLength} characters. Clock runs from the
                materiality determination, not necessarily discovery.
              </p>
              {errors.rationale ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors.rationale}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {SEC_MATERIALITY_FACTOR_KEYS.map((key) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle className="text-base">
                {SEC_MATERIALITY_FACTOR_LABELS[key]}
              </CardTitle>
              <CardDescription>
                Address this materiality factor with scenario-specific analysis
                (not generic labels alone).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Label htmlFor={`sec-factor-${key}`}>
                {SEC_MATERIALITY_FACTOR_LABELS[key]}
              </Label>
              <Textarea
                id={`sec-factor-${key}`}
                value={factors[key]}
                onChange={(event) => {
                  const value = event.target.value;
                  setFactors((prev) => ({ ...prev, [key]: value }));
                  clearOutcome();
                  if (errors[key]) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next[key];
                      return next;
                    });
                  }
                }}
                rows={4}
                placeholder="Tie the breach facts to this factor and investor significance…"
                aria-invalid={errors[key] ? true : undefined}
                disabled={readOnly || isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Minimum {minFactorLength} characters.
              </p>
              {errors[key] ? (
                <p role="alert" className="text-sm text-destructive">
                  {errors[key]}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}

        {submitError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            {submitError}
          </p>
        ) : null}

        {feedback ? (
          <p
            role="status"
            className={cn(
              'rounded-md border px-4 py-3 text-sm',
              scoreStatus === 'resolved'
                ? 'border-status-satisfied-foreground/20 bg-status-satisfied text-status-satisfied-foreground'
                : 'border-border bg-muted/40 text-foreground'
            )}
          >
            {scoreStatus ? (
              <span className="mb-1 block font-medium capitalize">
                {scoreStatus.replace(/_/g, ' ')}
              </span>
            ) : null}
            {feedback}
          </p>
        ) : null}

        <Button type="submit" disabled={readOnly || isSubmitting}>
          {isSubmitting ? 'Submitting…' : 'Submit materiality memo'}
        </Button>
      </form>
    </section>
  );
}
