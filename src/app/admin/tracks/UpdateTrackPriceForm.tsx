'use client';

import { useFormState, useFormStatus } from 'react-dom';

import {
  updateTrackPrice,
  type TrackActionResult,
} from '@/app/admin/tracks/actions';
import { cn } from '@/lib/utils';

const inputClassName = cn(
  'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm',
  'focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1'
);

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'shrink-0 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white',
        'hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60'
      )}
    >
      {pending ? 'Saving…' : 'Update'}
    </button>
  );
}

const initialState: TrackActionResult = {};

type UpdateTrackPriceFormProps = {
  trackId: string;
  trackName: string;
  fullPrice: number;
};

export function UpdateTrackPriceForm({
  trackId,
  trackName,
  fullPrice,
}: UpdateTrackPriceFormProps) {
  const [state, formAction] = useFormState(updateTrackPrice, initialState);
  const priceId = `full-price-${trackId}`;

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={trackId} />
      <div className="min-w-[8rem] flex-1">
        <label htmlFor={priceId} className="sr-only">
          Full price for {trackName}
        </label>
        <input
          id={priceId}
          name="full_price"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={fullPrice}
          aria-invalid={state.fieldErrors?.full_price ? true : undefined}
          className={inputClassName}
        />
        {state.fieldErrors?.full_price ? (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {state.fieldErrors.full_price}
          </p>
        ) : null}
        {state.error ? (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {state.error}
          </p>
        ) : null}
      </div>
      <SubmitButton />
    </form>
  );
}
