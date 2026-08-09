import type { Metadata } from 'next';

import { IssmProgramConsole } from '@/components/consoles/issm/IssmProgramConsole';
import { loadConsolePageData } from '@/lib/consoles/loadConsolePageData';

export const metadata: Metadata = {
  title: 'ISSM Program Console',
  description:
    'Authorization portfolio, ISSO escalations, and package decision gates.',
};

export default async function IssmConsolePage() {
  const data = await loadConsolePageData('issm');

  return (
    <div className="mx-auto max-w-6xl">
      <IssmProgramConsole
        trackSlug="issm"
        initialTickets={data.tickets}
        initialSource={data.source}
      />
    </div>
  );
}
