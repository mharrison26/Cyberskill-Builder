'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

type AdminRerunGradingButtonProps = {
  lessonId: string;
  studentId: string;
  progressId?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GradePayload = {
  error?: string;
  message?: string;
  grading?: { status?: string; error?: string | null };
};

async function readJsonPayload(response: Response): Promise<GradePayload> {
  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(
      `Empty response from grading API (HTTP ${response.status}).`
    );
  }

  if (
    !contentType.includes('application/json') &&
    !text.trimStart().startsWith('{') &&
    !text.trimStart().startsWith('[')
  ) {
    throw new Error(
      `Grading API returned non-JSON (HTTP ${response.status}): ${text.slice(0, 180)}`
    );
  }

  try {
    return JSON.parse(text) as GradePayload;
  } catch {
    // Safari surfaces JSON parse failures as
    // "The string did not match the expected pattern."
    throw new Error(
      `Grading API returned invalid JSON (HTTP ${response.status}): ${text.slice(0, 180)}`
    );
  }
}

export function AdminRerunGradingButton({
  lessonId,
  studentId,
  progressId,
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
      if (!UUID_RE.test(lessonId) || !UUID_RE.test(studentId)) {
        throw new Error(
          'Invalid lesson/student id on this row — refresh the grading queue and try again.'
        );
      }
      if (progressId && !UUID_RE.test(progressId)) {
        throw new Error(
          'Invalid progress id on this row — refresh the grading queue and try again.'
        );
      }

      const response = await fetch(`/api/lessons/${lessonId}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          studentId,
          inline: true,
          ...(progressId ? { progressId } : {}),
        }),
      });
      const payload = await readJsonPayload(response);

      if (!response.ok) {
        throw new Error(
          payload.error ?? payload.grading?.error ?? 'Failed to re-run grading'
        );
      }

      if (payload.grading?.status === 'completed') {
        setMessage('Grading completed.');
      } else if (payload.grading?.status === 'failed') {
        setError(payload.grading.error ?? 'Grading failed');
      } else if (payload.grading?.status === 'queued') {
        setMessage(
          payload.message ??
            'Grading re-queued — worker kicked. Refresh shortly for results.'
        );
      } else {
        setMessage(payload.message ?? 'Grading request accepted.');
      }
      try {
        router.refresh();
      } catch {
        // Refresh failures should not mask a successful grade response.
      }
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
