'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_PROVIDER_ACCOUNT_ID, findProviderAccount, providerAccounts } from '@/lib/constants/provider-accounts';
import { findProviderIdentity } from '@/lib/constants/provider-identities';
import { setCurrentProviderAccountId } from '@/lib/veranote/provider-account';
import { CURRENT_PROVIDER_ID_KEY, setCurrentProviderId } from '@/lib/veranote/provider-identity';

export function ProviderIdentitySwitcher() {
  const [isMounted, setIsMounted] = useState(false);
  const [currentProviderAccountId, setCurrentProviderAccountIdState] = useState(DEFAULT_PROVIDER_ACCOUNT_ID);
  const activeAccount = findProviderAccount(currentProviderAccountId);
  const activeIdentity = findProviderIdentity(activeAccount?.providerIdentityId);

  useEffect(() => {
    setIsMounted(true);
    const localProviderId = typeof window !== 'undefined'
      ? window.localStorage.getItem(CURRENT_PROVIDER_ID_KEY)
      : null;
    const localProviderAccountId = typeof window !== 'undefined'
      ? window.localStorage.getItem('veranote:current-provider-account-id')
      : null;

    if (localProviderId && localProviderAccountId) {
      setCurrentProviderAccountIdState(localProviderAccountId);
      return;
    }

    async function hydrateIdentity() {
      try {
        const response = await fetch('/api/provider-accounts', { cache: 'no-store' });
        const data = (await response.json()) as { currentProviderAccountId?: string; currentProviderIdentityId?: string };
        const nextAccountId = data.currentProviderAccountId || DEFAULT_PROVIDER_ACCOUNT_ID;
        const nextIdentityId = data.currentProviderIdentityId || findProviderAccount(nextAccountId)?.providerIdentityId;
        setCurrentProviderAccountId(nextAccountId);
        setCurrentProviderAccountIdState(nextAccountId);
        if (nextIdentityId) {
          setCurrentProviderId(nextIdentityId);
        }
      } catch {
        setCurrentProviderAccountId(DEFAULT_PROVIDER_ACCOUNT_ID);
        setCurrentProviderAccountIdState(DEFAULT_PROVIDER_ACCOUNT_ID);
        const nextIdentityId = findProviderAccount(DEFAULT_PROVIDER_ACCOUNT_ID)?.providerIdentityId;
        if (nextIdentityId) {
          setCurrentProviderId(nextIdentityId);
        }
      }
    }

    void hydrateIdentity();
  }, []);

  async function handleChange(nextProviderAccountId: string) {
    const nextAccount = findProviderAccount(nextProviderAccountId);
    const nextProviderId = nextAccount?.providerIdentityId;
    setCurrentProviderAccountId(nextProviderAccountId);
    setCurrentProviderAccountIdState(nextProviderAccountId);
    if (nextProviderId) {
      setCurrentProviderId(nextProviderId);
    }

    try {
      await fetch('/api/provider-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerAccountId: nextProviderAccountId }),
      });
    } catch {
      // Local provider switching still matters even if backend persistence is unavailable.
    }

    window.location.reload();
  }

  if (!isMounted) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-full border border-cyan-200/10 bg-[rgba(13,30,50,0.68)] px-3 py-2 text-xs text-cyan-50/84">
        <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Provider</span>
        <div className="rounded-full border border-cyan-200/15 bg-[rgba(4,12,24,0.62)] px-3 py-1.5 text-sm text-cyan-50/72">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-full border border-cyan-200/10 bg-[rgba(13,30,50,0.68)] px-3 py-2 text-xs text-cyan-50/84">
      <span className="font-semibold uppercase tracking-[0.14em] text-slate-500">Provider</span>
      <select
        value={currentProviderAccountId}
        onChange={(event) => void handleChange(event.target.value)}
        className="rounded-full border border-cyan-200/15 bg-[rgba(4,12,24,0.62)] px-3 py-1.5 text-sm text-cyan-50 outline-none"
      >
        {providerAccounts.map((account) => {
          const identity = findProviderIdentity(account?.providerIdentityId);
          if (!account || !identity) {
            return null;
          }

          return (
            <option key={account.id} value={account.id}>
              {identity.displayName}
            </option>
          );
        })}
      </select>
      {activeAccount && activeIdentity ? (
        <span className="text-[11px] text-cyan-50/68">
          {activeAccount.organizationName} • {activeIdentity.roleLabel}
        </span>
      ) : null}
    </div>
  );
}
