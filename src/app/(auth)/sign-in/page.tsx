import type { Metadata } from 'next';

import { SignInForm } from '@/components/auth/SignInForm';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your account',
};

export default function SignInPage() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-900">Sign in</h1>
      <p className="mt-2 text-sm text-gray-600">
        Welcome back. Enter your credentials to continue.
      </p>
      <div className="mt-8">
        <SignInForm />
      </div>
    </div>
  );
}
