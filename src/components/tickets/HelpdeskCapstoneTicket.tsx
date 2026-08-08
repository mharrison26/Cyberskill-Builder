'use client';

import { useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  HELPDESK_PROCESS_DOC_MIN_SECTION_LENGTH,
  HELPDESK_PROCESS_DOC_MIN_TITLE_LENGTH,
  HELPDESK_PROCESS_DOC_SECTION_KEYS,
  HELPDESK_PROCESS_DOC_SECTION_LABELS,
  type HelpdeskProcessDocSectionKey,
} from '@/lib/scoring/ticketUi';
import type { Ticket } from '@/types';
import { cn } from '@/lib/utils';

type ArticleView = {
  ticketId: string;
  ticketType?: string;
  ticketCode: string | null;
  title: string;
  status: 'present' | 'missing' | 'incomplete' | string;
  summary: string;
  article: {
    problem: string;
    rootCause: string;
    resolutionSteps: string;
    preventionTip: string;
  } | null;
};

type KbResponse = {
  complete?: boolean;
  presentCount?: number;
  minArticles?: number;
  compiledAt?: string;
  articles?: ArticleView[];
  error?: string;
};

type SubmitResponse = {
  success?: boolean;
  status?: string;
  feedback?: string;
  isFlagship?: boolean;
  error?: string;
};

type HelpdeskCapstoneTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

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

function statusTone(status: string): string {
  if (status === 'present')
    return 'bg-emerald-500/15 text-emerald-800 border-emerald-500/30';
  if (status === 'incomplete')
    return 'bg-amber-500/15 text-amber-900 border-amber-500/30';
  return 'bg-muted text-muted-foreground';
}

function emptySections(): Record<HelpdeskProcessDocSectionKey, string> {
  return {
    purpose: '',
    day_one: '',
    first_week: '',
    tools_access: '',
    escalation_path: '',
    kb_usage: '',
  };
}

export function HelpdeskCapstoneTicket({
  ticket,
  readOnly = false,
  className,
}: HelpdeskCapstoneTicketProps) {
  const expectedState = asRecord(ticket.expected_state);
  const minSectionLength = resolveMinLength(
    expectedState.minSectionLength,
    HELPDESK_PROCESS_DOC_MIN_SECTION_LENGTH
  );
  const minTitleLength = resolveMinLength(
    expectedState.minTitleLength,
    HELPDESK_PROCESS_DOC_MIN_TITLE_LENGTH
  );

  const [kb, setKb] = useState<KbResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState('Help Desk New-Hire Onboarding Checklist');
  const [sections, setSections] =
    useState<Record<HelpdeskProcessDocSectionKey, string>>(emptySections);
  const [acknowledged, setAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'ok' | 'error' | null>(null);
  const [isFlagship, setIsFlagship] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/tickets/${ticket.id}/knowledge-base`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const data = (await res.json()) as KbResponse;
        if (!res.ok) {
          throw new Error(data.error || 'Failed to compile knowledge base');
        }
        if (!cancelled) {
          setKb(data);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Failed to load knowledge base'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [ticket.id]);

  const canSubmit = useMemo(() => {
    if (!kb?.complete || !acknowledged) return false;
    if (title.trim().length < minTitleLength) return false;
    return HELPDESK_PROCESS_DOC_SECTION_KEYS.every(
      (key) => sections[key].trim().length >= minSectionLength
    );
  }, [
    kb?.complete,
    acknowledged,
    title,
    sections,
    minTitleLength,
    minSectionLength,
  ]);

  async function handleSubmit() {
    if (readOnly || isSubmitting || !canSubmit) return;
    setIsSubmitting(true);
    setFeedback(null);
    setFeedbackTone(null);
    setIsFlagship(false);

    try {
      const res = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'helpdesk_capstone',
          acknowledged: true,
          processDocument: {
            title: title.trim(),
            sections,
          },
        }),
      });
      const data = (await res.json()) as SubmitResponse;
      if (!res.ok) {
        throw new Error(data.error || 'Submit failed');
      }
      setFeedback(data.feedback ?? 'Submitted.');
      setFeedbackTone(data.status === 'resolved' ? 'ok' : 'error');
      setIsFlagship(Boolean(data.isFlagship));
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Failed to submit helpdesk capstone'
      );
      setFeedbackTone('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="helpdesk-capstone-heading"
      className={cn('space-y-6', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="space-y-1">
        <h2 id="helpdesk-capstone-heading" className="text-base font-semibold">
          Helpdesk capstone — mini knowledge base + process document
        </h2>
        <p className="text-sm text-muted-foreground">
          Review your prior KB articles (HD-03 write-ups), author a new-hire
          onboarding checklist, and submit. On resolve this becomes your track
          flagship portfolio item (PI-07).
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Compiled knowledge base</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">
            Compiling prior KB articles…
          </p>
        ) : null}
        {loadError ? (
          <p className="text-sm text-destructive" role="alert">
            {loadError}
          </p>
        ) : null}
        {kb?.articles && kb.articles.length > 0 ? (
          <ul className="space-y-3">
            {kb.articles.map((article) => {
              const isOpen = expanded[article.ticketId] ?? false;
              return (
                <li
                  key={article.ticketId}
                  className="rounded-lg border border-border bg-card px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {article.ticketCode
                          ? `${article.ticketCode} — ${article.title}`
                          : article.title}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {article.summary}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn('capitalize', statusTone(article.status))}
                    >
                      {article.status}
                    </Badge>
                  </div>
                  {article.article ? (
                    <div className="mt-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpanded((prev) => ({
                            ...prev,
                            [article.ticketId]: !isOpen,
                          }))
                        }
                      >
                        {isOpen ? 'Hide article' : 'Show article'}
                      </Button>
                      {isOpen ? (
                        <dl className="mt-2 space-y-3 rounded-md bg-muted/50 p-3 text-sm">
                          {(
                            [
                              ['Problem', article.article.problem],
                              ['Root cause', article.article.rootCause],
                              [
                                'Resolution steps',
                                article.article.resolutionSteps,
                              ],
                              ['Prevention tip', article.article.preventionTip],
                            ] as const
                          ).map(([label, body]) => (
                            <div key={label}>
                              <dt className="font-medium">{label}</dt>
                              <dd className="mt-1 whitespace-pre-wrap text-muted-foreground">
                                {body}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : !loading && !loadError ? (
          <p className="text-sm text-muted-foreground">
            No KB write-up tickets found on this track yet. Complete HD-03
            (kb_writeup) first.
          </p>
        ) : null}
        {kb ? (
          <p className="text-sm text-muted-foreground">
            {kb.complete
              ? `Ready — ${kb.presentCount ?? 0} resolved article(s) (need ${kb.minArticles ?? 1}).`
              : `Incomplete — ${kb.presentCount ?? 0} of ${kb.minArticles ?? 1} required resolved article(s).`}
            {kb.compiledAt
              ? ` Compiled ${new Date(kb.compiledAt).toLocaleString()}.`
              : null}
          </p>
        ) : null}
      </div>

      <div className="space-y-4 border-t border-border pt-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            Process document — new-hire onboarding checklist
          </h3>
          <p className="text-sm text-muted-foreground">
            Write a practical checklist a Tier-1 hire can follow. Each section
            needs at least {minSectionLength} characters.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="process-doc-title">Document title</Label>
          <input
            id="process-doc-title"
            type="text"
            value={title}
            disabled={readOnly}
            onChange={(event) => setTitle(event.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>

        {HELPDESK_PROCESS_DOC_SECTION_KEYS.map((key) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={`process-section-${key}`}>
              {HELPDESK_PROCESS_DOC_SECTION_LABELS[key]}
            </Label>
            <Textarea
              id={`process-section-${key}`}
              value={sections[key]}
              disabled={readOnly}
              rows={4}
              onChange={(event) =>
                setSections((prev) => ({
                  ...prev,
                  [key]: event.target.value,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              {sections[key].trim().length} / {minSectionLength} min
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={readOnly || !kb?.complete}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          I have reviewed my compiled mini knowledge base
        </label>
        <Button
          type="button"
          disabled={readOnly || !canSubmit || isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Submitting…' : 'Submit helpdesk capstone'}
        </Button>
      </div>

      {feedback ? (
        <p
          className={cn(
            'text-sm whitespace-pre-wrap',
            feedbackTone === 'ok' ? 'text-emerald-800' : 'text-destructive'
          )}
          role="status"
        >
          {feedback}
          {isFlagship ? ' Flagship portfolio item set.' : null}
        </p>
      ) : null}
    </section>
  );
}
