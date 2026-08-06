import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppTopBar } from '@/components/layout/AppTopBar';
import { SkipLink } from '@/components/SkipLink';
import { getAppShellContext } from '@/lib/auth/appShell';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, activeTrack, trackLessons } = await getAppShellContext();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <SkipLink />
      <div className="hidden w-64 shrink-0 border-r border-border md:block">
        <AppSidebar
          isAdmin={user?.isAdmin ?? false}
          activeTrackSlug={activeTrack?.slug}
          activeTrackName={activeTrack?.name}
          trackLessons={trackLessons}
          className="sticky top-0 h-screen"
        />
      </div>
      <div className="flex min-h-screen flex-1 flex-col">
        {user ? (
          <AppTopBar
            user={user}
            activeTrackSlug={activeTrack?.slug}
            activeTrackName={activeTrack?.name}
            trackLessons={trackLessons}
          />
        ) : null}
        <div className="flex-1 space-y-4 p-4 md:p-6">
          <main id="content">{children}</main>
        </div>
      </div>
    </div>
  );
}
