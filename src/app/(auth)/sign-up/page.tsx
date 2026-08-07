import type { Metadata } from 'next';

import { SignUpForm } from '@/components/auth/SignUpForm';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Sign up',
  description: 'Create a new account',
};

type SignUpPageProps = {
  searchParams: Promise<{ code?: string; cohort?: string }>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  const initialCohortCode = (params.code ?? params.cohort ?? '').trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Create account</CardTitle>
        <CardDescription>Enter your details to get started.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm initialCohortCode={initialCohortCode} />
      </CardContent>
    </Card>
  );
}
