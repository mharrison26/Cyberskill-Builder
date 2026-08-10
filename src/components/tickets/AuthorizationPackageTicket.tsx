'use client';

import { useState } from 'react';

import {
  CompiledPackageArtifacts,
  useCompiledPackage,
} from '@/components/tickets/CompiledPackagePanel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Ticket } from '@/types';

type SubmitResponse = {
  success?: boolean;
  status?: string;
  feedback?: string;
  error?: string;
};

type AuthorizationPackageTicketProps = {
  ticket: Pick<
    Ticket,
    'id' | 'ticket_type' | 'initial_state' | 'expected_state'
  >;
  readOnly?: boolean;
  className?: string;
};

/**
 * ISSO-04 / optional GRC package-ack ticket: review the compiled GRC-03/04/09
 * package, then acknowledge before continuing to AO review (sheet GRC-10).
 */
export function AuthorizationPackageTicket({
  ticket,
  readOnly = false,
  className,
}: AuthorizationPackageTicketProps) {
  const { pkg, loading, loadError } = useCompiledPackage(ticket.id);
  const [acknowledged, setAcknowledged] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<'ok' | 'error' | null>(null);

  async function handleSubmit() {
    if (readOnly || isSubmitting) return;
    setIsSubmitting(true);
    setFeedback(null);
    setFeedbackTone(null);

    try {
      const res = await fetch(`/api/tickets/${ticket.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'authorization_package',
          acknowledged: true,
        }),
      });
      const data = (await res.json()) as SubmitResponse;
      if (!res.ok) {
        throw new Error(data.error || 'Submit failed');
      }
      setFeedback(data.feedback ?? 'Submitted.');
      setFeedbackTone(data.status === 'resolved' ? 'ok' : 'error');
      setAcknowledged(true);
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : 'Failed to submit package review'
      );
      setFeedbackTone('error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="auth-package-heading"
      className={cn('space-y-4', className)}
      data-ticket-type={ticket.ticket_type}
      data-ticket-id={ticket.id}
    >
      <div className="space-y-1">
        <h2 id="auth-package-heading" className="text-base font-semibold">
          Compiled authorization package
        </h2>
        <p className="text-sm text-muted-foreground">
          Read-only compilation of your GRC-03 SSP fragment, GRC-04 POA&M
          entries, and GRC-09 OSCAL generator artifacts (ISSO-04). Acknowledge
          the package when ready, then continue to the AO review (sheet GRC-10 /
          ISSO-05) to defend residual risk.
        </p>
      </div>

      <CompiledPackageArtifacts
        ticketId={ticket.id}
        pkg={pkg}
        loading={loading}
        loadError={loadError}
        heading="Package artifacts"
        description="Pulled from your resolved/submitted GRC-03, GRC-04, and GRC-09 work on this track."
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={readOnly || !pkg?.complete}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          I have reviewed the compiled authorization package
        </label>
        <Button
          type="button"
          disabled={readOnly || !acknowledged || !pkg?.complete || isSubmitting}
          onClick={() => void handleSubmit()}
        >
          {isSubmitting ? 'Submitting…' : 'Submit package review'}
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
        </p>
      ) : null}
    </section>
  );
}
