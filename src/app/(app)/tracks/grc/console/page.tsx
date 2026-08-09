import type { Metadata } from 'next';

import { GrcComplianceConsole } from '@/components/consoles/grc/GrcComplianceConsole';
import { loadConsolePageData } from '@/lib/consoles/loadConsolePageData';

export const metadata: Metadata = {
  title: 'GRC Compliance Console',
  description:
    'Control assessment console — findings, POA&M items, and ConMon status.',
};

export default async function GrcConsolePage() {
  const data = await loadConsolePageData('grc');

  return (
    <div className="mx-auto max-w-[1400px]">
      <GrcComplianceConsole
        trackSlug="grc"
        trackName={data.trackName ?? 'GRC'}
        initialTickets={data.tickets}
        initialSource={data.source}
      />
    </div>
  );
}
