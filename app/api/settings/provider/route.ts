import { NextResponse } from 'next/server';
import { getProviderSettings, saveProviderSettings } from '@/lib/db/client';
import { DEFAULT_PROVIDER_SETTINGS, type ProviderSettings } from '@/lib/constants/settings';
import { getAuthorizedProviderContext, resolveScopedProviderIdentityId } from '@/lib/veranote/provider-session';

export async function GET(request: Request) {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const providerId = resolveScopedProviderIdentityId(searchParams.get('providerId') || undefined, authorizedProvider.providerIdentityId);
  const settings = await getProviderSettings(providerId);
  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as Partial<ProviderSettings> & { providerId?: string };
  const providerId = resolveScopedProviderIdentityId(body.providerId, authorizedProvider.providerIdentityId);
  const { providerId: _providerId, ...settingsInput } = body;
  const settings = await saveProviderSettings({
    ...DEFAULT_PROVIDER_SETTINGS,
    ...settingsInput,
  }, providerId);

  return NextResponse.json({ settings });
}
