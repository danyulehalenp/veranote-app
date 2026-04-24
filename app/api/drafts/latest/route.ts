import { NextResponse } from 'next/server';
import { getLatestDraft } from '@/lib/db/client';
import { getAuthorizedProviderContext, resolveScopedProviderIdentityId } from '@/lib/veranote/provider-session';

export async function GET(request: Request) {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const providerId = resolveScopedProviderIdentityId(searchParams.get('providerId') || undefined, authorizedProvider.providerIdentityId);
  const draft = await getLatestDraft(providerId);
  return NextResponse.json({ draft });
}
