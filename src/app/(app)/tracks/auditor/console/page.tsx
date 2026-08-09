import type { Metadata } from 'next';

import { AuditorConsole } from '@/components/consoles/auditor/AuditorConsole';
import { loadConsolePageData } from '@/lib/consoles/loadConsolePageData';

export const metadata: Metadata = {
  title: 'Auditor Workpapers',
  description: 'Engagement folders and checklist-style workpapers.',
};

export default async function AuditorConsolePage() {
  const data = await loadConsolePageData('auditor');

  return (
    <AuditorConsole
      trackSlug="auditor"
      initialTickets={data.tickets}
      initialSource={data.source}
    />
  );
}
