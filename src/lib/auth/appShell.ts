import { createClient } from '@/lib/supabase/server';
import type { StatusKey } from '@/lib/status';

export type AppShellUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
};

export type SidebarLesson = {
  id: string;
  title: string;
};

export type SidebarTrack = {
  slug: string;
  name: string;
};

export type AppShellContext = {
  user: AppShellUser | null;
  activeTrack: SidebarTrack | null;
  trackLessons: SidebarLesson[];
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
    return { user: null, activeTrack: null, trackLessons: [] };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, is_admin')
    .eq('id', authUser.id)
    .maybeSingle();

  if (!profile) {
    return { user: null, activeTrack: null, trackLessons: [] };
  }

  const shellUser: AppShellUser = {
    id: profile.id,
    name: displayNameFromEmail(profile.email),
    email: profile.email,
    isAdmin: profile.is_admin === true,
  };

  const { data: enrollment } = await supabase
    .from('track_enrollments')
    .select('track_id, tracks ( slug, name )')
    .eq('student_id', profile.id)
    .eq('status', 'active')
    .order('purchased_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const track = enrollment?.tracks as SidebarTrack | null | undefined;

  if (!enrollment?.track_id || !track) {
    return { user: shellUser, activeTrack: null, trackLessons: [] };
  }

  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, title')
    .eq('track_id', enrollment.track_id)
    .order('sort_order', { ascending: true });

  return {
    user: shellUser,
    activeTrack: track,
    trackLessons: lessons ?? [],
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
