import type { Metadata } from 'next';

import { IssoOpsConsole } from '@/components/consoles/isso/IssoOpsConsole';
import { loadConsolePageData } from '@/lib/consoles/loadConsolePageData';

export const metadata: Metadata = {
  title: 'ISSO Operations Console',
  description:
    'System stewardship workbench — evidence, POA&M, and ConMon for systems you own.',
};

export default async function IssoConsolePage() {
  const data = await loadConsolePageData('isso');

  return (
    <div className="mx-auto max-w-6xl">
      <IssoOpsConsole
        trackSlug="isso"
        initialTickets={data.tickets}
        initialSource={data.source}
      />
    </div>
  );
}
