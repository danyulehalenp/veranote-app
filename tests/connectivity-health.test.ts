import { describe, expect, it } from 'vitest';
import {
  buildConfigurationChecks,
  getOverallConnectivityStatus,
  type ConnectivityCheck,
} from '@/lib/veranote/connectivity-health';

describe('connectivity health', () => {
  it('reports healthy config when durable storage, auth, beta access, and AI are configured', () => {
    const checks = buildConfigurationChecks({
      VERANOTE_DB_BACKEND: 'supabase',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      AUTH_SECRET: 'auth-secret',
      NEXTAUTH_URL: 'https://app.veranote.org',
      VERANOTE_BETA_ACCESS_CODE: 'beta-code',
      OPENAI_API_KEY: 'openai-key',
    }, '2026-05-16T00:00:00.000Z');

    expect(checks.map((check) => [check.id, check.status])).toEqual([
      ['durable-storage-mode', 'healthy'],
      ['supabase-server-env', 'healthy'],
      ['supabase-public-env', 'healthy'],
      ['auth-config', 'healthy'],
      ['ai-provider-config', 'healthy'],
    ]);
  });

  it('warns when production persistence would fall back to prototype storage', () => {
    const checks = buildConfigurationChecks({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      AUTH_SECRET: 'auth-secret',
      NEXTAUTH_URL: 'https://app.veranote.org',
      VERANOTE_BETA_ACCESS_CODE: 'beta-code',
    }, '2026-05-16T00:00:00.000Z');

    expect(checks.find((check) => check.id === 'durable-storage-mode')?.status).toBe('warning');
    expect(checks.find((check) => check.id === 'ai-provider-config')?.status).toBe('warning');
  });

  it('marks missing Supabase server credentials and auth as critical', () => {
    const checks = buildConfigurationChecks({
      VERANOTE_DB_BACKEND: 'supabase',
    }, '2026-05-16T00:00:00.000Z');

    expect(checks.find((check) => check.id === 'supabase-server-env')?.status).toBe('critical');
    expect(checks.find((check) => check.id === 'auth-config')?.status).toBe('critical');
  });

  it('rolls up the worst check status', () => {
    const checks: ConnectivityCheck[] = [
      { id: 'a', label: 'A', status: 'healthy', summary: 'ok', checkedAt: 'now' },
      { id: 'b', label: 'B', status: 'warning', summary: 'watch', checkedAt: 'now' },
      { id: 'c', label: 'C', status: 'critical', summary: 'fix', checkedAt: 'now' },
    ];

    expect(getOverallConnectivityStatus(checks)).toBe('critical');
  });
});
