import { ShieldAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function SimulatedDataBanner() {
  return (
    <Alert className="border-status-insufficient-foreground/25 bg-status-insufficient text-status-insufficient-foreground">
      <ShieldAlert className="size-4" aria-hidden="true" />
      <AlertTitle>Training simulation environment</AlertTitle>
      <AlertDescription className="text-status-insufficient-foreground/90">
        This platform is a training simulation. Do not upload real Controlled
        Unclassified Information (CUI), ITAR-controlled material, classified
        documents, or other export-controlled or sensitive government data. Use
        only synthetic or publicly available training materials.
      </AlertDescription>
    </Alert>
  );
}
