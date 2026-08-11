'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  asSubmissionRecord,
  restoredString,
  useTicketWorkbenchForm,
} from '@/hooks/useTicketWorkbenchForm';
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
  P1_STATUS_UPDATES_DEFAULT_ADVANCE_STEPS,
  P1_STATUS_UPDATES_DEFAULT_TOLERANCE_MINUTES,
  P1_STATUS_UPDATES_MIN_FIELD_LENGTH,
  formatSimClock,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type P1StatusUpdatesTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

type DraftErrors = Partial<
  Record<'impact' | 'eta' | 'nextUpdateAtSimMinutes', string>
>;

type PostedUpdate = {
  id: string;
  postedAtSimMinutes: number;
  impact: string;
  eta: string;
  nextUpdateAtSimMinutes: number;
};

type ChannelMessage = {
  id: string;
  author: string;
  role?: string;
  body: string;
  postedAtSimMinutes: number;
  kind: 'stakeholder' | 'student';
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

function readNonNegInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return fallback;
}

function parseAdvanceSteps(clock: Record<string, unknown>): number[] {
  const raw =
    clock.advanceStepsMinutes ??
    clock.advance_steps_minutes ??
    clock.advanceOptionsMinutes;
  if (Array.isArray(raw)) {
    const steps = raw
      .filter((item): item is number => typeof item === 'number')
      .map((item) => Math.floor(item))
      .filter((item) => item > 0);
    if (steps.length > 0)
      return Array.from(new Set(steps)).sort((a, b) => a - b);
  }
  return [...P1_STATUS_UPDATES_DEFAULT_ADVANCE_STEPS];
}

function resolveRequiredTimesForUi(
  expectedState: Record<string, unknown>,
  initialState: Record<string, unknown>
): {
  requiredTimes: number[];
  toleranceMinutes: number;
  minFieldLength: number;
} {
  const minFieldLength =
    typeof expectedState.minFieldLength === 'number' &&
    Number.isFinite(expectedState.minFieldLength) &&
    expectedState.minFieldLength > 0
      ? Math.floor(expectedState.minFieldLength)
      : P1_STATUS_UPDATES_MIN_FIELD_LENGTH;

  const toleranceMinutes =
    typeof expectedState.cadenceToleranceMinutes === 'number' &&
    Number.isFinite(expectedState.cadenceToleranceMinutes) &&
    expectedState.cadenceToleranceMinutes >= 0
      ? Math.floor(expectedState.cadenceToleranceMinutes)
      : P1_STATUS_UPDATES_DEFAULT_TOLERANCE_MINUTES;

  const rawTimes =
    expectedState.requiredUpdateTimes ?? expectedState.required_update_times;
  if (Array.isArray(rawTimes)) {
    const times = rawTimes
      .filter((item): item is number => typeof item === 'number')
      .map((item) => Math.floor(item))
      .filter((item) => item >= 0);
    if (times.length > 0) {
      return {
        requiredTimes: Array.from(new Set(times)).sort((a, b) => a - b),
        toleranceMinutes,
        minFieldLength,
      };
    }
  }

  const cadence =
    typeof expectedState.requiredCadenceMinutes === 'number' &&
    expectedState.requiredCadenceMinutes > 0
      ? Math.floor(expectedState.requiredCadenceMinutes)
      : typeof expectedState.cadenceMinutes === 'number' &&
          expectedState.cadenceMinutes > 0
        ? Math.floor(expectedState.cadenceMinutes)
        : null;

  const clock = asRecord(initialState.clock);
  const windowMinutes =
    typeof expectedState.incidentWindowMinutes === 'number' &&
    expectedState.incidentWindowMinutes > 0
      ? Math.floor(expectedState.incidentWindowMinutes)
      : typeof clock.maxSimMinutes === 'number' && clock.maxSimMinutes > 0
        ? Math.floor(clock.maxSimMinutes)
        : 90;

  if (!cadence) {
    return { requiredTimes: [], toleranceMinutes, minFieldLength };
  }

  const requiredTimes: number[] = [];
  for (let t = 0; t < windowMinutes; t += cadence) {
    requiredTimes.push(t);
  }
  return { requiredTimes, toleranceMinutes, minFieldLength };
}

function parseStakeholderSeed(
  channel: Record<string, unknown>
): ChannelMessage[] {
  const raw = channel.stakeholders ?? channel.seedMessages ?? channel.messages;
  if (!Array.isArray(raw)) return [];

  const messages: ChannelMessage[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const entry = raw[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const body = readString(record, ['body', 'text', 'message']);
    if (!body) continue;
    messages.push({
      id: `stakeholder-${index}`,
      author: readString(record, ['author', 'name', 'from'], 'Stakeholder'),
      role: readString(record, ['role', 'title']) || undefined,
      body,
      postedAtSimMinutes: readNonNegInt(
        record.postedAtSimMinutes ?? record.posted_at_sim_minutes,
        0
      ),
      kind: 'stakeholder',
    });
  }
  return messages;
}

function restoredPostedUpdates(raw: unknown): PostedUpdate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        !!item && typeof item === 'object'
    )
    .map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `restored-${index}`,
      postedAtSimMinutes:
        typeof item.postedAtSimMinutes === 'number'
          ? item.postedAtSimMinutes
          : 0,
      impact: typeof item.impact === 'string' ? item.impact : '',
      eta: typeof item.eta === 'string' ? item.eta : '',
      nextUpdateAtSimMinutes:
        typeof item.nextUpdateAtSimMinutes === 'number'
          ? item.nextUpdateAtSimMinutes
          : 0,
    }))
    .filter((item) => item.impact.trim() && item.eta.trim());
}

export function P1StatusUpdatesTicket({
  ticket,
  readOnly = false,
  className,
}: P1StatusUpdatesTicketProps) {
  const {
    submission,
    formReadOnly,
    hideSubmit,
    lastFeedback,
    lastScoreStatus,
  } = useTicketWorkbenchForm(readOnly);
  const restored = asSubmissionRecord(submission);
  const initialState = asRecord(ticket.initial_state);
  const expectedState = asRecord(ticket.expected_state);
  const outage = asRecord(initialState.outage ?? initialState.incident);
  const channel = asRecord(initialState.channel);
  const clock = asRecord(initialState.clock);

  const { requiredTimes, toleranceMinutes, minFieldLength } = useMemo(
    () => resolveRequiredTimesForUi(expectedState, initialState),
    [expectedState, initialState]
  );
  const advanceSteps = useMemo(() => parseAdvanceSteps(clock), [clock]);
  const startSimMinutes = readNonNegInt(
    clock.startSimMinutes ?? clock.start_sim_minutes,
    0
  );
  const maxSimMinutes = readNonNegInt(
    clock.maxSimMinutes ?? clock.max_sim_minutes ?? clock.endSimMinutes,
    typeof expectedState.incidentWindowMinutes === 'number'
      ? expectedState.incidentWindowMinutes
      : 90
  );

  const outageTitle = readString(
    outage,
    ['title', 'name'],
    readString(initialState, ['title'], 'P1 service outage')
  );
  const service = readString(outage, ['service', 'system'], 'Critical service');
  const summary = readString(
    outage,
    ['summary', 'description', 'brief'],
    'See scenario brief.'
  );
  const impactFacts = readString(
    outage,
    ['impactFacts', 'impact_facts', 'knownImpact'],
    ''
  );
  const severity = readString(outage, ['severity', 'priority'], 'P1');
  const channelName = readString(
    channel,
    ['name', 'channelName'],
    '#incident-comms'
  );
  const seedMessages = useMemo(() => parseStakeholderSeed(channel), [channel]);

  const [simMinutes, setSimMinutes] = useState(startSimMinutes);
  const [updates, setUpdates] = useState<PostedUpdate[]>(() =>
    restoredPostedUpdates(restored.updates)
  );
  const [impact, setImpact] = useState(() =>
    restoredString(submission, 'impact')
  );
  const [eta, setEta] = useState(() => restoredString(submission, 'eta'));
  const [nextUpdateAtSimMinutes, setNextUpdateAtSimMinutes] = useState('');
  const [draftErrors, setDraftErrors] = useState<DraftErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(() => lastFeedback);
  const [scoreStatus, setScoreStatus] = useState<string | null>(
    () => lastScoreStatus
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const channelMessages = useMemo((): ChannelMessage[] => {
    const studentMessages: ChannelMessage[] = updates.map((update) => ({
      id: update.id,
      author: 'You (Incident Comms)',
      role: 'Responder',
      body: [
        `Impact: ${update.impact}`,
        `ETA: ${update.eta}`,
        `Next update: ${formatSimClock(update.nextUpdateAtSimMinutes)}`,
      ].join('\n'),
      postedAtSimMinutes: update.postedAtSimMinutes,
      kind: 'student',
    }));
    return [...seedMessages, ...studentMessages].sort(
      (a, b) => a.postedAtSimMinutes - b.postedAtSimMinutes
    );
  }, [seedMessages, updates]);

  const postedSlots = useMemo(() => {
    return requiredTimes.map((requiredTime) => {
      const hit = updates.some(
        (update) =>
          Math.abs(update.postedAtSimMinutes - requiredTime) <= toleranceMinutes
      );
      return { requiredTime, hit };
    });
  }, [requiredTimes, updates, toleranceMinutes]);

  function clearOutcome() {
    setFeedback(null);
    setScoreStatus(null);
    setSubmitError(null);
  }

  function advanceClock(byMinutes: number) {
    if (formReadOnly || hideSubmit) return;
    clearOutcome();
    setSimMinutes((prev) => Math.min(maxSimMinutes, prev + byMinutes));
  }

  function validateDraft(): boolean {
    const nextErrors: DraftErrors = {};
    if (!impact.trim()) {
      nextErrors.impact = 'Impact is required.';
    } else if (impact.trim().length < minFieldLength) {
      nextErrors.impact = `Impact must be at least ${minFieldLength} characters.`;
    }

    if (!eta.trim()) {
      nextErrors.eta = 'ETA is required.';
    } else if (eta.trim().length < minFieldLength) {
      nextErrors.eta = `ETA must be at least ${minFieldLength} characters.`;
    }

    const nextAt = Number(nextUpdateAtSimMinutes);
    if (
      nextUpdateAtSimMinutes.trim() === '' ||
      !Number.isFinite(nextAt) ||
      nextAt < 0
    ) {
      nextErrors.nextUpdateAtSimMinutes =
        'Enter next-update time as simulated minutes from T+0 (e.g. 30).';
    } else if (nextAt <= simMinutes) {
      nextErrors.nextUpdateAtSimMinutes =
        'Next-update time must be after the current simulated clock.';
    }

    setDraftErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handlePostUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (formReadOnly || hideSubmit) return;
    clearOutcome();
    if (!validateDraft()) return;

    const nextAt = Math.floor(Number(nextUpdateAtSimMinutes));
    const alreadyPostedHere = updates.some(
      (update) => update.postedAtSimMinutes === simMinutes
    );
    if (alreadyPostedHere) {
      setDraftErrors({
        impact: `You already posted an update at ${formatSimClock(simMinutes)}. Advance the simulated clock first.`,
      });
      return;
    }

    setUpdates((prev) => [
      ...prev,
      {
        id: `update-${prev.length + 1}-${simMinutes}`,
        postedAtSimMinutes: simMinutes,
        impact: impact.trim(),
        eta: eta.trim(),
        nextUpdateAtSimMinutes: nextAt,
      },
    ]);
    setImpact('');
    setEta('');
    setNextUpdateAtSimMinutes('');
    setDraftErrors({});
  }

  async function handleSubmitForScoring() {
    if (formReadOnly || hideSubmit) return;
    clearOutcome();

    if (updates.length === 0) {
      setSubmitError(
        'Post at least one status update to the channel before submitting.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'p1_status_updates',
          updates: updates.map((update) => ({
            postedAtSimMinutes: update.postedAtSimMinutes,
            impact: update.impact,
            eta: update.eta,
            nextUpdateAtSimMinutes: update.nextUpdateAtSimMinutes,
          })),
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        feedback?: string;
        status?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to submit status updates.');
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
      aria-labelledby="p1-status-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="p1-status-heading" className="text-lg font-semibold">
          P1 outage status updates
        </h2>
        <Badge variant="destructive">{severity}</Badge>
        <Badge variant="outline">Simulated clock</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{outageTitle}</CardTitle>
          <CardDescription>
            Post status updates to the stakeholder channel on the required
            cadence. Time advances only when you use the simulated clock
            controls — not wall-clock time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <span className="font-medium text-foreground">Service: </span>
            <span className="text-muted-foreground">{service}</span>
          </p>
          <p className="whitespace-pre-wrap text-muted-foreground">{summary}</p>
          {impactFacts ? (
            <div>
              <p className="font-medium text-foreground">Known impact facts</p>
              <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                {impactFacts}
              </p>
            </div>
          ) : null}
          {requiredTimes.length > 0 ? (
            <div>
              <p className="font-medium text-foreground">Required cadence</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {postedSlots.map(({ requiredTime, hit }) => (
                  <li key={requiredTime}>
                    <Badge variant={hit ? 'default' : 'outline'}>
                      {formatSimClock(requiredTime)}
                      {hit ? ' ✓' : ''}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Each update must cover impact, ETA, and next-update time.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Simulated clock</CardTitle>
            <CardDescription>
              Current incident time. Advance between posts to hit the cadence
              slots.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p
              className="font-mono text-3xl font-semibold tracking-tight"
              aria-live="polite"
            >
              {formatSimClock(simMinutes)}
            </p>
            <p className="text-xs text-muted-foreground">
              Window: {formatSimClock(startSimMinutes)} –{' '}
              {formatSimClock(maxSimMinutes)}
            </p>
            <div className="flex flex-wrap gap-2">
              {advanceSteps.map((step) => (
                <Button
                  key={step}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={formReadOnly || simMinutes >= maxSimMinutes}
                  onClick={() => advanceClock(step)}
                >
                  +{step}m
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={formReadOnly || simMinutes === startSimMinutes}
                onClick={() => {
                  if (formReadOnly || hideSubmit) return;
                  clearOutcome();
                  setSimMinutes(startSimMinutes);
                }}
              >
                Reset clock
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Channel {channelName}</CardTitle>
            <CardDescription>
              Mock stakeholder channel. Your posts appear with the simulated
              timestamp.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul
              className="max-h-80 space-y-3 overflow-y-auto rounded-md border border-border bg-muted/20 p-3"
              aria-label={`Messages in ${channelName}`}
            >
              {channelMessages.length === 0 ? (
                <li className="text-sm text-muted-foreground">
                  No messages yet. Post your first status update.
                </li>
              ) : (
                channelMessages.map((message) => (
                  <li
                    key={message.id}
                    className={cn(
                      'rounded-md border px-3 py-2 text-sm',
                      message.kind === 'student'
                        ? 'border-primary/40 bg-background'
                        : 'border-border bg-background/60'
                    )}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium text-foreground">
                        {message.author}
                        {message.role ? (
                          <span className="ml-1 font-normal text-muted-foreground">
                            · {message.role}
                          </span>
                        ) : null}
                      </p>
                      <span className="font-mono text-xs text-muted-foreground">
                        {formatSimClock(message.postedAtSimMinutes)}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                      {message.body}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compose status update</CardTitle>
          <CardDescription>
            Posts at the current simulated clock ({formatSimClock(simMinutes)}).
            Include impact, ETA, and when stakeholders should expect the next
            update.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePostUpdate} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="p1-impact">Impact</Label>
              <Textarea
                id="p1-impact"
                value={impact}
                disabled={formReadOnly || isSubmitting}
                aria-invalid={draftErrors.impact ? true : undefined}
                placeholder="Who/what is affected and how (use the known impact facts)…"
                rows={3}
                onChange={(event) => {
                  setImpact(event.target.value);
                  clearOutcome();
                }}
              />
              {draftErrors.impact ? (
                <p role="alert" className="text-sm text-destructive">
                  {draftErrors.impact}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="p1-eta">ETA</Label>
              <Textarea
                id="p1-eta"
                value={eta}
                disabled={formReadOnly || isSubmitting}
                aria-invalid={draftErrors.eta ? true : undefined}
                placeholder="Current best estimate for mitigation or restoration…"
                rows={2}
                onChange={(event) => {
                  setEta(event.target.value);
                  clearOutcome();
                }}
              />
              {draftErrors.eta ? (
                <p role="alert" className="text-sm text-destructive">
                  {draftErrors.eta}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="p1-next-update">
                Next update time (sim minutes from T+0)
              </Label>
              <Input
                id="p1-next-update"
                type="number"
                min={simMinutes + 1}
                step={1}
                value={nextUpdateAtSimMinutes}
                disabled={formReadOnly || isSubmitting}
                aria-invalid={
                  draftErrors.nextUpdateAtSimMinutes ? true : undefined
                }
                placeholder={
                  requiredTimes.find((t) => t > simMinutes)?.toString() ??
                  String(simMinutes + 30)
                }
                onChange={(event) => {
                  setNextUpdateAtSimMinutes(event.target.value);
                  clearOutcome();
                }}
              />
              <p className="text-xs text-muted-foreground">
                Example: enter <code>30</code> for {formatSimClock(30)}. This
                must match the next required cadence slot when scoring promises.
              </p>
              {draftErrors.nextUpdateAtSimMinutes ? (
                <p role="alert" className="text-sm text-destructive">
                  {draftErrors.nextUpdateAtSimMinutes}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={formReadOnly || isSubmitting}>
                Post to {channelName} at {formatSimClock(simMinutes)}
              </Button>
              {!hideSubmit ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    formReadOnly || isSubmitting || updates.length === 0
                  }
                  onClick={() => void handleSubmitForScoring()}
                >
                  {isSubmitting ? 'Submitting…' : 'Submit for scoring'}
                </Button>
              ) : null}
            </div>
          </form>

          {submitError ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {submitError}
            </p>
          ) : null}
          {feedback ? (
            <div
              className={cn(
                'mt-4 rounded-md border px-3 py-2 text-sm',
                scoreStatus === 'resolved'
                  ? 'border-status-satisfied-foreground/20 bg-status-satisfied'
                  : 'border-status-insufficient-foreground/20 bg-status-insufficient'
              )}
              role="status"
            >
              <p className="font-medium">
                {scoreStatus === 'resolved' ? 'Resolved' : 'Needs revision'}
              </p>
              <p className="mt-1 text-muted-foreground">{feedback}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
