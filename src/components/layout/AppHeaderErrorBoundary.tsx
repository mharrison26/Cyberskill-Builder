'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type AppHeaderErrorBoundaryProps = {
  children: ReactNode;
};

type AppHeaderErrorBoundaryState = {
  hasError: boolean;
};

/**
 * Isolates header/menu failures so a client exception in the top bar
 * does not white-screen the rest of the app shell.
 */
export class AppHeaderErrorBoundary extends Component<
  AppHeaderErrorBoundaryProps,
  AppHeaderErrorBoundaryState
> {
  state: AppHeaderErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppHeaderErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App header error boundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <header className="flex h-14 items-center border-b border-border bg-card px-4 md:px-6">
          <p className="text-sm text-muted-foreground">
            Navigation unavailable. Refresh the page to try again.
          </p>
        </header>
      );
    }

    return this.props.children;
  }
}
