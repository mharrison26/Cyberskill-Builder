import type { Metadata } from 'next';

import { Header } from '@/components/Header';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Complete enrollment to access track content',
};

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-gray-50 font-[family-name:var(--font-geist-sans)]">
      <Header />
      <main className="mx-auto flex w-full max-w-2xl flex-col px-6 py-12">
        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-900">Checkout</h1>
          <p className="mt-2 text-sm text-gray-600">
            Enrollment required — purchase a track to access lessons.
          </p>
        </div>
      </main>
    </div>
  );
}
