'use client';

import { useState, useTransition } from 'react';
import { Building2 } from 'lucide-react';

import { AuthField } from '@/components/auth/AuthField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { validateEmail } from '@/lib/auth/validation';

/**
 * Enterprise SSO entry — uses Supabase signInWithSSO when a domain is
 * configured in the dashboard; otherwise surfaces a clear setup message.
 */
export function SsoSignInForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    startTransition(async () => {
      try {
        const supabase = createClient();
        const { data, error: ssoError } = await supabase.auth.signInWithSSO({
          domain: email.trim().split('@')[1] ?? '',
          options: {
            redirectTo: `${window.location.origin}/dashboard`,
          },
        });

        if (ssoError) {
          setError(
            ssoError.message.includes('not found') ||
              ssoError.message.includes('No SSO')
              ? 'No SSO provider is configured for that email domain yet. Ask your admin to enable enterprise SSO in Supabase Auth, or sign in with email and password.'
              : ssoError.message
          );
          return;
        }

        if (data?.url) {
          window.location.assign(data.url);
          return;
        }

        setError('SSO redirect was not returned. Try again or use password sign-in.');
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'SSO is unavailable. Use email and password, or contact your admin.'
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <AuthField
        id="sso-email"
        label="Work email"
        type="email"
        name="ssoEmail"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        disabled={isPending}
      />

      <Button type="submit" variant="outline" disabled={isPending} className="w-full">
        <Building2 className="size-4" aria-hidden="true" />
        {isPending ? 'Redirecting…' : 'Continue with SSO'}
      </Button>
    </form>
  );
}
