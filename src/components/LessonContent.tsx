'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import {
  oneDark,
  oneLight,
} from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

import { cn } from '@/lib/utils';

type LessonContentProps = {
  content: string;
  className?: string;
};

/*
 * Heading mapping: the lesson page renders its own h1 (lesson title).
 * Markdown headings are shifted down one level so document order stays valid:
 *   markdown #  → h2
 *   markdown ## → h3
 *   markdown ### → h4 (and so on through h6)
 */
const headingComponents: Pick<
  Components,
  'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
> = {
  h1: ({ children, ...props }) => (
    <h2
      {...props}
      className="scroll-mt-24 text-xl font-semibold tracking-tight text-primary"
    >
      {children}
    </h2>
  ),
  h2: ({ children, ...props }) => (
    <h3
      {...props}
      className="scroll-mt-24 text-lg font-semibold tracking-tight text-primary"
    >
      {children}
    </h3>
  ),
  h3: ({ children, ...props }) => (
    <h4
      {...props}
      className="scroll-mt-24 text-base font-semibold text-foreground"
    >
      {children}
    </h4>
  ),
  h4: ({ children, ...props }) => (
    <h5
      {...props}
      className="scroll-mt-24 text-sm font-semibold text-foreground"
    >
      {children}
    </h5>
  ),
  h5: ({ children, ...props }) => (
    <h6 {...props} className="scroll-mt-24 text-sm font-medium text-foreground">
      {children}
    </h6>
  ),
  h6: ({ children, ...props }) => (
    <h6
      {...props}
      className="scroll-mt-24 text-sm font-medium text-muted-foreground"
    >
      {children}
    </h6>
  ),
};

type CodeBlockProps = {
  language: string;
  code: string;
};

/*
 * Syntax themes follow the app theme class. Prism backgrounds are cleared so
 * the surrounding surface token paints the chrome.
 */
function CodeBlock({ language, code }: CodeBlockProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <div className="not-prose overflow-hidden rounded-lg border border-border bg-muted">
      <div className="flex items-center justify-between border-b border-border bg-surface/60 px-4 py-2">
        <span className="font-mono text-xs font-medium text-muted-foreground">
          Code
        </span>
        <span className="rounded bg-background px-2 py-0.5 font-mono text-xs uppercase text-muted-foreground">
          {language}
        </span>
      </div>
      <SyntaxHighlighter
        language={language}
        style={isDark ? oneDark : oneLight}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: 'transparent',
          fontSize: '0.875rem',
          lineHeight: '1.625',
        }}
        codeTagProps={{
          className: 'font-mono',
          style: {
            fontFamily: 'var(--font-jetbrains-mono), ui-monospace, monospace',
          },
        }}
        tabIndex={0}
        role="region"
        aria-label={`${language} code sample. Tab to focus and scroll.`}
        className="overflow-x-auto font-mono text-sm leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

const markdownComponents: Components = {
  ...headingComponents,
  p: ({ children, ...props }) => (
    <p {...props} className="leading-relaxed text-foreground">
      {children}
    </p>
  ),
  a: ({ children, href, ...props }) => {
    const isExternal = href?.startsWith('http');
    return (
      <a
        {...props}
        href={href}
        className="font-medium text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:text-primary/80"
        {...(isExternal
          ? { target: '_blank', rel: 'noopener noreferrer' }
          : {})}
      >
        {children}
      </a>
    );
  },
  ul: ({ children, ...props }) => (
    <ul {...props} className="list-disc space-y-2 pl-5 text-foreground">
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol {...props} className="list-decimal space-y-2 pl-5 text-foreground">
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li {...props} className="leading-relaxed">
      {children}
    </li>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      {...props}
      className="border-l-4 border-primary/40 bg-secondary/50 py-1 pl-4 italic text-muted-foreground"
    >
      {children}
    </blockquote>
  ),
  hr: (props) => <hr {...props} className="border-border" />,
  table: ({ children, ...props }) => (
    <div className="not-prose overflow-x-auto rounded-lg border border-border">
      <table {...props} className="min-w-full divide-y divide-border text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead {...props} className="bg-muted/60">
      {children}
    </thead>
  ),
  th: ({ children, ...props }) => (
    <th
      {...props}
      className="px-4 py-2 text-left font-semibold text-foreground"
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td {...props} className="px-4 py-2 text-foreground">
      {children}
    </td>
  ),
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, ...props }) => {
    const match = /language-(\w+)/.exec(className ?? '');
    const code = String(children).replace(/\n$/, '');

    if (match) {
      return <CodeBlock language={match[1]} code={code} />;
    }

    return (
      <code
        {...props}
        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8125rem] text-foreground"
      >
        {children}
      </code>
    );
  },
  strong: ({ children, ...props }) => (
    <strong {...props} className="font-semibold text-foreground">
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em {...props} className="italic text-foreground">
      {children}
    </em>
  ),
};

export function LessonContent({ content, className }: LessonContentProps) {
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none',
        'prose-headings:font-semibold prose-headings:tracking-tight',
        'prose-p:text-foreground prose-li:text-foreground',
        'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
        'prose-code:font-mono prose-code:before:content-none prose-code:after:content-none',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
