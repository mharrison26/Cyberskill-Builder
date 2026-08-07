'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { signUp } from '@/app/(auth)/actions';
import { AuthField } from '@/components/auth/AuthField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  validateConfirmPassword,
  validateEmail,
  validatePassword,
} from '@/lib/auth/validation';

type SignUpFormProps = {
  initialCohortCode?: string;
};

export function SignUpForm({ initialCohortCode = '' }: SignUpFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cohortCode, setCohortCode] = useState(initialCohortCode);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function validateForm(): boolean {
    const errors: {
      email?: string;
      password?: string;
      confirmPassword?: string;
    } = {};
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    const confirmPasswordError = validateConfirmPassword(
      password,
      confirmPassword
    );

    if (emailError) errors.email = emailError;
    if (passwordError) errors.password = passwordError;
    if (confirmPasswordError) errors.confirmPassword = confirmPasswordError;

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);
    setSuccessMessage(null);

    if (!validateForm()) return;

    const formData = new FormData();
    formData.set('email', email.trim());
    formData.set('password', password);
    if (cohortCode.trim()) {
      formData.set('cohortCode', cohortCode.trim());
    }

    startTransition(async () => {
      const result = await signUp(formData);
      if (result?.error) {
        setAuthError(result.error);
      } else if (result?.message) {
        setSuccessMessage(result.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {authError ? (
        <Alert variant="destructive">
          <AlertDescription>{authError}</AlertDescription>
        </Alert>
      ) : null}

      {successMessage ? (
        <Alert className="border-status-satisfied-foreground/20 bg-status-satisfied text-status-satisfied-foreground">
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      ) : null}

      <AuthField
        id="sign-up-email"
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
        id="sign-up-password"
        label="Password"
        type="password"
        name="password"
        value={password}
        onChange={setPassword}
        error={fieldErrors.password}
        autoComplete="new-password"
        disabled={isPending}
      />

      <AuthField
        id="sign-up-confirm-password"
        label="Confirm password"
        type="password"
        name="confirmPassword"
        value={confirmPassword}
        onChange={setConfirmPassword}
        error={fieldErrors.confirmPassword}
        autoComplete="new-password"
        disabled={isPending}
      />

      <AuthField
        id="sign-up-cohort-code"
        label="Cohort or invite code (optional)"
        type="text"
        name="cohortCode"
        value={cohortCode}
        onChange={setCohortCode}
        autoComplete="off"
        disabled={isPending}
      />

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Creating account…' : 'Create account'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href="/sign-in"
          className="font-medium text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
