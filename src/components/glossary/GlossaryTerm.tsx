'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  getGlossaryTerm,
  glossaryHref,
} from '@/lib/glossary/terms';
import { cn } from '@/lib/utils';

type GlossaryTermProps = {
  /** Glossary term id from `GLOSSARY_TERMS` */
  id: string;
  children?: ReactNode;
  className?: string;
};

/**
 * Inline jargon wrapper: accessible tooltip + link to glossary anchor.
 */
export function GlossaryTerm({ id, children, className }: GlossaryTermProps) {
  const def = getGlossaryTerm(id);
  if (!def) {
    return <span className={className}>{children ?? id}</span>;
  }

  const label = children ?? def.term;

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          className={cn(
            'cursor-help underline decoration-dotted decoration-muted-foreground/70 underline-offset-2',
            className
          )}
          render={<span />}
        >
          {label}
        </TooltipTrigger>
        <TooltipContent side="top" className="space-y-2">
          <p className="font-medium text-foreground">{def.term}</p>
          <p className="text-muted-foreground">{def.short}</p>
          <p>
            <Link
              href={glossaryHref(def.id)}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Open glossary
            </Link>
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
