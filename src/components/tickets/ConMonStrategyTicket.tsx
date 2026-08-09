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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  CONMON_STRATEGY_MIN_ESCALATION_LENGTH,
  CONMON_STRATEGY_MIN_FIELD_LENGTH,
  CONMON_TOOLS,
  DEFAULT_CONMON_CONTROL_FAMILIES,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type ConMonStrategyTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type FamilyRow = {
  family: string;
  cadence: string;
  rationale: string;
};

type ToolRow = {
  tool: string;
  families: string;
  rationale: string;
};

type FormErrors = {
  families?: string;
  tools?: string;
  escalationReporting?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function resolveStringList(
  value: unknown,
  fallback: readonly string[]
): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const items = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return items.length > 0 ? items : [...fallback];
}

function resolveMinLength(
  expectedState: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const value = expectedState[key];
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return fallback;
}

function formatSystemProfile(initialState: Record<string, unknown>): {
  title: string;
  lines: string[];
} {
  const profile = initialState.systemProfile ?? initialState.system_profile;
  if (typeof profile === 'string' && profile.trim()) {
    return {
      title: 'System profile',
      lines: profile
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    };
  }

  const record = asRecord(profile);
  const name =
    typeof record.name === 'string' && record.name.trim()
      ? record.name.trim()
      : 'Fictional system profile';

  const lines: string[] = [];
  const orderedKeys = [
    'description',
    'impact',
    'environment',
    'dataTypes',
    'components',
    'constraints',
    'controlFamilies',
  ];

  for (const key of orderedKeys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      lines.push(`${labelize(key)}: ${value.trim()}`);
    } else if (Array.isArray(value)) {
      const items = value.filter(
        (entry) => typeof entry === 'string'
      ) as string[];
      if (items.length > 0) {
        lines.push(`${labelize(key)}: ${items.join(', ')}`);
      }
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (orderedKeys.includes(key) || key === 'name') continue;
    if (typeof value === 'string' && value.trim()) {
      lines.push(`${labelize(key)}: ${value.trim()}`);
    }
  }

  return { title: name, lines };
}

function labelize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function ConMonStrategyTicket({
  ticket,
  readOnly = false,
  className,
}: ConMonStrategyTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const ticketCode =
    typeof initialState.ticketCode === 'string' &&
    initialState.ticketCode.trim()
      ? initialState.ticketCode.trim()
      : typeof initialState.ticket_code === 'string' &&
          initialState.ticket_code.trim()
        ? initialState.ticket_code.trim()
        : null;
  const impactLevelLabel = useMemo(() => {
    const profileRecord = asRecord(initialState.systemProfile);
    const raw =
      (typeof initialState.impactLevel === 'string' &&
        initialState.impactLevel) ||
      (typeof expectedState.impactLevel === 'string' &&
        expectedState.impactLevel) ||
      (typeof profileRecord.impactLevel === 'string' &&
        profileRecord.impactLevel) ||
      (typeof profileRecord.impact === 'string' && profileRecord.impact) ||
      null;
    if (!raw) return null;
    const match = raw.match(/\b(low|moderate|medium|high)\b/i);
    if (!match) return raw.trim();
    const level = match[1].toLowerCase();
    if (level === 'medium') return 'Moderate';
    return level.charAt(0).toUpperCase() + level.slice(1);
  }, [initialState, expectedState]);
  const profile = useMemo(
    () => formatSystemProfile(initialState),
    [initialState]
  );

  const families = useMemo(
    () =>
      resolveStringList(
        initialState.controlFamilies ??
          initialState.control_families ??
          asRecord(initialState.systemProfile).controlFamilies,
        DEFAULT_CONMON_CONTROL_FAMILIES
      ).map((family) => family.toUpperCase()),
    [initialState]
  );

  const tools = useMemo(
    () =>
      resolveStringList(
        initialState.tools ?? expectedState.requiredTools,
        CONMON_TOOLS
      ),
    [initialState, expectedState]
  );

  const minFieldLength = resolveMinLength(
    expectedState,
    'minFieldLength',
    CONMON_STRATEGY_MIN_FIELD_LENGTH
  );
  const minEscalationLength = resolveMinLength(
    expectedState,
    'minEscalationLength',
    CONMON_STRATEGY_MIN_ESCALATION_LENGTH
  );

  const [familyRows, setFamilyRows] = useState<FamilyRow[]>(() =>
    families.map((family) => ({ family, cadence: '', rationale: '' }))
  );
  const [toolRows, setToolRows] = useState<ToolRow[]>(() =>
    tools.map((tool) => ({ tool, families: '', rationale: '' }))
  );
  const [escalationReporting, setEscalationReporting] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [scoreStatus, setScoreStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const nextErrors: FormErrors = {};

    const incompleteFamilies = familyRows.filter(
      (row) =>
        !row.cadence.trim() ||
        !row.rationale.trim() ||
        row.cadence.trim().length < minFieldLength ||
        row.rationale.trim().length < minFieldLength
    );
    if (incompleteFamilies.length > 0) {
      nextErrors.families = `Provide cadence and rationale (min ${minFieldLength} chars each) for every control family.`;
    }

    const incompleteTools = toolRows.filter(
      (row) =>
        !row.families.trim() ||
        !row.rationale.trim() ||
        row.rationale.trim().length < minFieldLength
    );
    if (incompleteTools.length > 0) {
      nextErrors.tools = `Map each tool to control families and explain coverage (min ${minFieldLength} chars).`;
    }

    const trimmedEscalation = escalationReporting.trim();
    if (!trimmedEscalation) {
      nextErrors.escalationReporting =
        'Escalation / reporting cadence is required.';
    } else if (trimmedEscalation.length < minEscalationLength) {
      nextErrors.escalationReporting = `Must be at least ${minEscalationLength} characters.`;
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;

    setSubmitError(null);
    setFeedback(null);
    setScoreStatus(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'conmon_strategy',
          familyCadences: familyRows.map((row) => ({
            family: row.family,
            cadence: row.cadence.trim(),
            rationale: row.rationale.trim(),
          })),
          toolCoverage: toolRows.map((row) => ({
            tool: row.tool,
            families: row.families
              .split(/[,;\s]+/)
              .map((entry) => entry.trim().toUpperCase())
              .filter(Boolean),
            rationale: row.rationale.trim(),
          })),
          escalationReporting: escalationReporting.trim(),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit ConMon strategy.');
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
      aria-labelledby="conmon-strategy-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="conmon-strategy-heading" className="text-lg font-semibold">
          System-level ConMon plan (ISSO)
        </h2>
        {ticketCode ? <Badge variant="secondary">{ticketCode}</Badge> : null}
        <Badge variant="outline">SP 800-137</Badge>
        {impactLevelLabel ? (
          <Badge variant="outline">FIPS 199 {impactLevelLabel}</Badge>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{profile.title}</CardTitle>
          <CardDescription>
            Plan continuous monitoring for this one system from an ISSO
            perspective—not an org-wide ISCM program. Set control-family
            cadences that fit the system&apos;s FIPS 199 impact, map
            DefectDojo / CloudSploit / Scuba coverage, and define
            escalation/reporting. Graded against retrieved NIST SP 800-137.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profile.lines.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {profile.lines.map((line) => (
                <li key={line} className="whitespace-pre-wrap">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No system profile details were provided on this ticket.
            </p>
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Monitoring cadence by control family
            </CardTitle>
            <CardDescription>
              For each family, set how often you will monitor/assess and why
              (volatility, this system&apos;s impact level, weaknesses,
              threats, reporting needs). High-impact systems need more
              frequent monitoring than moderate/low—especially for volatile
              families such as CM, SI, and RA.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {familyRows.map((row, index) => (
              <div
                key={row.family}
                className="space-y-3 border-b border-border pb-5 last:border-b-0 last:pb-0"
              >
                <p className="text-sm font-medium">{row.family} family</p>
                <div className="space-y-2">
                  <Label htmlFor={`conmon-cadence-${row.family}`}>
                    Cadence
                  </Label>
                  <Input
                    id={`conmon-cadence-${row.family}`}
                    value={row.cadence}
                    onChange={(event) => {
                      const value = event.target.value;
                      setFamilyRows((prev) =>
                        prev.map((entry, i) =>
                          i === index ? { ...entry, cadence: value } : entry
                        )
                      );
                      setFeedback(null);
                      setScoreStatus(null);
                      setSubmitError(null);
                    }}
                    placeholder="e.g. Continuous automated checks + weekly review"
                    disabled={readOnly || isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`conmon-family-rationale-${row.family}`}>
                    Rationale
                  </Label>
                  <Textarea
                    id={`conmon-family-rationale-${row.family}`}
                    value={row.rationale}
                    onChange={(event) => {
                      const value = event.target.value;
                      setFamilyRows((prev) =>
                        prev.map((entry, i) =>
                          i === index ? { ...entry, rationale: value } : entry
                        )
                      );
                      setFeedback(null);
                      setScoreStatus(null);
                      setSubmitError(null);
                    }}
                    rows={3}
                    placeholder="Tie frequency to volatility, impact level, critical functions, weaknesses, or threat/vulnerability info…"
                    disabled={readOnly || isSubmitting}
                  />
                </div>
              </div>
            ))}
            {errors.families ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.families}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Tool coverage (DefectDojo, CloudSploit, Scuba)
            </CardTitle>
            <CardDescription>
              Map each free/open-source tool to the control families it helps
              monitor, and explain what evidence it supplies.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {toolRows.map((row, index) => (
              <div
                key={row.tool}
                className="space-y-3 border-b border-border pb-5 last:border-b-0 last:pb-0"
              >
                <p className="text-sm font-medium">{row.tool}</p>
                <div className="space-y-2">
                  <Label htmlFor={`conmon-tool-families-${row.tool}`}>
                    Control families covered
                  </Label>
                  <Input
                    id={`conmon-tool-families-${row.tool}`}
                    value={row.families}
                    onChange={(event) => {
                      const value = event.target.value;
                      setToolRows((prev) =>
                        prev.map((entry, i) =>
                          i === index ? { ...entry, families: value } : entry
                        )
                      );
                      setFeedback(null);
                      setScoreStatus(null);
                      setSubmitError(null);
                    }}
                    placeholder="e.g. RA, SI, CA"
                    disabled={readOnly || isSubmitting}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`conmon-tool-rationale-${row.tool}`}>
                    Coverage rationale
                  </Label>
                  <Textarea
                    id={`conmon-tool-rationale-${row.tool}`}
                    value={row.rationale}
                    onChange={(event) => {
                      const value = event.target.value;
                      setToolRows((prev) =>
                        prev.map((entry, i) =>
                          i === index ? { ...entry, rationale: value } : entry
                        )
                      );
                      setFeedback(null);
                      setScoreStatus(null);
                      setSubmitError(null);
                    }}
                    rows={3}
                    placeholder="What status monitoring or control-effectiveness evidence does this tool provide for those families?"
                    disabled={readOnly || isSubmitting}
                  />
                </div>
              </div>
            ))}
            {errors.tools ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.tools}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Escalation / reporting cadence
            </CardTitle>
            <CardDescription>
              Define who receives ConMon reports, how often, and when findings
              escalate for risk response (AO, ISSO, system owner, etc.).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="conmon-escalation-reporting">
              Reporting and escalation
            </Label>
            <Textarea
              id="conmon-escalation-reporting"
              value={escalationReporting}
              onChange={(event) => {
                setEscalationReporting(event.target.value);
                setFeedback(null);
                setScoreStatus(null);
                setSubmitError(null);
                if (errors.escalationReporting) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.escalationReporting;
                    return next;
                  });
                }
              }}
              rows={6}
              placeholder="Weekly status to ISSO/system owner; critical findings escalate to AO within 24h; monthly posture package for ongoing authorization…"
              aria-invalid={errors.escalationReporting ? true : undefined}
              disabled={readOnly || isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Minimum {minEscalationLength} characters. Graded against retrieved
              SP 800-137 analyze/report and respond guidance.
            </p>
            {errors.escalationReporting ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.escalationReporting}
              </p>
            ) : null}
          </CardContent>
        </Card>

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
          {isSubmitting ? 'Submitting…' : 'Submit system ConMon plan'}
        </Button>
      </form>
    </section>
  );
}
