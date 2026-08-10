import { cn } from '@/lib/utils';

type HeaderProps = {
  className?: string;
};

export function Header({ className }: HeaderProps) {
  return (
    <header className={cn('border-b border-border bg-card', className)}>
      <div className="mx-auto flex max-w-5xl items-center px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Next.js App</h1>
      </div>
    </header>
  );
}
