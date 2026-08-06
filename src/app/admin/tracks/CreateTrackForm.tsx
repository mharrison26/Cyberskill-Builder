'use client';

import { useFormState, useFormStatus } from 'react-dom';

import {
  createTrack,
  type TrackActionResult,
} from '@/app/admin/tracks/actions';
import { cn } from '@/lib/utils';

const inputClassName = cn(
  'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm',
  'placeholder:text-gray-400',
  'focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1'
);

const labelClassName = 'block text-sm font-medium text-gray-700';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-red-600">
      {message}
    </p>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white',
        'hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60'
      )}
    >
      {pending ? 'Saving…' : children}
    </button>
  );
}

const initialState: TrackActionResult = {};

export function CreateTrackForm() {
  const [state, formAction] = useFormState(createTrack, initialState);

  return (
    <section
      aria-labelledby="create-track-heading"
      className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h2
        id="create-track-heading"
        className="text-lg font-semibold text-gray-900"
      >
        Add track
      </h2>
      <form action={formAction} className="mt-4 space-y-4">
        {state.error ? (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {state.error}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="create-slug" className={labelClassName}>
              Slug
            </label>
            <input
              id="create-slug"
              name="slug"
              type="text"
              required
              autoComplete="off"
              spellCheck={false}
              aria-invalid={state.fieldErrors?.slug ? true : undefined}
              className={cn(inputClassName, 'mt-1')}
              placeholder="grc"
            />
            <FieldError message={state.fieldErrors?.slug} />
          </div>
          <div>
            <label htmlFor="create-name" className={labelClassName}>
              Name
            </label>
            <input
              id="create-name"
              name="name"
              type="text"
              required
              aria-invalid={state.fieldErrors?.name ? true : undefined}
              className={cn(inputClassName, 'mt-1')}
              placeholder="GRC"
            />
            <FieldError message={state.fieldErrors?.name} />
          </div>
          <div>
            <label htmlFor="create-full-price" className={labelClassName}>
              Full price (USD)
            </label>
            <input
              id="create-full-price"
              name="full_price"
              type="number"
              min="0"
              step="0.01"
              required
              aria-invalid={state.fieldErrors?.full_price ? true : undefined}
              className={cn(inputClassName, 'mt-1')}
              placeholder="299.00"
            />
            <FieldError message={state.fieldErrors?.full_price} />
          </div>
        </div>
        <SubmitButton>Add track</SubmitButton>
      </form>
    </section>
  );
}
