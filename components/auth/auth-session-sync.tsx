'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { setCurrentProviderAccountId } from '@/lib/veranote/provider-account';
import { setCurrentProviderId } from '@/lib/veranote/provider-identity';

export function AuthSessionSync() {
  const { data } = useSession();

  useEffect(() => {
    const providerAccountId = data?.user?.providerAccountId;
    const providerIdentityId = data?.user?.providerIdentityId;

    if (!providerAccountId || !providerIdentityId) {
      return;
    }

    setCurrentProviderAccountId(providerAccountId);
    setCurrentProviderId(providerIdentityId);
  }, [data?.user?.providerAccountId, data?.user?.providerIdentityId]);

  return null;
}
