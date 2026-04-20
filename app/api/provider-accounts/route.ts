import { NextResponse } from 'next/server';
import { DEFAULT_PROVIDER_ACCOUNT_ID, findProviderAccount, providerAccounts } from '@/lib/constants/provider-accounts';
import { saveCurrentProviderIdentityId } from '@/lib/db/client';
import { getCurrentProviderAccountId, saveCurrentProviderAccountId } from '@/lib/db/client';

export async function GET() {
  const currentProviderAccountId = await getCurrentProviderAccountId();
  const account = findProviderAccount(currentProviderAccountId);

  return NextResponse.json({
    accounts: providerAccounts,
    currentProviderAccountId: currentProviderAccountId || DEFAULT_PROVIDER_ACCOUNT_ID,
    currentProviderIdentityId: account?.providerIdentityId,
  });
}

export async function POST(request: Request) {
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
