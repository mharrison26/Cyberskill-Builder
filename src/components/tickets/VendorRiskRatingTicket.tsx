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
  VENDOR_RISK_MIN_JUSTIFICATION_LENGTH,
  VENDOR_RISK_RATING_LEVELS,
  VENDOR_RISK_RATING_LEVEL_LABELS,
  type VendorRiskRatingLevel,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type VendorRiskRatingTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FormErrors = Partial<Record<'rating' | 'justification', string>>;

type SubprocessorRow = {
  id: string;
  name: string;
  location: string;
  role: string;
};

type BreachRow = {
  id: string;
  year: string;
  summary: string;
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
  expectedState: Record<string, unknown>,
  initialState: Record<string, unknown>
): number {
  for (const source of [expectedState, initialState]) {
    const value = source.minJustificationLength;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  }
  return VENDOR_RISK_MIN_JUSTIFICATION_LENGTH;
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSubprocessors(value: unknown): SubprocessorRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index): SubprocessorRow | null => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const name = readString(record, ['name', 'vendor']);
      const location = readString(record, [
        'location',
        'region',
        'jurisdiction',
      ]);
      const role = readString(record, ['role', 'purpose', 'description']);
      if (!name && !location && !role) return null;
      return {
        id:
          typeof record.id === 'string' && record.id.trim()
            ? record.id.trim()
            : `sub-${index + 1}`,
        name: name || `Subprocessor ${index + 1}`,
        location,
        role,
      };
    })
    .filter((row): row is SubprocessorRow => row !== null);
}

function parseBreaches(value: unknown): BreachRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index): BreachRow | null => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const year =
        typeof record.year === 'number'
          ? String(record.year)
          : readString(record, ['year', 'date']);
      const summary = readString(record, ['summary', 'description', 'notes']);
      if (!year && !summary) return null;
      return {
        id: `breach-${index + 1}`,
        year,
        summary,
      };
    })
    .filter((row): row is BreachRow => row !== null);
}

export function VendorRiskRatingTicket({
  ticket,
  readOnly = false,
  className,
}: VendorRiskRatingTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const minJustificationLength = resolveMinJustificationLength(
    expectedState,
    initialState
  );

  const packet = useMemo(() => {
    const organization = asRecord(initialState.organization);
    const vendor = asRecord(initialState.vendor);
    const access = asRecord(
      vendor.accessCriticality ?? vendor.access_criticality
    );
    const questionnaire = asRecord(initialState.questionnaire);
    const soc2 = asRecord(questionnaire.soc2);
    const otherControls = asRecord(
      questionnaire.otherControls ?? questionnaire.other_controls
    );

    return {
      prompt: readString(
        initialState,
        ['prompt', 'instructions'],
        "Assign a vendor risk rating (Low/Moderate/High/Critical) and justify using SP 800-161 SCRM-oriented criteria. Account for criticality of the vendor's access, not only questionnaire responses."
      ),
      organizationName: readString(organization, ['name'], 'Organization'),
      organizationSystem: readString(
        organization,
        ['system', 'systemName'],
        ''
      ),
      vendorName: readString(vendor, ['name'], 'Vendor'),
      vendorService: readString(vendor, ['service', 'description'], ''),
      dataClasses: parseStringList(access.dataClasses ?? access.data_classes),
      privilegeLevel: readString(access, ['privilegeLevel', 'privilege_level']),
      businessImpact: readString(access, ['businessImpact', 'business_impact']),
      replaceability: readString(access, ['replaceability']),
      soc2Status: readString(soc2, ['status']),
      soc2PeriodEnd: readString(soc2, ['periodEnd', 'period_end']),
      soc2Exceptions: readString(soc2, ['exceptions', 'notes']),
      subprocessors: parseSubprocessors(questionnaire.subprocessors),
      breaches: parseBreaches(
        questionnaire.breachHistory ?? questionnaire.breach_history
      ),
      otherControls,
    };
  }, [initialState]);

  const [rating, setRating] = useState<VendorRiskRatingLevel | ''>('');
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

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    if (!rating) {
      nextErrors.rating = 'Select a vendor risk rating.';
    }
    const trimmed = justification.trim();
    if (!trimmed) {
      nextErrors.justification =
        'Write a justification that weighs access criticality under SP 800-161 C-SCRM — not only questionnaire score.';
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
    if (!validate() || !rating) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'vendor_risk_rating',
          rating,
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
          payload.error ?? 'Failed to submit vendor risk rating.'
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

  const otherControlEntries = Object.entries(packet.otherControls);

  return (
    <section
      aria-labelledby="vendor-risk-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="vendor-risk-heading" className="text-lg font-semibold">
          Vendor risk rating
        </h2>
        <Badge variant="outline">SP 800-161 C-SCRM</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{packet.vendorName}</CardTitle>
          <CardDescription>{packet.prompt}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Customer: </span>
            {packet.organizationName}
            {packet.organizationSystem ? ` — ${packet.organizationSystem}` : ''}
          </p>
          {packet.vendorService ? (
            <p className="whitespace-pre-wrap text-muted-foreground">
              <span className="font-medium text-foreground">Service: </span>
              {packet.vendorService}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-amber-500/40">
        <CardHeader>
          <CardTitle className="text-base">
            Access / criticality profile
          </CardTitle>
          <CardDescription>
            Factor this inherent exposure into the rating — do not rate from
            questionnaire hygiene alone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {packet.dataClasses.length > 0 ? (
            <div>
              <p className="font-medium text-foreground">Data classes</p>
              <p className="mt-1 text-muted-foreground">
                {packet.dataClasses.join(', ')}
              </p>
            </div>
          ) : null}
          {packet.privilegeLevel ? (
            <div>
              <p className="font-medium text-foreground">Privilege level</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {packet.privilegeLevel}
              </p>
            </div>
          ) : null}
          {packet.businessImpact ? (
            <div>
              <p className="font-medium text-foreground">Business impact</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {packet.businessImpact}
              </p>
            </div>
          ) : null}
          {packet.replaceability ? (
            <div>
              <p className="font-medium text-foreground">Replaceability</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {packet.replaceability}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Security questionnaire</CardTitle>
          <CardDescription>
            Completed vendor packet (assurance evidence). Strong answers here do
            not erase high access criticality.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          <div>
            <p className="font-medium text-foreground">SOC 2</p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {packet.soc2Status ? <li>Status: {packet.soc2Status}</li> : null}
              {packet.soc2PeriodEnd ? (
                <li>Period end: {packet.soc2PeriodEnd}</li>
              ) : null}
              {packet.soc2Exceptions ? (
                <li>Exceptions: {packet.soc2Exceptions}</li>
              ) : null}
              {!packet.soc2Status &&
              !packet.soc2PeriodEnd &&
              !packet.soc2Exceptions ? (
                <li>No SOC 2 details seeded on this ticket.</li>
              ) : null}
            </ul>
          </div>

          <div>
            <p className="font-medium text-foreground">Subprocessors</p>
            {packet.subprocessors.length === 0 ? (
              <p className="mt-1 text-muted-foreground">None listed.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {packet.subprocessors.map((row) => (
                  <li key={row.id}>
                    <p className="font-medium text-foreground">{row.name}</p>
                    <p className="text-muted-foreground">
                      {[row.location, row.role].filter(Boolean).join(' — ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="font-medium text-foreground">Breach history</p>
            {packet.breaches.length === 0 ? (
              <p className="mt-1 text-muted-foreground">
                No incidents disclosed.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {packet.breaches.map((row) => (
                  <li key={row.id} className="text-muted-foreground">
                    {row.year ? (
                      <span className="font-medium text-foreground">
                        {row.year}:{' '}
                      </span>
                    ) : null}
                    {row.summary}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {otherControlEntries.length > 0 ? (
            <div>
              <p className="font-medium text-foreground">Other controls</p>
              <ul className="mt-1 list-inside list-disc text-muted-foreground">
                {otherControlEntries.map(([key, value]) => (
                  <li key={key}>
                    {key}: {String(value)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your rating</CardTitle>
            <CardDescription>
              Select Low / Moderate / High / Critical and justify with SP
              800-161 C-SCRM factors (min {minJustificationLength} characters).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                Vendor risk rating
              </legend>
              <div className="flex flex-wrap gap-3">
                {VENDOR_RISK_RATING_LEVELS.map((option) => (
                  <label
                    key={option}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm',
                      rating === option
                        ? 'border-foreground bg-muted'
                        : 'border-border'
                    )}
                  >
                    <input
                      type="radio"
                      name="vendor-risk-rating"
                      value={option}
                      checked={rating === option}
                      disabled={readOnly || isSubmitting}
                      onChange={() => {
                        clearOutcome();
                        setRating(option);
                      }}
                    />
                    {VENDOR_RISK_RATING_LEVEL_LABELS[option]}
                  </label>
                ))}
              </div>
              {errors.rating ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.rating}
                </p>
              ) : null}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="vendor-risk-justification">
                Rating justification
              </Label>
              <Textarea
                id="vendor-risk-justification"
                value={justification}
                disabled={readOnly || isSubmitting}
                onChange={(event) => {
                  clearOutcome();
                  setJustification(event.target.value);
                }}
                rows={8}
                placeholder="Explain the rating using access criticality / inherent risk under SP 800-161 C-SCRM. Weigh production privilege, data classes, business impact, and replaceability — do not conclude Low/Moderate from SOC 2 or questionnaire score alone…"
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
              {isSubmitting ? 'Submitting…' : 'Submit vendor risk rating'}
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
