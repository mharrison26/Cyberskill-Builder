import type { Metadata } from 'next';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Suspense } from 'react';

import { ControlCatalogBrowser } from '@/components/ControlCatalogBrowser';
import {
  parseOscalCatalog,
  type OscalCatalogDocument,
} from '@/lib/oscal/parseCatalog';

export const metadata: Metadata = {
  title: 'NIST SP 800-53 Control Catalog',
  description:
    'Browse NIST SP 800-53 Revision 5 security and privacy controls.',
};

function loadCatalogControls() {
  const catalogPath = path.join(
    process.cwd(),
    'data/oscal/NIST_SP-800-53_rev5_catalog.json'
  );
  const raw = readFileSync(catalogPath, 'utf8') as string;
  const document = JSON.parse(raw) as OscalCatalogDocument;
  return parseOscalCatalog(document);
}

export default function GrcControlCatalogPage() {
  const controls = loadCatalogControls();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">GRC Track</p>
        <h1 className="text-2xl font-semibold">
          NIST SP 800-53 Control Catalog
        </h1>
        <p className="mt-1 text-muted-foreground">
          {controls.length.toLocaleString()} controls from the official OSCAL
          catalog. Search by ID, family, or title; use arrow keys to move
          between rows and Enter to expand the full control statement.
        </p>
      </header>

      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading catalog…</p>
        }
      >
        <ControlCatalogBrowser controls={controls} />
      </Suspense>
    </div>
  );
}
