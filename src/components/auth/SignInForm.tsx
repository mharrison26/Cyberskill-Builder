'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { signIn } from '@/app/(auth)/actions';
import { AuthField } from '@/components/auth/AuthField';
import { SsoSignInForm } from '@/components/auth/SsoSignInForm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { validateEmail, validatePassword } from '@/lib/auth/validation';

export function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function validateForm(): boolean {
    const errors: { email?: string; password?: string } = {};
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);

    if (emailError) errors.email = emailError;
    if (passwordError) errors.password = passwordError;

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);

    if (!validateForm()) return;

    const formData = new FormData();
    formData.set('email', email.trim());
    formData.set('password', password);

    startTransition(async () => {
      const result = await signIn(formData);
      if (result?.error) setAuthError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium">Enterprise SSO</p>
        <p className="text-xs text-muted-foreground">
          Use your organization domain when SSO is configured for your tenant.
        </p>
        <SsoSignInForm />
      </div>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          or
        </span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {authError ? (
          <Alert variant="destructive">
            <AlertDescription>{authError}</AlertDescription>
          </Alert>
        ) : null}

        <AuthField
          id="sign-in-email"
          label="Email"
          type="email"
          name="email"
          value={email}
          onChange={setEmail}
          error={fieldErrors.email}
          autoComplete="email"
          disabled={isPending}
        />

        <AuthField
          id="sign-in-password"
          label="Password"
          type="password"
          name="password"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
          autoComplete="current-password"
          disabled={isPending}
        />

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? 'Signing in…' : 'Sign in'}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            href="/sign-up"
            className="font-medium text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:underline"
          >
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
