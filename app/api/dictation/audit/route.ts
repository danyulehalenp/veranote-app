import { NextResponse } from 'next/server';
import { listDictationAuditEvents, saveDictationAuditEvent } from '@/lib/db/client';
import { getAuthorizedProviderContext, resolveScopedProviderIdentityId } from '@/lib/veranote/provider-session';
import type { DictationAuditEvent } from '@/types/dictation';

export async function GET(request: Request) {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const providerId = resolveScopedProviderIdentityId(searchParams.get('providerId') || undefined, authorizedProvider.providerIdentityId);
  const sessionId = searchParams.get('sessionId') || undefined;
  const limitValue = Number(searchParams.get('limit') || '20');
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(limitValue, 50) : 20;

  const events = await listDictationAuditEvents({
    providerId,
    sessionId,
    limit,
  });

  return NextResponse.json({ events });
}

export async function POST(request: Request) {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as Partial<DictationAuditEvent> & {
    providerId?: string;
  };
  const providerId = resolveScopedProviderIdentityId(body.providerId, authorizedProvider.providerIdentityId);

  if (!body.id || !body.eventName || !body.eventDomain || !body.occurredAt || !body.encounterId || !body.dictationSessionId) {
    return NextResponse.json({ error: 'Incomplete dictation audit event.' }, { status: 400 });
  }

  const saved = await saveDictationAuditEvent({
    id: body.id,
    eventName: body.eventName,
    eventDomain: body.eventDomain,
    occurredAt: body.occurredAt,
    encounterId: body.encounterId,
    noteId: body.noteId,
    dictationSessionId: body.dictationSessionId,
    actorUserId: providerId,
    sttProvider: body.sttProvider,
    mode: body.mode,
    payload: body.payload || {},
    containsPhi: Boolean(body.containsPhi),
    retentionClass: body.retentionClass || 'audit_only',
  }, providerId);

  return NextResponse.json({ event: saved });
}
