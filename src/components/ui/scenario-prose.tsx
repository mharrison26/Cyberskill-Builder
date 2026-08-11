import * as React from 'react';

import { cn } from '@/lib/utils';

type ScenarioProseProps = React.ComponentPropsWithoutRef<'div'> & {
  /** Use a paragraph when the brief is plain text (not markdown). */
  as?: 'div' | 'p';
};

/**
 * Long-form scenario / ticket brief copy — body size, prose line-height,
 * ~70ch measure for readable column width.
 */
function ScenarioProse({
  as = 'div',
  className,
  ...props
}: ScenarioProseProps) {
  const Comp = as;

  return (
    <Comp
      data-slot="scenario-prose"
      className={cn(
        'max-w-prose-scenario text-body text-foreground whitespace-pre-wrap',
        className
      )}
      {...props}
    />
  );
}

export { ScenarioProse };
