import type { Metadata } from 'next';

import { PythonDevConsole } from '@/components/consoles/python/PythonDevConsole';
import { loadConsolePageData } from '@/lib/consoles/loadConsolePageData';

export const metadata: Metadata = {
  title: 'Python Dev Console',
  description: 'Issue tracker with WebContainer editor and terminal.',
};

export default async function PythonConsolePage() {
  const data = await loadConsolePageData('python');

  return (
    <div className="mx-auto max-w-[1400px]">
      <PythonDevConsole
        trackSlug="python"
        initialTickets={data.tickets}
        initialSource={data.source}
      />
    </div>
  );
}
