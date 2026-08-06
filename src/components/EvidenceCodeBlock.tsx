'use client';

import { useMemo } from 'react';

import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

type EvidenceCodeBlockProps = {
  code: string;
  language?: 'json' | 'text';
  title?: string;
  className?: string;
};

function highlightJson(json: string): string {
  try {
    const parsed = JSON.parse(json);
    const formatted = JSON.stringify(parsed, null, 2);
    return formatted
      .replace(/"([^"]+)":/g, '<span class="text-primary">"$1"</span>:')
      .replace(
        /: "([^"]*)"/g,
        ': <span class="text-status-satisfied-foreground">"$1"</span>'
      )
      .replace(/: (\d+)/g, ': <span class="text-accent">$1</span>')
      .replace(
        /: (true|false|null)/g,
        ': <span class="text-status-insufficient-foreground">$1</span>'
      );
  } catch {
    return json.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

export function EvidenceCodeBlock({
  code,
  language = 'json',
  title = 'Evidence artifact',
  className,
}: EvidenceCodeBlockProps) {
  const highlighted = useMemo(
    () => (language === 'json' ? highlightJson(code) : code),
    [code, language]
  );

  return (
    <div className={cn('rounded-lg border border-border bg-card', className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="font-mono text-xs font-medium text-muted-foreground">
          {title}
        </span>
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs uppercase text-muted-foreground">
          {language}
        </span>
      </div>
      <ScrollArea className="h-[280px] w-full">
        <pre
          tabIndex={0}
          role="region"
          aria-label={`${title}, ${language} content. Use arrow keys to scroll.`}
          className="overflow-x-auto p-4 font-mono text-sm leading-relaxed text-foreground focus:outline-none"
        >
          {language === 'json' ? (
            <code dangerouslySetInnerHTML={{ __html: highlighted }} />
          ) : (
            <code>{code}</code>
          )}
        </pre>
        <ScrollBar orientation="horizontal" />
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    </div>
  );
}
