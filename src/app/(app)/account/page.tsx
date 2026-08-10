import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { DisplayNameForm } from '@/components/account/DisplayNameForm';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { getUserDisplayName } from '@/lib/users/displayName';

export const metadata: Metadata = {
  title: 'Account settings',
  description: 'Manage your preferred name and account preferences.',
};

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect('/sign-in');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, email, display_name')
    .eq('id', authUser.id)
    .maybeSingle();

  if (!profile) {
    redirect('/checkout');
  }

  const displayName = getUserDisplayName({
    display_name: profile.display_name,
  });

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Account settings</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {profile.email}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Preferred name</CardTitle>
          <CardDescription>
            What should we call you? Shown as-is in &quot;Welcome back&quot;,
            the header, and your portfolio. Until you set one, we greet you as
            &quot;there&quot; — never a name invented from your email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DisplayNameForm initialDisplayName={displayName} />
        </CardContent>
      </Card>
    </div>
  );
}
