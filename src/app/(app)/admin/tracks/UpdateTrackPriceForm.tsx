'use client';

import { useFormState, useFormStatus } from 'react-dom';

import {
  updateTrackPrice,
  type TrackActionResult,
} from '@/app/(app)/admin/tracks/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Saving…' : 'Update'}
    </Button>
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
      <div className="min-w-[8rem] flex-1 space-y-1">
        <Label htmlFor={priceId} className="sr-only">
          Full price for {trackName}
        </Label>
        <Input
          id={priceId}
          name="full_price"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={fullPrice}
          aria-invalid={state.fieldErrors?.full_price ? true : undefined}
        />
        {state.fieldErrors?.full_price ? (
          <p role="alert" className="text-sm text-destructive">
            {state.fieldErrors.full_price}
          </p>
        ) : null}
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
      <SubmitButton />
    </form>
  );
}
