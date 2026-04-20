import { NextResponse } from 'next/server';
import { DEFAULT_PROVIDER_IDENTITY_ID, providerIdentities } from '@/lib/constants/provider-identities';
import { getCurrentProviderIdentityId, saveCurrentProviderIdentityId } from '@/lib/db/client';

export async function GET() {
  const currentProviderId = await getCurrentProviderIdentityId();
  return NextResponse.json({
    identities: providerIdentities,
    currentProviderId: currentProviderId || DEFAULT_PROVIDER_IDENTITY_ID,
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { providerId?: string };
  const providerId = body.providerId || DEFAULT_PROVIDER_IDENTITY_ID;
  const currentProviderId = await saveCurrentProviderIdentityId(providerId);
  return NextResponse.json({ currentProviderId });
}
