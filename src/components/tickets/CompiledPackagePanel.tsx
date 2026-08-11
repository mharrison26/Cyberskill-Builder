'use client';

import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type CompiledPackageArtifactView = {
  code: string;
  label: string;
  status: 'present' | 'missing' | 'incomplete' | string;
  summary: string;
  payload: Record<string, unknown> | null;
  progressStatus?: string | null;
};

export type CompiledPackageResponse = {
  complete?: boolean;
  missingCodes?: string[];
  artifacts?: CompiledPackageArtifactView[];
  compiledAt?: string;
  packageSource?: string | null;
  error?: string;
};

export function useCompiledPackage(ticketId: string): {
  pkg: CompiledPackageResponse | null;
  loading: boolean;
  loadError: string | null;
} {
  const [pkg, setPkg] = useState<CompiledPackageResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/tickets/${ticketId}/package`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        const data = (await res.json()) as CompiledPackageResponse;
        if (!res.ok) {
          throw new Error(data.error || 'Failed to compile package');
        }
        if (!cancelled) {
          setPkg(data);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Failed to load package'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [ticketId]);

  return { pkg, loading, loadError };
}

function statusTone(status: string): string {
  if (status === 'present')
    return 'bg-status-satisfied text-status-satisfied-foreground border-status-satisfied-foreground/20';
  if (status === 'incomplete')
    return 'bg-status-insufficient text-status-insufficient-foreground border-status-insufficient-foreground/20';
  return 'bg-muted text-muted-foreground';
}

type CompiledPackageArtifactsProps = {
  ticketId: string;
  pkg: CompiledPackageResponse | null;
  loading: boolean;
  loadError: string | null;
  heading?: string;
  description?: string;
  className?: string;
};

/**
 * Presentational list for a compiled GRC-03 / GRC-04 / GRC-09 package.
 */
export function CompiledPackageArtifacts({
  ticketId,
  pkg,
  loading,
  loadError,
  heading = 'Compiled authorization package',
  description = 'Read-only compilation of your GRC-03 SSP fragment, GRC-04 POA&M entries, and GRC-09 OSCAL generator artifacts, loaded by student and track.',
  className,
}: CompiledPackageArtifactsProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div
      className={cn('space-y-3', className)}
      data-compiled-package={ticketId}
    >
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{heading}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Compiling package…</p>
      ) : null}

      {loadError ? (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      {pkg?.artifacts ? (
        <ul className="space-y-3">
          {pkg.artifacts.map((artifact) => {
            const isOpen = expanded[artifact.code] ?? false;
            return (
              <li
                key={artifact.code}
                className="rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {artifact.code} — {artifact.label}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {artifact.summary}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn('capitalize', statusTone(artifact.status))}
                  >
                    {artifact.status}
                  </Badge>
                </div>
                {artifact.payload ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [artifact.code]: !isOpen,
                        }))
                      }
                    >
                      {isOpen ? 'Hide artifact JSON' : 'Show artifact JSON'}
                    </Button>
                    {isOpen ? (
                      <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/50 p-3 text-xs">
                        {JSON.stringify(artifact.payload, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {pkg ? (
        <p className="text-sm text-muted-foreground">
          {pkg.complete
            ? 'All required artifacts are present.'
            : `Incomplete — missing: ${(pkg.missingCodes ?? []).join(', ') || 'unknown'}.`}
          {pkg.packageSource ? ` Source: ${pkg.packageSource}.` : null}
          {pkg.compiledAt
            ? ` Compiled ${new Date(pkg.compiledAt).toLocaleString()}.`
            : null}
        </p>
      ) : null}
    </div>
  );
}

type CompiledPackagePanelProps = {
  ticketId: string;
  heading?: string;
  description?: string;
  className?: string;
};

/**
 * Self-fetching compiled-package panel for tickets that only need the view
 * (e.g. ao_review / sheet GRC-10). Prefer `useCompiledPackage` +
 * `CompiledPackageArtifacts` when the parent also needs package state.
 */
export function CompiledPackagePanel({
  ticketId,
  heading,
  description,
  className,
}: CompiledPackagePanelProps) {
  const { pkg, loading, loadError } = useCompiledPackage(ticketId);
  return (
    <CompiledPackageArtifacts
      ticketId={ticketId}
      pkg={pkg}
      loading={loading}
      loadError={loadError}
      heading={heading}
      description={description}
      className={className}
    />
  );
}
