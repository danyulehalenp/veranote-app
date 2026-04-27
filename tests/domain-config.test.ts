import { describe, expect, it } from 'vitest';
import { getAppBaseUrl, getRequestOrigin, getRuntimeAuthBaseUrl } from '@/lib/veranote/domain-config';

describe('domain config', () => {
  it('uses the active preview host instead of a production-pinned auth url', () => {
    expect(getAppBaseUrl({
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      NEXTAUTH_URL: 'https://app.veranote.org',
      NEXT_PUBLIC_APP_URL: 'https://app.veranote.org',
      VERCEL_URL: 'veranote-app-git-feature-team.vercel.app',
    })).toBe('https://veranote-app-git-feature-team.vercel.app');
  });

  it('uses the configured local port for development when no canonical url is set', () => {
    expect(getAppBaseUrl({
      NODE_ENV: 'development',
      PORT: '3001',
    })).toBe('http://localhost:3001');
  });

  it('derives the current request origin from forwarded headers', () => {
    expect(getRequestOrigin({
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'veranote-app-git-feature-team.vercel.app',
    })).toBe('https://veranote-app-git-feature-team.vercel.app');
  });

  it('prefers the live request host for preview auth redirects', () => {
    expect(getRuntimeAuthBaseUrl({
      baseUrl: 'https://app.veranote.org',
      headersLike: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'veranote-app-git-feature-team.vercel.app',
      },
      env: {
        NODE_ENV: 'production',
        VERCEL_ENV: 'preview',
      },
    })).toBe('https://veranote-app-git-feature-team.vercel.app');
  });

  it('keeps the production domain when the request host already matches', () => {
    expect(getRuntimeAuthBaseUrl({
      baseUrl: 'https://app.veranote.org',
      headersLike: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'app.veranote.org',
      },
      env: {
        NODE_ENV: 'production',
      },
    })).toBe('https://app.veranote.org');
  });
});
