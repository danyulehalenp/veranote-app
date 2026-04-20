import { NextResponse } from 'next/server';
import { getProviderSettings, saveProviderSettings } from '@/lib/db/client';
import { DEFAULT_PROVIDER_SETTINGS, type ProviderSettings } from '@/lib/constants/settings';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const providerId = searchParams.get('providerId') || undefined;
  const settings = await getProviderSettings(providerId);
  return NextResponse.json({ settings });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<ProviderSettings> & { providerId?: string };
  const providerId = body.providerId;
  const { providerId: _providerId, ...settingsInput } = body;
  const settings = await saveProviderSettings({
    ...DEFAULT_PROVIDER_SETTINGS,
    ...settingsInput,
  }, providerId);

  return NextResponse.json({ settings });
}
