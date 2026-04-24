import { describe, expect, it } from 'vitest';
import { assertSafeBetaRuntimeConfig, getBetaRuntimeConfigIssues } from '@/lib/veranote/runtime-config';

describe('runtime config guard', () => {
  it('allows safe production beta config', () => {
    expect(() => assertSafeBetaRuntimeConfig({
      NODE_ENV: 'production',
      AUTH_SECRET: 'super-secret',
      VERANOTE_BETA_ACCESS_CODE: 'beta-code',
      NEXT_PUBLIC_VERANOTE_INTERNAL_MODE: 'false',
      VERANOTE_INTERNAL_MODE: 'false',
    })).not.toThrow();
  });

  it('blocks production without an auth secret', () => {
    expect(() => assertSafeBetaRuntimeConfig({
      NODE_ENV: 'production',
      VERANOTE_BETA_ACCESS_CODE: 'beta-code',
    })).toThrow(/AUTH_SECRET/);
  });

  it('blocks production without beta access codes', () => {
    expect(() => assertSafeBetaRuntimeConfig({
      NODE_ENV: 'production',
      AUTH_SECRET: 'super-secret',
    })).toThrow(/beta access code/i);
  });

  it('blocks production when internal mode is enabled', () => {
    expect(() => assertSafeBetaRuntimeConfig({
      NODE_ENV: 'production',
      AUTH_SECRET: 'super-secret',
      VERANOTE_BETA_ACCESS_CODE: 'beta-code',
      NEXT_PUBLIC_VERANOTE_INTERNAL_MODE: 'true',
    })).toThrow(/Internal mode/);
  });

  it('reports issues in non-production without throwing', () => {
    const issues = getBetaRuntimeConfigIssues({
      NODE_ENV: 'development',
      NEXT_PUBLIC_VERANOTE_INTERNAL_MODE: 'true',
    });

    expect(issues).toHaveLength(0);
    expect(() => assertSafeBetaRuntimeConfig({
      NODE_ENV: 'development',
      NEXT_PUBLIC_VERANOTE_INTERNAL_MODE: 'true',
    })).not.toThrow();
  });

  it('does not throw during the production build phase', () => {
    expect(() => assertSafeBetaRuntimeConfig({
      NODE_ENV: 'production',
      NEXT_PHASE: 'phase-production-build',
    })).not.toThrow();
  });
});
