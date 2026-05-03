import { describe, expect, it } from 'vitest';

import { resolvePrototypeDataDir, resolvePrototypeDbPath } from '@/lib/db/client';

describe('prototype db path resolution', () => {
  it('uses the local project data directory outside serverless runtime', () => {
    expect(resolvePrototypeDataDir({}, '/workspace/app')).toBe('/workspace/app/.prototype-data');
    expect(resolvePrototypeDbPath({}, '/workspace/app')).toBe('/workspace/app/.prototype-data/prototype-db.json');
  });

  it('uses writable tmp storage on Vercel/serverless when no explicit path is configured', () => {
    expect(resolvePrototypeDataDir({ VERCEL: '1' }, '/workspace/app')).toMatch(/veranote-prototype-data$/);
    expect(resolvePrototypeDbPath({ VERCEL: '1' }, '/workspace/app')).toMatch(/veranote-prototype-data\/prototype-db\.json$/);
  });

  it('honors explicit prototype storage overrides', () => {
    expect(resolvePrototypeDataDir({ PROTOTYPE_DATA_DIR: '/custom/data', VERCEL: '1' }, '/workspace/app')).toBe('/custom/data');
    expect(resolvePrototypeDbPath({ PROTOTYPE_DB_PATH: '/custom/db.json', VERCEL: '1' }, '/workspace/app')).toBe('/custom/db.json');
  });
});
