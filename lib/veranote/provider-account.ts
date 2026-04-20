import { DEFAULT_PROVIDER_ACCOUNT_ID, findProviderAccount } from '@/lib/constants/provider-accounts';

export const CURRENT_PROVIDER_ACCOUNT_ID_KEY = 'veranote:current-provider-account-id';

export function getCurrentProviderAccountId() {
  if (typeof window === 'undefined') {
    return DEFAULT_PROVIDER_ACCOUNT_ID;
  }

  return window.localStorage.getItem(CURRENT_PROVIDER_ACCOUNT_ID_KEY) || DEFAULT_PROVIDER_ACCOUNT_ID;
}

export function setCurrentProviderAccountId(accountId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(CURRENT_PROVIDER_ACCOUNT_ID_KEY, accountId);
}

export function getCurrentProviderIdentityIdFromAccount() {
  const account = findProviderAccount(getCurrentProviderAccountId());
  return account?.providerIdentityId;
}
