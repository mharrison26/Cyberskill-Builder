import type { Metadata } from 'next';

import { HelpdeskConsole } from '@/components/consoles/helpdesk/HelpdeskConsole';
import { loadConsolePageData } from '@/lib/consoles/loadConsolePageData';

export const metadata: Metadata = {
  title: 'HelpDesk Queue',
  description: 'Service desk ticket queue with SLA-driven triage.',
};

export default async function HelpdeskConsolePage() {
  const data = await loadConsolePageData('helpdesk');

  return (
    <div className="mx-auto max-w-5xl">
      <HelpdeskConsole
        trackSlug="helpdesk"
        initialTickets={data.tickets}
        initialSource={data.source}
      />
    </div>
  );
}
