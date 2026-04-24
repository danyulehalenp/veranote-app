import { describe, expect, it } from 'vitest';
import { normalizeSafeCallbackPath } from '@/lib/veranote/auth-redirect';

describe('auth redirect helper', () => {
  it('allows internal app paths', () => {
    expect(normalizeSafeCallbackPath('/dashboard/review')).toBe('/dashboard/review');
    expect(normalizeSafeCallbackPath('/dashboard/review?draft=123')).toBe('/dashboard/review?draft=123');
  });

  it('falls back for empty or malformed values', () => {
    expect(normalizeSafeCallbackPath('')).toBe('/');
    expect(normalizeSafeCallbackPath(undefined)).toBe('/');
    expect(normalizeSafeCallbackPath('dashboard/review')).toBe('/');
  });

  it('rejects protocol-relative and external-looking destinations', () => {
    expect(normalizeSafeCallbackPath('//evil.example')).toBe('/');
    expect(normalizeSafeCallbackPath('https://evil.example')).toBe('/');
    expect(normalizeSafeCallbackPath('http://evil.example')).toBe('/');
  });

  it('uses the provided fallback when a destination is rejected', () => {
    expect(normalizeSafeCallbackPath('https://evil.example', '/dashboard/new-note')).toBe('/dashboard/new-note');
  });
});

