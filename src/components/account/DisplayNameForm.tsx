'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { updateDisplayName } from '@/app/(app)/account/actions';
import { AuthField } from '@/components/auth/AuthField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { validateDisplayName } from '@/lib/users/displayName';

type DisplayNameFormProps = {
  initialDisplayName: string | null;
};

export function DisplayNameForm({ initialDisplayName }: DisplayNameFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName ?? '');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const error = validateDisplayName(displayName);
    if (error) {
      setFieldError(error);
      return;
    }
    setFieldError(undefined);

    const formData = new FormData();
    formData.set('displayName', displayName.trim());

    startTransition(async () => {
      const result = await updateDisplayName(formData);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      if (result.displayName) {
        setDisplayName(result.displayName);
      }
      setSuccessMessage('Preferred name saved.');
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {successMessage ? (
        <Alert className="border-status-satisfied-foreground/20 bg-status-satisfied text-status-satisfied-foreground">
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      ) : null}

      {!initialDisplayName ? (
        <p className="text-sm text-muted-foreground">
          What should we call you? This is shown in greetings and the header —
          we never invent a name from your email.
        </p>
      ) : null}

      <AuthField
        id="account-display-name"
        label="Preferred name"
        type="text"
        name="displayName"
        value={displayName}
        onChange={setDisplayName}
        error={fieldError}
        autoComplete="nickname"
        disabled={isPending}
        placeholder="e.g. Murray"
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save preferred name'}
      </Button>
    </form>
  );
}
