import { execSync } from 'node:child_process';

import { OSCAL_CATALOG_PATH } from '@/lib/oscal/getControl';

export type CatalogSourceMetadata = {
  catalogPath: string;
  gitCommitSha: string;
};

export function getCatalogSourceMetadata(): CatalogSourceMetadata {
  return {
    catalogPath: OSCAL_CATALOG_PATH,
    gitCommitSha: resolveGitCommitSha(),
  };
}

function resolveGitCommitSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA;
  }

  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}
