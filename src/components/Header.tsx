import { cn } from '@/lib/utils';

type HeaderProps = {
  className?: string;
};

export function Header({ className }: HeaderProps) {
  return (
    <header className={cn('border-b border-gray-200 bg-white', className)}>
      <div className="mx-auto flex max-w-5xl items-center px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900">Next.js App</h1>
      </div>
    </header>
  );
}
