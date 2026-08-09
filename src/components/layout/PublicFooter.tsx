import Link from 'next/link';

import { cn } from '@/lib/utils';

type PublicFooterProps = {
  className?: string;
};

export function PublicFooter({ className }: PublicFooterProps) {
  return (
    <footer className={cn('border-t border-border bg-card', className)}>
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} CyberSkill Builder. Training platform for
          compliance professionals.
        </p>
        <nav aria-label="Legal">
          <ul className="flex items-center gap-6 text-sm">
            <li>
              <Link
                href="/privacy"
                className="text-muted-foreground hover:text-foreground focus:outline-none focus-visible:underline"
              >
                Privacy
              </Link>
            </li>
            <li>
              <Link
                href="/terms"
                className="text-muted-foreground hover:text-foreground focus:outline-none focus-visible:underline"
              >
                Terms
              </Link>
            </li>
            <li>
              <Link
                href="/subprocessors"
                className="text-muted-foreground hover:text-foreground focus:outline-none focus-visible:underline"
              >
                Subprocessors
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
