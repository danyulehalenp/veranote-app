import { describe, expect, it } from 'vitest';

import { resolvePrototypeDataDir, resolvePrototypeDbPath, shouldUseDurableSupabaseStorage } from '@/lib/db/client';

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

  it('requires an explicit durable storage flag before using Supabase', () => {
    expect(shouldUseDurableSupabaseStorage({
      VERCEL: '1',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    })).toBe(false);

    expect(shouldUseDurableSupabaseStorage({
      VERANOTE_DB_BACKEND: 'supabase',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    })).toBe(true);

    expect(shouldUseDurableSupabaseStorage({
      VERANOTE_DB_BACKEND: 'prototype',
      VERANOTE_USE_SUPABASE_DB: '1',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    })).toBe(false);
  });
});
