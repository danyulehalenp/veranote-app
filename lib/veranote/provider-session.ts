import { auth } from '@/auth';
import { DEFAULT_PROVIDER_ACCOUNT_ID, findProviderAccount } from '@/lib/constants/provider-accounts';
import { DEFAULT_PROVIDER_IDENTITY_ID } from '@/lib/constants/provider-identities';
import { getCurrentProviderAccountId, getCurrentProviderIdentityId } from '@/lib/db/client';
import { INTERNAL_MODE_ENABLED } from '@/lib/veranote/access-mode';

export type AuthorizedProviderContext = {
  providerAccountId: string;
  providerIdentityId: string;
};

function prototypeFallbackEnabled() {
  return process.env.NODE_ENV !== 'production' || INTERNAL_MODE_ENABLED;
}

export function prototypeSwitchingAllowed() {
  return prototypeFallbackEnabled();
}

export function resolveScopedProviderIdentityId(requestedProviderId: string | undefined, authorizedProviderId: string) {
  return prototypeSwitchingAllowed() ? (requestedProviderId || authorizedProviderId) : authorizedProviderId;
}

export async function getAuthorizedProviderContext(): Promise<AuthorizedProviderContext | null> {
  const session = await auth();
  const sessionProviderAccountId = session?.user?.providerAccountId;
  const sessionProviderIdentityId = session?.user?.providerIdentityId;

  if (sessionProviderAccountId && sessionProviderIdentityId) {
    return {
      providerAccountId: sessionProviderAccountId,
      providerIdentityId: sessionProviderIdentityId,
    };
  }

  if (!prototypeFallbackEnabled()) {
    return null;
  }

  const fallbackAccountId = await getCurrentProviderAccountId();
  const fallbackAccount = findProviderAccount(fallbackAccountId) || findProviderAccount(DEFAULT_PROVIDER_ACCOUNT_ID);

  return {
    providerAccountId: fallbackAccount?.id || DEFAULT_PROVIDER_ACCOUNT_ID,
    providerIdentityId: fallbackAccount?.providerIdentityId || await getCurrentProviderIdentityId() || DEFAULT_PROVIDER_IDENTITY_ID,
  };
}
