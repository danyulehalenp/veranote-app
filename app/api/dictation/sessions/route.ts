import { NextResponse } from 'next/server';
import { createServerDictationSession } from '@/lib/dictation/server-session-store';
import { getServerSTTProviderStatuses, resolveServerSTTProviderSelection } from '@/lib/dictation/server-stt-adapters';
import { getAuthorizedDesktopBridgeContext } from '@/lib/veranote/desktop-bridge-auth';
import { resolveScopedProviderIdentityId } from '@/lib/veranote/provider-session';
import type { DictationCommitMode, DictationMode, DictationStopReason, DictationTargetSection } from '@/types/dictation';

export async function POST(request: Request) {
  const body = await request.json() as {
    providerId?: string;
    encounterId?: string;
    noteId?: string;
    targetSection?: DictationTargetSection;
    mode?: DictationMode;
    sttProvider?: string;
    language?: string;
    vocabularyHints?: string[];
    commitMode?: DictationCommitMode;
    allowMockFallback?: boolean;
  };

  const authorizedProvider = await getAuthorizedDesktopBridgeContext(request, body.providerId);
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (typeof body.encounterId !== 'string' || !body.encounterId.trim()) {
    return NextResponse.json({ error: 'Encounter id is required.' }, { status: 400 });
  }

  const providerId = resolveScopedProviderIdentityId(body.providerId, authorizedProvider.providerIdentityId);
  const providerSelection = resolveServerSTTProviderSelection({
    requestedProvider: body.sttProvider,
    preferRealProvider: !body.sttProvider,
    allowMockFallback: body.allowMockFallback !== false,
  });
  const activeStatus = getServerSTTProviderStatuses().find((item) => item.providerId === providerSelection.activeProvider);
  if (!activeStatus?.available) {
    return NextResponse.json({
      error: providerSelection.fallbackReason || providerSelection.reason || 'Requested dictation provider is unavailable.',
    }, { status: 400 });
  }
  const session = createServerDictationSession({
    providerIdentityId: providerId,
    providerSelection,
    config: {
      tenantId: 'local-prototype',
      encounterId: body.encounterId.trim(),
      noteId: typeof body.noteId === 'string' && body.noteId.trim() ? body.noteId.trim() : undefined,
      providerUserId: providerId,
      targetSection: body.targetSection,
      mode: body.mode || 'provider_dictation',
      sttProvider: providerSelection.activeProvider,
      language: body.language || 'en',
      vocabularyHints: Array.isArray(body.vocabularyHints) ? body.vocabularyHints.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : undefined,
      commitMode: body.commitMode || 'manual_accept',
      retention: {
        storeAudio: false,
        audioRetentionDays: 0,
        storeInterimTranscripts: false,
      },
    },
  });

  return NextResponse.json({ session });
}
