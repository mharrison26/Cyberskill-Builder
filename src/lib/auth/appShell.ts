import { createClient } from '@/lib/supabase/server';
import type { StatusKey } from '@/lib/status';
import {
  getUserWorkspaces,
  type WorkspaceOption,
} from '@/lib/tenants/workspaces';

export type AppShellUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  tenantId: string | null;
};

export type SidebarLesson = {
  id: string;
  title: string;
};

export type SidebarTrack = {
  slug: string;
  name: string;
  hasTickets: boolean;
};

export type AppShellContext = {
  user: AppShellUser | null;
  activeTrack: SidebarTrack | null;
  trackLessons: SidebarLesson[];
  /** All active enrollments for console / track nav. */
  enrollments: SidebarTrack[];
  workspaces: WorkspaceOption[];
};

function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export async function getAppShellContext(): Promise<AppShellContext> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return {
      user: null,
      activeTrack: null,
      trackLessons: [],
      enrollments: [],
      workspaces: [],
    };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, is_admin, tenant_id')
    .eq('id', authUser.id)
    .maybeSingle();

  if (!profile) {
    return {
      user: null,
      activeTrack: null,
      trackLessons: [],
      enrollments: [],
      workspaces: [],
    };
  }

  const shellUser: AppShellUser = {
    id: profile.id,
    name: displayNameFromEmail(profile.email),
    email: profile.email,
    isAdmin: profile.is_admin === true,
    tenantId: (profile.tenant_id as string | null) ?? null,
  };

  const workspaces = await getUserWorkspaces(
    supabase,
    profile.id,
    shellUser.tenantId
  );

  const { data: enrollmentRows } = await supabase
    .from('track_enrollments')
    .select('track_id, tracks ( slug, name )')
    .eq('student_id', profile.id)
    .eq('status', 'active')
    .order('purchased_at', { ascending: true });

  const trackIds = (enrollmentRows ?? [])
    .map((row) => row.track_id as string)
    .filter(Boolean);

  const ticketTrackIds = new Set<string>();
  if (trackIds.length > 0) {
    const { data: ticketRows } = await supabase
      .from('tickets')
      .select('track_id')
      .in('track_id', trackIds);
    for (const row of ticketRows ?? []) {
      ticketTrackIds.add(row.track_id as string);
    }
  }

  const enrollments: SidebarTrack[] = (enrollmentRows ?? [])
    .map((row) => {
      const track = row.tracks as
        | { slug: string; name: string }
        | { slug: string; name: string }[]
        | null;
      const resolved = Array.isArray(track) ? track[0] : track;
      if (!resolved?.slug) return null;
      return {
        slug: resolved.slug,
        name: resolved.name,
        hasTickets: ticketTrackIds.has(row.track_id as string),
      } satisfies SidebarTrack;
    })
    .filter((row): row is SidebarTrack => Boolean(row));

  // Always expose known console routes even before enrollment (discoverability).
  const CONSOLE_TRACKS: Array<{ slug: string; name: string }> = [
    { slug: 'grc', name: 'GRC' },
    { slug: 'helpdesk', name: 'HelpDesk' },
    { slug: 'sysadmin', name: 'IT Admin' },
    { slug: 'auditor', name: 'IT Auditor' },
    { slug: 'python', name: 'Python' },
    { slug: 'isso', name: 'ISSO' },
    { slug: 'issm', name: 'ISSM' },
  ];

  const enrollmentSlugs = new Set(enrollments.map((e) => e.slug));
  const consoleTracks: SidebarTrack[] = CONSOLE_TRACKS.map((track) => {
    const enrolled = enrollments.find((e) => e.slug === track.slug);
    return (
      enrolled ?? {
        slug: track.slug,
        name: track.name,
        hasTickets: false,
      }
    );
  });

  // Prefer enrolled tracks first, then remaining console routes.
  const navTracks = [
    ...enrollments,
    ...consoleTracks.filter((t) => !enrollmentSlugs.has(t.slug)),
  ];

  const activeTrack = enrollments[0] ?? null;

  if (!activeTrack) {
    return {
      user: shellUser,
      activeTrack: null,
      trackLessons: [],
      enrollments: navTracks,
      workspaces,
    };
  }

  const activeEnrollment = (enrollmentRows ?? []).find((row) => {
    const track = row.tracks as
      | { slug: string }
      | { slug: string }[]
      | null;
    const resolved = Array.isArray(track) ? track[0] : track;
    return resolved?.slug === activeTrack.slug;
  });

  const { data: lessons } = activeEnrollment?.track_id
    ? await supabase
        .from('lessons')
        .select('id, title')
        .eq('track_id', activeEnrollment.track_id)
        .order('sort_order', { ascending: true })
    : { data: [] };

  return {
    user: shellUser,
    activeTrack,
    trackLessons: lessons ?? [],
    enrollments: navTracks,
    workspaces,
  };
}

export function mapLessonProgressStatus(
  dbStatus: string | null | undefined
): StatusKey {
  switch (dbStatus) {
    case 'completed':
    case 'reviewed':
    case 'graded':
      return 'graded';
    case 'submitted':
      return 'submitted';
    case 'in_progress':
      return 'in_progress';
    case 'not_started':
    default:
      return 'not_started';
  }
}
