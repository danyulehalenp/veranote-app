import { afterEach, describe, expect, it } from 'vitest';
import { authenticateProviderCredentials, findProviderAccountByEmail, getConfiguredAccessCodeForAccount, parseProviderAccessCodeMap } from '@/lib/veranote/provider-auth';

const originalSharedCode = process.env.VERANOTE_BETA_ACCESS_CODE;
const originalCodeMap = process.env.VERANOTE_BETA_ACCOUNT_CODES;

afterEach(() => {
  process.env.VERANOTE_BETA_ACCESS_CODE = originalSharedCode;
  process.env.VERANOTE_BETA_ACCOUNT_CODES = originalCodeMap;
});

describe('provider auth helper', () => {
  it('finds seeded beta providers by email', () => {
    const account = findProviderAccountByEmail('Brandy.Norris@veranote-beta.local');
    expect(account?.id).toBe('account-brandy-norris-beta');
  });

  it('parses per-provider code maps safely', () => {
    const parsed = parseProviderAccessCodeMap(JSON.stringify({
      'account-brandy-norris-beta': 'brandy-secret',
      'Stacey.Creel@veranote-beta.local': 'stacey-secret',
      ignoreMe: 123,
    }));

    expect(parsed['account-brandy-norris-beta']).toBe('brandy-secret');
    expect(parsed['stacey.creel@veranote-beta.local']).toBe('stacey-secret');
    expect(parsed['ignoreme']).toBeUndefined();
  });

  it('prefers account-specific codes over the shared beta code', () => {
    process.env.VERANOTE_BETA_ACCESS_CODE = 'shared-code';
    process.env.VERANOTE_BETA_ACCOUNT_CODES = JSON.stringify({
      'account-brandy-norris-beta': 'brandy-secret',
      'stacey.creel@veranote-beta.local': 'stacey-secret',
    });

    expect(getConfiguredAccessCodeForAccount('account-brandy-norris-beta')).toBe('brandy-secret');
    expect(getConfiguredAccessCodeForAccount('stacey.creel@veranote-beta.local')).toBe('stacey-secret');
    expect(getConfiguredAccessCodeForAccount('account-daniel-hale-beta')).toBe('shared-code');
  });

  it('authenticates a seeded beta provider with the configured code', () => {
    process.env.VERANOTE_BETA_ACCESS_CODE = 'shared-code';

    const user = authenticateProviderCredentials('brandy.norris@veranote-beta.local', 'shared-code');
    expect(user?.providerAccountId).toBe('account-brandy-norris-beta');
    expect(user?.providerIdentityId).toBe('provider-brandy-norris-beta');
    expect(user?.organizationName).toContain('Veranote Beta');
  });

  it('rejects bad beta access codes', () => {
    process.env.VERANOTE_BETA_ACCESS_CODE = 'shared-code';
    const user = authenticateProviderCredentials('brandy.norris@veranote-beta.local', 'wrong-code');
    expect(user).toBeNull();
  });
});
