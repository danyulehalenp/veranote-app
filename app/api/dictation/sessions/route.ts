import { NextResponse } from 'next/server';
import { createServerDictationSession } from '@/lib/dictation/server-session-store';
import { getAuthorizedProviderContext, resolveScopedProviderIdentityId } from '@/lib/veranote/provider-session';
import type { DictationCommitMode, DictationMode, DictationStopReason, DictationTargetSection } from '@/types/dictation';

export async function POST(request: Request) {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as {
    providerId?: string;
    encounterId?: string;
    noteId?: string;
    targetSection?: DictationTargetSection;
    mode?: DictationMode;
    sttProvider?: string;
    language?: string;
    commitMode?: DictationCommitMode;
  };

  if (typeof body.encounterId !== 'string' || !body.encounterId.trim()) {
    return NextResponse.json({ error: 'Encounter id is required.' }, { status: 400 });
  }

  const providerId = resolveScopedProviderIdentityId(body.providerId, authorizedProvider.providerIdentityId);
  const defaultSttProvider = process.env.OPENAI_API_KEY ? 'openai-transcription' : 'mock-stt';
  const session = createServerDictationSession({
    providerIdentityId: providerId,
    config: {
      tenantId: 'local-prototype',
      encounterId: body.encounterId.trim(),
      noteId: typeof body.noteId === 'string' && body.noteId.trim() ? body.noteId.trim() : undefined,
      providerUserId: providerId,
      targetSection: body.targetSection,
      mode: body.mode || 'provider_dictation',
      sttProvider: body.sttProvider || defaultSttProvider,
      language: body.language || 'en',
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
