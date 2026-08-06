'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { signUp } from '@/app/(auth)/actions';
import {
  validateConfirmPassword,
  validateEmail,
  validatePassword,
} from '@/lib/auth/validation';
import { cn } from '@/lib/utils';

import { AuthField } from './AuthField';

export function SignUpForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {authError}
        </div>
      ) : null}

      {successMessage ? (
        <div
          role="status"
          className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          {successMessage}
        </div>
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

      <button
        type="submit"
        disabled={isPending}
        className={cn(
          'w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white',
          'transition-colors hover:bg-gray-800',
          'focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60'
        )}
      >
        {isPending ? 'Creating account…' : 'Create account'}
      </button>

      <p className="text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link
          href="/sign-in"
          className="font-medium text-gray-900 underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
