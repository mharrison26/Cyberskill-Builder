'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

type EnrollButtonProps = {
  trackSlug: string;
  disabled?: boolean;
  label?: string;
};

export function EnrollButton({
  trackSlug,
  disabled = false,
  label = 'Enroll',
}: EnrollButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEnroll() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trackSlug }),
      });

      const data = (await response.json()) as {
        url?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(data.error ?? 'Unable to start checkout.');
        return;
      }

      if (!data.url) {
        setError('Checkout session did not return a redirect URL.');
        return;
      }

      window.location.assign(data.url);
    } catch {
      setError('Unable to start checkout. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="lg"
        className="w-full sm:w-auto"
        disabled={disabled || isLoading}
        onClick={handleEnroll}
      >
        {isLoading ? 'Redirecting to Stripe…' : label}
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
