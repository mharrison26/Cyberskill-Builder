import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Admin',
  description: 'Administration dashboard.',
};

const ADMIN_LINKS = [
  {
    href: '/admin/tracks',
    title: 'Tracks',
    description: 'Create learning tracks and update catalog pricing.',
  },
  {
    href: '/admin/lessons',
    title: 'Lessons',
    description: 'Manage lesson content, ordering, and publication status.',
  },
  {
    href: '/admin/grading',
    title: 'Grading Queue',
    description: 'Review student submissions and AI-generated findings.',
  },
];

export default function AdminHomePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Administration</h1>
        <p className="mt-1 text-muted-foreground">
          Manage lessons, review submissions, and monitor platform content.
        </p>
      </header>

      <div className="grid gap-4">
        {ADMIN_LINKS.map((link) => (
          <Card key={link.href}>
            <CardHeader>
              <CardTitle className="text-base">{link.title}</CardTitle>
              <CardDescription>{link.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href={link.href}>
                <Button variant="outline">Open {link.title}</Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
