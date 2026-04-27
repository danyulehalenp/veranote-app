import { NextResponse } from 'next/server';
import {
  createServerAmbientSession,
  serializeAmbientSession,
} from '@/lib/ambient-listening/server-session-store';
import {
  getAmbientMockConsentDrafts,
  getAmbientMockParticipants,
  type AmbientSessionSetupDraft,
} from '@/lib/ambient-listening/mock-data';
import { getAuthorizedProviderContext, resolveScopedProviderIdentityId } from '@/lib/veranote/provider-session';

export async function POST(request: Request) {
  const body = await request.json() as {
    providerId?: string;
    encounterId?: string;
    setupDraft?: AmbientSessionSetupDraft;
  };

  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!body.setupDraft) {
    return NextResponse.json({ error: 'Ambient setup draft is required.' }, { status: 400 });
  }

  const providerId = resolveScopedProviderIdentityId(body.providerId, authorizedProvider.providerIdentityId);
  const encounterId = typeof body.encounterId === 'string' && body.encounterId.trim()
    ? body.encounterId.trim()
    : 'ambient-internal-encounter';

  const session = createServerAmbientSession({
    providerIdentityId: providerId,
    encounterId,
    setupDraft: body.setupDraft,
    participants: getAmbientMockParticipants(),
    consentDrafts: getAmbientMockConsentDrafts(),
  });

  return NextResponse.json({
    session: serializeAmbientSession(session),
  });
}
