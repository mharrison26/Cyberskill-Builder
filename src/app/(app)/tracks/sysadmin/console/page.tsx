import type { Metadata } from 'next';

import { SysadminNocConsole } from '@/components/consoles/sysadmin/SysadminNocConsole';
import { loadConsolePageData } from '@/lib/consoles/loadConsolePageData';

export const metadata: Metadata = {
  title: 'NOC Wall',
  description: 'IT Admin system health wall and incident feed.',
};

export default async function SysadminConsolePage() {
  const data = await loadConsolePageData('sysadmin');

  return (
    <div className="mx-auto max-w-6xl">
      <SysadminNocConsole
        trackSlug="sysadmin"
        initialTickets={data.tickets}
        initialSource={data.source}
      />
    </div>
  );
}
