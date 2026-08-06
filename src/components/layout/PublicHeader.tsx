import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type PublicHeaderProps = {
  className?: string;
};

export function PublicHeader({ className }: PublicHeaderProps) {
  return (
    <header className={cn('border-b border-border bg-card', className)}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="text-lg font-semibold text-primary hover:text-primary/80 focus:outline-none focus-visible:underline"
        >
          CyberSkill Builder
        </Link>
        <nav aria-label="Account">
          <ul className="flex items-center gap-3">
            <li>
              <Link href="/sign-in">
                <Button variant="ghost">Sign In</Button>
              </Link>
            </li>
            <li>
              <Link href="/sign-up">
                <Button>Sign Up</Button>
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
