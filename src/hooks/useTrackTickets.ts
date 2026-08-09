'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { getMockTicketsByTrack } from '@/lib/mock-data';
import type { MockTrackTicket, TicketProgressStatus } from '@/types';

export type UseTrackTicketsResult = {
  tickets: MockTrackTicket[];
  isLoading: boolean;
  error: string | null;
  source: 'live' | 'mock' | 'mixed';
  setTicketStatus: (ticketId: string, status: TicketProgressStatus) => void;
  refetch: () => void;
};

type UseTrackTicketsOptions = {
  /** SSR / server-loaded tickets to avoid a flash of mocks. */
  initialTickets?: MockTrackTicket[];
  initialSource?: 'live' | 'mock' | 'mixed';
};

function withMockDefaults(tickets: MockTrackTicket[]): MockTrackTicket[] {
  return tickets.map((ticket) => ({
    ...ticket,
    source: ticket.source ?? 'mock',
    workbenchHref: ticket.workbenchHref ?? null,
  }));
}

/**
 * Track ticket data hook — fetches RLS-aware `/api/tracks/[slug]/tickets`,
 * falling back to mock rows when the track has no live tickets yet.
 */
export function useTrackTickets(
  trackSlug: string,
  options: UseTrackTicketsOptions = {}
): UseTrackTicketsResult {
  const [tickets, setTickets] = useState<MockTrackTicket[]>(() =>
    withMockDefaults(
      options.initialTickets ?? getMockTicketsByTrack(trackSlug)
    )
  );
  const [source, setSource] = useState<'live' | 'mock' | 'mixed'>(
    options.initialSource ?? 'mock'
  );
  const [isLoading, setIsLoading] = useState(!options.initialTickets);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<
    Record<string, TicketProgressStatus>
  >({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Skip network on first paint when SSR already provided tickets,
      // unless this is an explicit refetch.
      if (refreshKey === 0 && options.initialTickets) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/tracks/${encodeURIComponent(trackSlug)}/tickets`,
          { credentials: 'same-origin' }
        );
        if (!response.ok) {
          throw new Error(`Failed to load tickets (${response.status})`);
        }
        const payload = (await response.json()) as {
          tickets?: MockTrackTicket[];
          source?: 'live' | 'mock' | 'mixed';
          error?: string;
        };
        if (cancelled) return;
        if (payload.error) throw new Error(payload.error);
        setTickets(withMockDefaults(payload.tickets ?? []));
        setSource(payload.source ?? 'mock');
        setOverrides({});
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load tickets');
        setTickets(withMockDefaults(getMockTicketsByTrack(trackSlug)));
        setSource('mock');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // initialTickets is only consulted for the refreshKey===0 short-circuit
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid refetch loops from new array identities
  }, [trackSlug, refreshKey]);

  const merged = useMemo(
    () =>
      tickets.map((ticket) => ({
        ...ticket,
        status: overrides[ticket.id] ?? ticket.status,
      })),
    [tickets, overrides]
  );

  const setTicketStatus = useCallback(
    (ticketId: string, status: TicketProgressStatus) => {
      setOverrides((prev) => ({ ...prev, [ticketId]: status }));
    },
    []
  );

  const refetch = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  return {
    tickets: merged,
    isLoading,
    error,
    source,
    setTicketStatus,
    refetch,
  };
}
