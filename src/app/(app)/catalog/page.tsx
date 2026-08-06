import type { Metadata } from 'next';

import { ControlCatalogTable } from '@/components/catalog/ControlCatalogTable';

export const metadata: Metadata = {
  title: 'Control Catalog',
  description: 'Browse NIST SP 800-53 security controls.',
};

export default function ControlCatalogPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Control Catalog</h1>
        <p className="mt-1 text-muted-foreground">
          NIST SP 800-53 Rev. 5 controls referenced in GRC training tracks.
          Search, sort, and expand rows for full control statements.
        </p>
      </header>

      <ControlCatalogTable />
    </div>
  );
}
