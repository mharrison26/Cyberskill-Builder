'use client';

import { useState, useTransition } from 'react';

import { toggleFindingPublic } from '@/components/grading/actions';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export type PublicPortfolioToggleProps = {
  findingId: string;
  isPublic: boolean;
  canToggle: boolean;
};

export function PublicPortfolioToggle({
  findingId,
  isPublic,
  canToggle,
}: PublicPortfolioToggleProps) {
  const [checked, setChecked] = useState(isPublic);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!canToggle) {
    return null;
  }

  const inputId = `finding-public-${findingId}`;
  const descriptionId = `${inputId}-description`;

  function handleCheckedChange(nextChecked: boolean) {
    const previousChecked = checked;
    setChecked(nextChecked);
    setError(null);

    startTransition(async () => {
      const result = await toggleFindingPublic(findingId, nextChecked);

      if (result.error) {
        setChecked(previousChecked);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <div className="space-y-1">
        <Label
          htmlFor={inputId}
          className="text-sm font-medium text-foreground"
        >
          Public portfolio
        </Label>
        <p id={descriptionId} className="text-sm text-muted-foreground">
          Make this finding visible on your public portfolio page
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Switch
        id={inputId}
        checked={checked}
        onCheckedChange={handleCheckedChange}
        disabled={isPending}
        aria-describedby={descriptionId}
      />
    </div>
  );
}
