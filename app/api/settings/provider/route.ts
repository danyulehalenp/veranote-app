import { NextResponse } from 'next/server';
import { getProviderSettings, saveProviderSettings } from '@/lib/db/client';
import { DEFAULT_PROVIDER_SETTINGS, type ProviderSettings } from '@/lib/constants/settings';
import { buildDictationInsertionWorkflowProfile } from '@/lib/dictation/ehr-insertion-profiles';
import { getAuthorizedDesktopBridgeContext } from '@/lib/veranote/desktop-bridge-auth';
import { applyAssistantPersonaDefaults } from '@/lib/veranote/assistant-persona';
import { resolveScopedProviderIdentityId } from '@/lib/veranote/provider-session';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authorizedProvider = await getAuthorizedDesktopBridgeContext(
    request,
    searchParams.get('providerId') || undefined,
  );
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providerId = resolveScopedProviderIdentityId(searchParams.get('providerId') || undefined, authorizedProvider.providerIdentityId);
  const settings = await getProviderSettings(providerId);
  return NextResponse.json({
    settings,
    workflowProfile: buildDictationInsertionWorkflowProfile(
      settings.outputDestination,
      settings.outputNoteFocus,
    ),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<ProviderSettings> & { providerId?: string };
  const authorizedProvider = await getAuthorizedDesktopBridgeContext(request, body.providerId);
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providerId = resolveScopedProviderIdentityId(body.providerId, authorizedProvider.providerIdentityId);
  const { providerId: _providerId, ...settingsInput } = body;
  const settings = await saveProviderSettings(
    applyAssistantPersonaDefaults({
      ...DEFAULT_PROVIDER_SETTINGS,
      ...settingsInput,
    }),
    providerId,
  );

  return NextResponse.json({ settings });
}
