import { NextResponse } from 'next/server';
import { DEFAULT_PROVIDER_ACCOUNT_ID, findProviderAccount, providerAccounts } from '@/lib/constants/provider-accounts';
import { saveCurrentProviderIdentityId } from '@/lib/db/client';
import { getCurrentProviderAccountId, saveCurrentProviderAccountId } from '@/lib/db/client';
import { getAuthorizedProviderContext, prototypeSwitchingAllowed } from '@/lib/veranote/provider-session';

export async function GET() {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentProviderAccountId = authorizedProvider.providerAccountId || await getCurrentProviderAccountId();
  const account = findProviderAccount(currentProviderAccountId);
  const accounts = prototypeSwitchingAllowed()
    ? providerAccounts
    : (account ? [account] : []);

  return NextResponse.json({
    accounts,
    currentProviderAccountId: currentProviderAccountId || DEFAULT_PROVIDER_ACCOUNT_ID,
    currentProviderIdentityId: account?.providerIdentityId,
  });
}

export async function POST(request: Request) {
  if (!prototypeSwitchingAllowed()) {
    return NextResponse.json({ error: 'Provider account switching is not enabled in beta mode.' }, { status: 403 });
  }

  const body = (await request.json()) as { providerAccountId?: string };
  const providerAccountId = body.providerAccountId || DEFAULT_PROVIDER_ACCOUNT_ID;
  const account = findProviderAccount(providerAccountId);
  const currentProviderAccountId = await saveCurrentProviderAccountId(providerAccountId);

  if (account?.providerIdentityId) {
    await saveCurrentProviderIdentityId(account.providerIdentityId);
  }

  return NextResponse.json({
    currentProviderAccountId,
    currentProviderIdentityId: account?.providerIdentityId,
  });
}
