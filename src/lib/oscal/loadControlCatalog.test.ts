import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getProcessedControl,
  listControlFamilies,
  listProcessedControls,
  loadProcessedControlCatalog,
  resetProcessedCatalogCacheForTests,
} from '@/lib/oscal/loadControlCatalog';

describe('loadProcessedControlCatalog', () => {
  afterEach(() => {
    resetProcessedCatalogCacheForTests();
    vi.restoreAllMocks();
    vi.doUnmock('node:fs');
  });

  it('loads the full Rev 5 control set with baselines', () => {
    const catalog = loadProcessedControlCatalog();
    expect(catalog.controls.length).toBeGreaterThan(1000);
    expect(catalog.families).toHaveLength(20);
    expect(catalog.source.version).toBe('5.2.0');
  });

  it('returns an empty catalog instead of throwing when the file is missing', async () => {
    vi.resetModules();
    vi.doMock('node:fs', async () => {
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
      return {
        ...actual,
        readFileSync: () => {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        },
      };
    });

    const mod = await import('@/lib/oscal/loadControlCatalog');
    mod.resetProcessedCatalogCacheForTests();
    const catalog = mod.loadProcessedControlCatalog();
    expect(catalog.controls).toEqual([]);
    expect(mod.getProcessedControl('AC-2')).toBeNull();
  });

  it('resolves AC-2 aliases and baselines', () => {
    const byId = getProcessedControl('ac-2');
    const byLabel = getProcessedControl('AC-2');
    expect(byId?.title).toBe('Account Management');
    expect(byLabel?.id).toBe(byId?.id);
    expect(byId?.baselines).toEqual(['low', 'moderate', 'high']);
    expect(byId?.enhancement_ids.length).toBeGreaterThan(0);
  });

  it('lists families for filters', () => {
    const families = listControlFamilies();
    expect(families).toContain('Access Control');
    expect(listProcessedControls().length).toBeGreaterThan(1000);
  });
});
