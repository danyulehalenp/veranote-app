import { NextResponse } from 'next/server';
import { DEFAULT_PROVIDER_IDENTITY_ID, findProviderIdentity, providerIdentities } from '@/lib/constants/provider-identities';
import { getCurrentProviderIdentityId, saveCurrentProviderIdentityId } from '@/lib/db/client';
import { getAuthorizedProviderContext, prototypeSwitchingAllowed } from '@/lib/veranote/provider-session';

export async function GET() {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentProviderId = authorizedProvider.providerIdentityId || await getCurrentProviderIdentityId();
  const identity = findProviderIdentity(currentProviderId);
  const identities = prototypeSwitchingAllowed()
    ? providerIdentities
    : (identity ? [identity] : []);

  return NextResponse.json({
    identities,
    currentProviderId: currentProviderId || DEFAULT_PROVIDER_IDENTITY_ID,
  });
}

export async function POST(request: Request) {
  if (!prototypeSwitchingAllowed()) {
    return NextResponse.json({ error: 'Provider identity switching is not enabled in beta mode.' }, { status: 403 });
  }

  const body = (await request.json()) as { providerId?: string };
  const providerId = body.providerId || DEFAULT_PROVIDER_IDENTITY_ID;
  const currentProviderId = await saveCurrentProviderIdentityId(providerId);
  return NextResponse.json({ currentProviderId });
}
