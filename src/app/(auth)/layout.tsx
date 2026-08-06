import { PublicFooter } from '@/components/layout/PublicFooter';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { SkipLink } from '@/components/SkipLink';

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <PublicHeader />
      <main
        id="content"
        className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-12"
      >
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
