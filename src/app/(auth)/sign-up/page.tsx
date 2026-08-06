import type { Metadata } from 'next';

import { SignUpForm } from '@/components/auth/SignUpForm';

export const metadata: Metadata = {
  title: 'Sign up',
  description: 'Create a new account',
};

export default function SignUpPage() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold text-gray-900">Create account</h1>
      <p className="mt-2 text-sm text-gray-600">
        Enter your details to get started.
      </p>
      <div className="mt-8">
        <SignUpForm />
      </div>
    </div>
  );
}
