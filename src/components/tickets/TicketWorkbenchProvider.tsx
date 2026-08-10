'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

import {
  canStartNewAttempt,
  resolveMaxAttempts,
  type TicketAttemptRecord,
} from '@/lib/tickets/attempts';
import { isClosedTicketStatus } from '@/lib/tickets/status';
import {
  isTicketSubmitUrl,
  optimisticProgressOnSubmitStart,
  progressFromSubmitPayload,
  type WorkbenchProgressSnapshot,
} from '@/lib/tickets/syncWorkbenchProgress';
import type { TicketProgressStatus } from '@/types';

export type TicketWorkbenchInitial = {
  ticketId: string;
  trackSlug: string;
  status: TicketProgressStatus;
  startedAt: string | null;
  resolvedAt: string | null;
  slaDueAt: string | null;
  slaMet: boolean | null;
  submission: Record<string, unknown> | null;
  lastScoreStatus: 'resolved' | 'needs_revision' | null;
  lastFeedback: string | null;
  lastStructuredResult: Record<string, unknown> | null;
  attemptCount: number;
  maxAttempts: number | null | undefined;
  attempts: TicketAttemptRecord[];
  readOnlyPreview?: boolean;
};

type TicketWorkbenchContextValue = {
  ticketId: string;
  trackSlug: string;
  status: TicketProgressStatus;
  startedAt: string | null;
  resolvedAt: string | null;
  slaDueAt: string | null;
  slaMet: boolean | null;
  submission: Record<string, unknown> | null;
  lastScoreStatus: 'resolved' | 'needs_revision' | null;
  lastFeedback: string | null;
  lastStructuredResult: Record<string, unknown> | null;
  attemptCount: number;
  maxAttempts: number;
  attempts: TicketAttemptRecord[];
  /** Form is editable only while in_progress (and not admin preview). */
  answersEditable: boolean;
  /** Answers should render read-only (resolved/reviewed or preview). */
  answersReadOnly: boolean;
  /** Must open ticket before working. */
  requiresOpen: boolean;
  canRetry: boolean;
  retryKey: number;
  readOnlyPreview: boolean;
  setProgress: (next: Partial<WorkbenchProgressSnapshot>) => void;
  applySubmitSuccess: (payload: Record<string, unknown>) => void;
  beginRetryLocally: () => void;
  refresh: () => void;
};

const TicketWorkbenchContext =
  createContext<TicketWorkbenchContextValue | null>(null);

export function useTicketWorkbench(): TicketWorkbenchContextValue {
  const ctx = useContext(TicketWorkbenchContext);
  if (!ctx) {
    throw new Error(
      'useTicketWorkbench must be used within TicketWorkbenchProvider'
    );
  }
  return ctx;
}

export function useOptionalTicketWorkbench(): TicketWorkbenchContextValue | null {
  return useContext(TicketWorkbenchContext);
}

export function TicketWorkbenchProvider({
  initial,
  children,
}: {
  initial: TicketWorkbenchInitial;
  children: ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [retryKey, setRetryKey] = useState(0);
  const [status, setStatus] = useState(initial.status);
  const [startedAt, setStartedAt] = useState(initial.startedAt);
  const [resolvedAt, setResolvedAt] = useState(initial.resolvedAt);
  const [slaDueAt, setSlaDueAt] = useState(initial.slaDueAt);
  const [slaMet, setSlaMet] = useState(initial.slaMet);
  const [submission, setSubmission] = useState(initial.submission);
  const [lastScoreStatus, setLastScoreStatus] = useState(
    initial.lastScoreStatus
  );
  const [lastFeedback, setLastFeedback] = useState(initial.lastFeedback);
  const [lastStructuredResult, setLastStructuredResult] = useState(
    initial.lastStructuredResult
  );
  const [attemptCount, setAttemptCount] = useState(initial.attemptCount);
  const [attempts, setAttempts] = useState(initial.attempts);

  const snapshotRef = useRef<WorkbenchProgressSnapshot>({
    status,
    startedAt,
    resolvedAt,
    slaDueAt,
    slaMet,
  });
  snapshotRef.current = {
    status,
    startedAt,
    resolvedAt,
    slaDueAt,
    slaMet,
  };

  // Reconcile after router.refresh() brings new server props.
  useEffect(() => {
    setStatus(initial.status);
    setStartedAt(initial.startedAt);
    setResolvedAt(initial.resolvedAt);
    setSlaDueAt(initial.slaDueAt);
    setSlaMet(initial.slaMet);
    setSubmission(initial.submission);
    setLastScoreStatus(initial.lastScoreStatus);
    setLastFeedback(initial.lastFeedback);
    setLastStructuredResult(initial.lastStructuredResult);
    setAttemptCount(initial.attemptCount);
    setAttempts(initial.attempts);
  }, [initial]);

  const maxAttempts = resolveMaxAttempts(initial.maxAttempts);
  const readOnlyPreview = Boolean(initial.readOnlyPreview);
  const answersEditable =
    !readOnlyPreview && status === 'in_progress' && !resolvedAt;
  const answersReadOnly =
    readOnlyPreview || isClosedTicketStatus(status) || status === 'new';
  const requiresOpen = !readOnlyPreview && status === 'new';
  const canRetry =
    !readOnlyPreview &&
    canStartNewAttempt({ attemptCount, maxAttempts }) &&
    (isClosedTicketStatus(status) || lastScoreStatus === 'needs_revision');

  const setProgress = useCallback(
    (next: Partial<WorkbenchProgressSnapshot>) => {
      if (next.status !== undefined) setStatus(next.status);
      if (next.startedAt !== undefined) setStartedAt(next.startedAt);
      if (next.resolvedAt !== undefined) setResolvedAt(next.resolvedAt);
      if (next.slaDueAt !== undefined) setSlaDueAt(next.slaDueAt);
      if (next.slaMet !== undefined) setSlaMet(next.slaMet);
    },
    []
  );

  const applySubmitSuccess = useCallback(
    (payload: Record<string, unknown>) => {
      const next = progressFromSubmitPayload(payload, snapshotRef.current);
      setProgress(next);

      if (
        payload.submission &&
        typeof payload.submission === 'object' &&
        !Array.isArray(payload.submission)
      ) {
        setSubmission(payload.submission as Record<string, unknown>);
      }
      if (
        payload.lastScoreStatus === 'resolved' ||
        payload.lastScoreStatus === 'needs_revision' ||
        payload.status === 'resolved' ||
        payload.status === 'needs_revision'
      ) {
        const score =
          payload.lastScoreStatus === 'resolved' ||
          payload.lastScoreStatus === 'needs_revision'
            ? payload.lastScoreStatus
            : payload.status;
        if (score === 'resolved' || score === 'needs_revision') {
          setLastScoreStatus(score);
        }
      }
      if (typeof payload.feedback === 'string') {
        setLastFeedback(payload.feedback);
      }
      if (
        payload.structuredResult &&
        typeof payload.structuredResult === 'object' &&
        !Array.isArray(payload.structuredResult)
      ) {
        setLastStructuredResult(
          payload.structuredResult as Record<string, unknown>
        );
      }
      if (typeof payload.attemptCount === 'number') {
        setAttemptCount(payload.attemptCount);
      }
      if (Array.isArray(payload.attempts)) {
        setAttempts(payload.attempts as TicketAttemptRecord[]);
      }
    },
    [setProgress]
  );

  const beginRetryLocally = useCallback(() => {
    const now = new Date().toISOString();
    setStatus('in_progress');
    setStartedAt(now);
    setResolvedAt(null);
    setSlaDueAt(null);
    setSlaMet(null);
    setSubmission(null);
    setLastScoreStatus(null);
    setLastFeedback(null);
    setLastStructuredResult(null);
    setRetryKey((k) => k + 1);
  }, []);

  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  // Intercept workbench submit fetches so header/SLA update with the result panel.
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = (
        init?.method ??
        (typeof input === 'object' && 'method' in input
          ? input.method
          : 'GET') ??
        'GET'
      ).toUpperCase();

      const isSubmit =
        method === 'POST' && isTicketSubmitUrl(url, initial.ticketId);

      let rollback: WorkbenchProgressSnapshot | null = null;
      if (isSubmit) {
        rollback = { ...snapshotRef.current };
        const optimistic = optimisticProgressOnSubmitStart(rollback);
        setProgress(optimistic);
      }

      const response = await originalFetch(input, init);

      if (isSubmit) {
        if (response.ok) {
          try {
            const payload = (await response.clone().json()) as Record<
              string,
              unknown
            >;
            applySubmitSuccess(payload);
          } catch {
            // keep optimistic status; refresh will reconcile
          }
          refresh();
        } else if (rollback) {
          setProgress(rollback);
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [applySubmitSuccess, initial.ticketId, refresh, setProgress]);

  const value = useMemo<TicketWorkbenchContextValue>(
    () => ({
      ticketId: initial.ticketId,
      trackSlug: initial.trackSlug,
      status,
      startedAt,
      resolvedAt,
      slaDueAt,
      slaMet,
      submission,
      lastScoreStatus,
      lastFeedback,
      lastStructuredResult,
      attemptCount,
      maxAttempts,
      attempts,
      answersEditable,
      answersReadOnly,
      requiresOpen,
      canRetry,
      retryKey,
      readOnlyPreview,
      setProgress,
      applySubmitSuccess,
      beginRetryLocally,
      refresh,
    }),
    [
      initial.ticketId,
      initial.trackSlug,
      status,
      startedAt,
      resolvedAt,
      slaDueAt,
      slaMet,
      submission,
      lastScoreStatus,
      lastFeedback,
      lastStructuredResult,
      attemptCount,
      maxAttempts,
      attempts,
      answersEditable,
      answersReadOnly,
      requiresOpen,
      canRetry,
      retryKey,
      readOnlyPreview,
      setProgress,
      applySubmitSuccess,
      beginRetryLocally,
      refresh,
    ]
  );

  return (
    <TicketWorkbenchContext.Provider value={value}>
      {children}
    </TicketWorkbenchContext.Provider>
  );
}
