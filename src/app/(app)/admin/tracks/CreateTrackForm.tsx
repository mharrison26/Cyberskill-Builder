'use client';

import { useFormState, useFormStatus } from 'react-dom';

import {
  createTrack,
  type TrackActionResult,
} from '@/app/(app)/admin/tracks/actions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-destructive">
      {message}
    </p>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : children}
    </Button>
  );
}

const initialState: TrackActionResult = {};

export function CreateTrackForm() {
  const [state, formAction] = useFormState(createTrack, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add track</CardTitle>
        <CardDescription>
          Create a new learning track with catalog pricing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state.error ? (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.error}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="create-slug">Slug</Label>
              <Input
                id="create-slug"
                name="slug"
                type="text"
                required
                autoComplete="off"
                spellCheck={false}
                aria-invalid={state.fieldErrors?.slug ? true : undefined}
                placeholder="grc"
              />
              <FieldError message={state.fieldErrors?.slug} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-name">Name</Label>
              <Input
                id="create-name"
                name="name"
                type="text"
                required
                aria-invalid={state.fieldErrors?.name ? true : undefined}
                placeholder="GRC"
              />
              <FieldError message={state.fieldErrors?.name} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-full-price">Full price (USD)</Label>
              <Input
                id="create-full-price"
                name="full_price"
                type="number"
                min="0"
                step="0.01"
                required
                aria-invalid={state.fieldErrors?.full_price ? true : undefined}
                placeholder="299.00"
              />
              <FieldError message={state.fieldErrors?.full_price} />
            </div>
          </div>
          <SubmitButton>Add track</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
