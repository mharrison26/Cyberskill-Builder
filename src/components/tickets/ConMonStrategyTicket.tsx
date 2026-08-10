'use client';

import { useEffect, useMemo, useState } from 'react';

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
  buildConmonSystemProfileGapsMessage,
  seedSystemProfileFromInitialState,
  usesStudentConmonSystemProfile,
  type ConmonSystemProfile,
  type ConmonSystemProfileGap,
} from '@/lib/grc/compileConmonSystemProfile';
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

type SystemProfileResponse = {
  error?: string;
  systemProfile?: ConmonSystemProfile | null;
  systemProfileSource?: 'student_grc03' | 'seed' | 'empty';
  complete?: boolean;
  gaps?: ConmonSystemProfileGap[];
  gapsMessage?: string | null;
  continuityLabel?: string | null;
  useStudentSystemProfile?: boolean;
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

function formatLoadedProfile(
  profile: ConmonSystemProfile | null,
  fallbackTitle = 'System profile'
): { title: string; lines: string[] } {
  if (!profile) {
    return { title: fallbackTitle, lines: [] };
  }

  const lines: string[] = [];
  if (profile.description?.trim()) {
    lines.push(profile.description.trim());
  }
  if (profile.authorizationBoundary?.trim()) {
    lines.push(`Authorization boundary: ${profile.authorizationBoundary.trim()}`);
  }
  if (profile.impact?.trim()) {
    lines.push(`Impact: ${profile.impact.trim()}`);
  } else if (profile.impactLevel?.trim()) {
    lines.push(`Impact: ${profile.impactLevel.trim()}`);
  }
  if (profile.environment?.trim()) {
    lines.push(`Environment: ${profile.environment.trim()}`);
  }
  if (profile.controlFamilies && profile.controlFamilies.length > 0) {
    lines.push(`Control families: ${profile.controlFamilies.join(', ')}`);
  }
  if (profile.components && profile.components.length > 0) {
    lines.push(`SSP controls: ${profile.components.join('; ')}`);
  }
  if (profile.constraints?.trim()) {
    lines.push(profile.constraints.trim());
  }

  return {
    title: profile.name?.trim() || fallbackTitle,
    lines,
  };
}

export function ConMonStrategyTicket({
  ticket,
  readOnly = false,
  className,
}: ConMonStrategyTicketProps) {
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const usesStudentProfile = usesStudentConmonSystemProfile(initialState);
  const seedProfile = useMemo(
    () => seedSystemProfileFromInitialState(initialState),
    [initialState]
  );

  const ticketCode =
    typeof initialState.ticketCode === 'string' &&
    initialState.ticketCode.trim()
      ? initialState.ticketCode.trim()
      : typeof initialState.ticket_code === 'string' &&
          initialState.ticket_code.trim()
        ? initialState.ticket_code.trim()
        : null;

  const [loadedProfile, setLoadedProfile] = useState<ConmonSystemProfile | null>(
    () => (usesStudentProfile ? null : seedProfile)
  );
  const [profileSource, setProfileSource] = useState<
    'student_grc03' | 'seed' | 'empty' | null
  >(usesStudentProfile ? null : seedProfile ? 'seed' : 'empty');
  const [continuityLabel, setContinuityLabel] = useState<string | null>(null);
  const [gaps, setGaps] = useState<ConmonSystemProfileGap[]>([]);
  const [gapsMessage, setGapsMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(usesStudentProfile);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!usesStudentProfile) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/tickets/${ticket.id}/system-profile`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const data = (await res.json()) as SystemProfileResponse;
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load GRC-03 system profile');
        }
        if (cancelled) return;

        setLoadedProfile(data.systemProfile ?? null);
        setProfileSource(data.systemProfileSource ?? 'empty');
        setContinuityLabel(
          typeof data.continuityLabel === 'string' ? data.continuityLabel : null
        );
        setGaps(Array.isArray(data.gaps) ? data.gaps : []);
        setGapsMessage(
          typeof data.gapsMessage === 'string'
            ? data.gapsMessage
            : !data.complete
              ? buildConmonSystemProfileGapsMessage(data.gaps ?? [])
              : null
        );
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Failed to load GRC-03 system profile'
          );
          setLoadedProfile(null);
          setProfileSource('empty');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [ticket.id, usesStudentProfile]);

  const activeProfile = loadedProfile;
  const impactLevelLabel = useMemo(() => {
    const raw =
      (activeProfile?.impactLevel && activeProfile.impactLevel) ||
      (activeProfile?.impact && activeProfile.impact) ||
      (typeof initialState.impactLevel === 'string' &&
        initialState.impactLevel) ||
      (typeof expectedState.impactLevel === 'string' &&
        expectedState.impactLevel) ||
      null;
    if (!raw) return null;
    const match = String(raw).match(/\b(low|moderate|medium|high)\b/i);
    if (!match) return String(raw).trim();
    const level = match[1].toLowerCase();
    if (level === 'medium') return 'Moderate';
    return level.charAt(0).toUpperCase() + level.slice(1);
  }, [activeProfile, initialState, expectedState]);

  const profile = useMemo(
    () => formatLoadedProfile(activeProfile),
    [activeProfile]
  );

  const families = useMemo(
    () =>
      resolveStringList(
        activeProfile?.controlFamilies ??
          initialState.controlFamilies ??
          initialState.control_families,
        DEFAULT_CONMON_CONTROL_FAMILIES
      ).map((family) => family.toUpperCase()),
    [activeProfile, initialState]
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

  useEffect(() => {
    setFamilyRows((prev) => {
      const byFamily = new Map(prev.map((row) => [row.family, row]));
      return families.map(
        (family) => byFamily.get(family) ?? { family, cadence: '', rationale: '' }
      );
    });
  }, [families]);

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

  if (loading) {
    return (
      <section
        aria-labelledby="conmon-strategy-heading"
        className={cn(
          'rounded-lg border border-dashed border-border bg-muted/30 px-5 py-8',
          className
        )}
        data-ticket-type={ticket.ticket_type}
        data-ticket-id={ticket.id}
      >
        <h2 id="conmon-strategy-heading" className="text-lg font-semibold">
          System-level ConMon plan
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Loading your GRC-03 SSP system description…
        </p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section
        aria-labelledby="conmon-strategy-heading"
        className={cn(
          'rounded-lg border border-destructive/40 bg-destructive/5 px-5 py-8',
          className
        )}
        data-ticket-type={ticket.ticket_type}
        data-ticket-id={ticket.id}
      >
        <h2 id="conmon-strategy-heading" className="text-lg font-semibold">
          System-level ConMon plan
        </h2>
        <p className="mt-2 text-sm text-destructive" role="alert">
          {loadError}
        </p>
      </section>
    );
  }

  if (
    !activeProfile ||
    (usesStudentProfile && (gaps.length > 0 || profileSource === 'empty'))
  ) {
    return (
      <section
        aria-labelledby="conmon-strategy-heading"
        className={cn(
          'rounded-lg border border-dashed border-border bg-muted/30 px-5 py-8',
          className
        )}
        data-ticket-type={ticket.ticket_type}
        data-ticket-id={ticket.id}
        data-profile-source={profileSource ?? 'empty'}
      >
        <h2 id="conmon-strategy-heading" className="text-base font-semibold">
          Prerequisites required
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          {usesStudentProfile
            ? gapsMessage ||
              'This ConMon ticket continues your GRC-03 system description. Complete and submit the OSCAL SSP fragment first — a fresh HarborNet scenario is not used.'
            : 'This ticket has no system profile in initial_state.systemProfile. An admin should seed a system profile before students can draft a ConMon plan.'}
        </p>
        {usesStudentProfile && gaps.length > 0 ? (
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-foreground">
            {gaps.map((gap) => (
              <li key={gap.key}>{gap.message}</li>
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="conmon-strategy-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
      data-profile-source={profileSource ?? undefined}
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
        {profileSource === 'student_grc03' ? (
          <Badge variant="outline">From your GRC-03</Badge>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{profile.title}</CardTitle>
          <CardDescription>
            {profileSource === 'student_grc03'
              ? continuityLabel ||
                'This ConMon plan continues the system description from your GRC-03 OSCAL SSP — not a new scenario.'
              : 'Plan continuous monitoring for this one system from an ISSO perspective—not an org-wide ISCM program.'}{' '}
            Set control-family cadences that fit the system&apos;s FIPS 199
            impact, map DefectDojo / CloudSploit / Scuba coverage, and define
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
              (volatility, this system&apos;s impact level, weaknesses, threats,
              reporting needs). High-impact systems need more frequent
              monitoring than moderate/low—especially for volatile families such
              as CM, SI, and RA.
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
