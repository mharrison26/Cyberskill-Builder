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
  FIPS_199_IMPACT_LEVELS,
  FIPS_199_IMPACT_LEVEL_LABELS,
  FIPS_199_MIN_JUSTIFICATION_LENGTH,
  FIPS_199_SECURITY_OBJECTIVES,
  FIPS_199_SECURITY_OBJECTIVE_LABELS,
  type Fips199ImpactLevel,
  type Fips199SecurityObjective,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type Fips199ImpactCategorizationTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type LevelField = Fips199SecurityObjective | 'overall';

type FormErrors = Partial<Record<LevelField | 'justification', string>>;

type InfoTypeRow = {
  id: string;
  name: string;
  notes: string;
};

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

function resolveMinJustificationLength(
  expectedState: Record<string, unknown>
): number {
  const value = expectedState.minJustificationLength;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return FIPS_199_MIN_JUSTIFICATION_LENGTH;
}

function parseInfoTypes(source: Record<string, unknown>): InfoTypeRow[] {
  const raw = source.dataTypes ?? source.informationTypes;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry, index): InfoTypeRow | null => {
      if (typeof entry === 'string' && entry.trim()) {
        return {
          id: `type-${index + 1}`,
          name: entry.trim(),
          notes: '',
        };
      }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const name = readString(record, ['name', 'type', 'title']);
      const notes = readString(record, ['notes', 'description', 'impactNotes']);
      if (!name && !notes) return null;
      const id =
        typeof record.id === 'string' && record.id.trim()
          ? record.id.trim()
          : `type-${index + 1}`;
      return { id, name: name || id, notes };
    })
    .filter((row): row is InfoTypeRow => row !== null);
}

export function Fips199ImpactCategorizationTicket({
  ticket,
  readOnly = false,
  className,
}: Fips199ImpactCategorizationTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const minJustificationLength = resolveMinJustificationLength(expectedState);

  const system = useMemo(() => {
    const nested = asRecord(initialState.systemProfile ?? initialState.system);
    return {
      name: readString(
        nested,
        ['name', 'title'],
        readString(initialState, ['systemName'], 'Information system')
      ),
      description: readString(
        nested,
        ['description', 'summary'],
        readString(initialState, ['systemDescription'], 'See scenario brief.')
      ),
      mission: readString(nested, ['mission', 'missionImpact'], ''),
      environment: readString(nested, ['environment'], ''),
      fallbackNotes: readString(
        nested,
        ['fallbackNotes', 'fallbacks', 'contingencies'],
        ''
      ),
      dataTypes: parseInfoTypes(
        Object.keys(nested).length > 0 ? nested : initialState
      ),
      prompt: readString(
        initialState,
        ['prompt', 'instructions'],
        'Assign FIPS 199 potential impact levels (Low / Moderate / High) for confidentiality, integrity, and availability, set the overall high-water mark, and justify each selection from the system profile.'
      ),
    };
  }, [initialState]);

  const [levels, setLevels] = useState<
    Record<LevelField, Fips199ImpactLevel | ''>
  >({
    confidentiality: '',
    integrity: '',
    availability: '',
    overall: '',
  });
  const [justification, setJustification] = useState('');
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

  function setLevel(field: LevelField, value: Fips199ImpactLevel) {
    clearOutcome();
    setLevels((prev) => ({ ...prev, [field]: value }));
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};

    for (const objective of FIPS_199_SECURITY_OBJECTIVES) {
      if (!levels[objective]) {
        nextErrors[objective] =
          `Select a ${FIPS_199_SECURITY_OBJECTIVE_LABELS[objective]} impact level.`;
      }
    }
    if (!levels.overall) {
      nextErrors.overall = 'Select the overall (high-water mark) category.';
    }

    const trimmed = justification.trim();
    if (!trimmed) {
      nextErrors.justification =
        'Write a justification that cites FIPS 199 impact definitions and scenario facts.';
    } else if (trimmed.length < minJustificationLength) {
      nextErrors.justification = `Justification must be at least ${minJustificationLength} characters.`;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    clearOutcome();
    if (!validate()) return;
    if (
      !levels.confidentiality ||
      !levels.integrity ||
      !levels.availability ||
      !levels.overall
    ) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'fips_199_impact_categorization',
          confidentiality: levels.confidentiality,
          integrity: levels.integrity,
          availability: levels.availability,
          overall: levels.overall,
          justification: justification.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? 'Failed to submit FIPS 199 categorization.'
        );
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

  function renderLevelFieldset(
    field: LevelField,
    legend: string,
    description?: string
  ) {
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{legend}</legend>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {FIPS_199_IMPACT_LEVELS.map((option) => (
            <label
              key={`${field}-${option}`}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                levels[field] === option
                  ? 'border-foreground bg-muted'
                  : 'border-border'
              )}
            >
              <input
                type="radio"
                name={`fips199-${field}`}
                value={option}
                checked={levels[field] === option}
                disabled={readOnly || isSubmitting}
                onChange={() => setLevel(field, option)}
              />
              {FIPS_199_IMPACT_LEVEL_LABELS[option]}
            </label>
          ))}
        </div>
        {errors[field] ? (
          <p className="text-sm text-destructive" role="alert">
            {errors[field]}
          </p>
        ) : null}
      </fieldset>
    );
  }

  return (
    <section
      aria-labelledby="fips199-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="fips199-heading" className="text-lg font-semibold">
          FIPS 199 impact categorization
        </h2>
        <Badge variant="outline">Security categorization</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{system.name}</CardTitle>
          <CardDescription>{system.prompt}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="whitespace-pre-wrap text-muted-foreground">
            {system.description}
          </p>
          {system.mission ? (
            <div>
              <p className="font-medium text-foreground">Mission impact</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {system.mission}
              </p>
            </div>
          ) : null}
          {system.environment ? (
            <div>
              <p className="font-medium text-foreground">Environment</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {system.environment}
              </p>
            </div>
          ) : null}
          {system.fallbackNotes ? (
            <div>
              <p className="font-medium text-foreground">
                Fallbacks / contingencies
              </p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {system.fallbackNotes}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Information types processed
          </CardTitle>
          <CardDescription>
            Base each C/I/A selection on these data types and the mission
            consequences of losing confidentiality, integrity, or availability.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {system.dataTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Information types are not loaded on this ticket. Ask an admin to
              seed{' '}
              <span className="font-medium">
                initial_state.systemProfile.dataTypes
              </span>
              .
            </p>
          ) : (
            <ul className="space-y-3 text-sm">
              {system.dataTypes.map((row) => (
                <li key={row.id}>
                  <p className="font-medium text-foreground">{row.name}</p>
                  {row.notes ? (
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {row.notes}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your categorization</CardTitle>
            <CardDescription>
              Assign Low / Moderate / High for each security objective, then set
              overall to the high-water mark. Justify with scenario facts (min{' '}
              {minJustificationLength} characters).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {FIPS_199_SECURITY_OBJECTIVES.map((objective) =>
              renderLevelFieldset(
                objective,
                FIPS_199_SECURITY_OBJECTIVE_LABELS[objective]
              )
            )}
            {renderLevelFieldset(
              'overall',
              'Overall system category',
              'Must equal the highest of confidentiality, integrity, and availability (high-water mark).'
            )}

            <div className="space-y-2">
              <Label htmlFor="fips199-justification">
                Categorization justification
              </Label>
              <Textarea
                id="fips199-justification"
                value={justification}
                disabled={readOnly || isSubmitting}
                onChange={(event) => {
                  clearOutcome();
                  setJustification(event.target.value);
                }}
                rows={8}
                placeholder="For each objective, cite information types and whether loss would cause limited, serious, or severe/catastrophic adverse effects. Explain why overall equals the high-water mark…"
              />
              <p className="text-xs text-muted-foreground">
                {justification.trim().length}/{minJustificationLength}{' '}
                characters minimum
              </p>
              {errors.justification ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.justification}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit categorization'}
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
        {feedback ? (
          <p
            className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
            role="status"
          >
            {feedback}
          </p>
        ) : null}
      </form>
    </section>
  );
}
