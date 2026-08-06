import { Header } from '@/components/Header';

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-gray-50 font-[family-name:var(--font-geist-sans)]">
      <Header />
      <main className="mx-auto flex w-full max-w-md flex-col px-6 py-12">
        {children}
      </main>
    </div>
  );
}
