/** @vitest-environment happy-dom */

import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children?: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({
    resolvedTheme: 'light',
    setTheme: vi.fn(),
  }),
}));

vi.mock('@/app/(auth)/actions', () => ({
  signOut: vi.fn(),
}));

vi.mock('@/components/layout/actions', () => ({
  switchWorkspace: vi.fn(),
}));

vi.mock('@/components/layout/AppBreadcrumb', () => ({
  AppBreadcrumb: () => null,
}));

vi.mock('@/components/layout/AppSidebar', () => ({
  AppSidebar: () => null,
}));

import { AppTopBar } from '@/components/layout/AppTopBar';

const user = {
  id: 'user-1',
  name: 'Murray Test',
  email: 'murray@example.com',
  isAdmin: false,
  tenantId: 'tenant-1',
};

describe('AppTopBar user menu', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens the user menu without throwing when the trigger is clicked', async () => {
    const userInteractions = userEvent.setup();

    render(<AppTopBar user={user} workspaces={[]} />);

    await userInteractions.click(
      screen.getByRole('button', { name: 'User menu' })
    );

    await waitFor(() => {
      expect(screen.getByText('murray@example.com')).toBeInTheDocument();
    });

    expect(screen.getByText('Account Settings')).toBeInTheDocument();
    expect(screen.getByText('My Portfolio')).toBeInTheDocument();
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });
});
