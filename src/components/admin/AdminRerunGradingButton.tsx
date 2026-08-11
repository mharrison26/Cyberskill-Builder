'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

type AdminRerunGradingButtonProps = {
  lessonId: string;
  studentId: string;
};

export function AdminRerunGradingButton({
  lessonId,
  studentId,
}: AdminRerunGradingButtonProps) {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRerun() {
    setIsRunning(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/lessons/${lessonId}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, inline: true }),
      });
      const payload = (await response.json()) as {
        error?: string;
        grading?: { status?: string; error?: string | null };
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? payload.grading?.error ?? 'Failed to re-run grading'
        );
      }

      if (payload.grading?.status === 'completed') {
        setMessage('Grading completed.');
      } else if (payload.grading?.status === 'queued') {
        setMessage('Grading re-queued. Refresh shortly for results.');
      } else {
        setMessage('Grading request accepted.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to re-run grading');
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div
      className="space-y-2"
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isRunning}
        onClick={() => {
          void handleRerun();
        }}
      >
        {isRunning ? 'Re-running…' : 'Re-run AI grading'}
      </Button>
      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
