import { AppHeaderErrorBoundary } from '@/components/layout/AppHeaderErrorBoundary';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { AppTopBar } from '@/components/layout/AppTopBar';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { SkipLink } from '@/components/SkipLink';
import { getAppShellContext } from '@/lib/auth/appShell';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, activeTrack, trackLessons, enrollments, workspaces } =
    await getAppShellContext();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <SkipLink />
      <div className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <AppSidebar
          isAdmin={user?.isAdmin ?? false}
          activeTrackSlug={activeTrack?.slug}
          activeTrackName={activeTrack?.name}
          trackLessons={trackLessons}
          enrollments={enrollments}
          className="sticky top-0 h-screen"
        />
      </div>
      <div className="flex min-h-screen flex-1 flex-col">
        {user ? (
          <AppHeaderErrorBoundary>
            <AppTopBar
              user={user}
              activeTrackSlug={activeTrack?.slug}
              activeTrackName={activeTrack?.name}
              trackLessons={trackLessons}
              enrollments={enrollments}
              workspaces={workspaces}
            />
          </AppHeaderErrorBoundary>
        ) : null}
        <div className="flex-1 space-y-4 p-4 md:p-6">
          <main id="content">{children}</main>
        </div>
        <PublicFooter />
      </div>
    </div>
  );
}
