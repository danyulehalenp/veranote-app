import type { ProviderAccount } from '@/types/provider-account';

export const providerAccounts: ProviderAccount[] = [
  {
    id: 'account-brandy-norris-beta',
    providerIdentityId: 'provider-brandy-norris-beta',
    email: 'brandy.norris@veranote-beta.local',
    organizationName: 'Veranote Beta Psychiatry Group',
    roleLabel: 'PMHNP-BC',
    status: 'active',
  },
  {
    id: 'account-brandi-stalnaker-beta',
    providerIdentityId: 'provider-brandi-stalnaker-beta',
    email: 'brandi.stalnaker@veranote-beta.local',
    organizationName: 'Veranote Beta Psychiatry Group',
    roleLabel: 'PMHNP-BC',
    status: 'active',
  },
  {
    id: 'account-stacey-creel-beta',
    providerIdentityId: 'provider-stacey-creel-beta',
    email: 'stacey.creel@veranote-beta.local',
    organizationName: 'Veranote Beta Psychiatry Group',
    roleLabel: 'PMHNP-BC',
    status: 'active',
  },
  {
    id: 'account-tori-hogg-beta',
    providerIdentityId: 'provider-tori-hogg-beta',
    email: 'tori.hogg@veranote-beta.local',
    organizationName: 'Veranote Beta Psychiatry Group',
    roleLabel: 'PMHNP-BC',
    status: 'active',
  },
  {
    id: 'account-daniel-hale-beta',
    providerIdentityId: 'provider-daniel-hale-beta',
    email: 'daniel.hale@veranote-beta.local',
    organizationName: 'Veranote Beta Psychiatry and Medical Group',
    roleLabel: 'PMHNP-BC, FNP-C',
    status: 'active',
  },
];

export const DEFAULT_PROVIDER_ACCOUNT_ID = providerAccounts[0]?.id || 'account-default';

export function findProviderAccount(accountId?: string | null) {
  return providerAccounts.find((account) => account.id === accountId) || providerAccounts[0] || null;
}
