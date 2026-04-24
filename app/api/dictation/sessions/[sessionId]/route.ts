import { NextResponse } from 'next/server';
import { listDictationAuditEvents } from '@/lib/db/client';
import {
  appendServerDictationAudioChunk,
  drainServerDictationTranscriptEvents,
  getRecentServerDictationAuditEvents,
  getServerDictationSession,
  stopServerDictationSession,
  submitServerDictationMockUtterance,
  subscribeToServerDictationSession,
} from '@/lib/dictation/server-session-store';
import { getAuthorizedProviderContext, resolveScopedProviderIdentityId } from '@/lib/veranote/provider-session';
import type { DictationAudioChunkUpload, DictationStopReason } from '@/types/dictation';

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export const runtime = 'nodejs';

function serializeSessionState(session: NonNullable<ReturnType<typeof getServerDictationSession>>) {
  return {
    sessionId: session.sessionId,
    providerIdentityId: session.providerIdentityId,
    targetSection: session.config.targetSection,
    status: session.status,
    createdAt: session.createdAt,
    stoppedAt: session.stoppedAt,
    sttProvider: session.config.sttProvider,
    receivedAudioChunkCount: session.receivedAudioChunkCount,
    receivedAudioBytes: session.receivedAudioBytes,
    lastChunkAt: session.lastChunkAt,
    lastChunkSequence: session.lastChunkSequence,
    lastChunkMimeType: session.lastChunkMimeType,
    queuedTranscriptEventCount: session.pendingTranscriptEvents.length,
    recentAuditEvents: getRecentServerDictationAuditEvents({
      sessionId: session.sessionId,
      providerIdentityId: session.providerIdentityId,
      limit: 10,
    }),
  };
}

export async function GET(request: Request, context: RouteContext) {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const providerId = resolveScopedProviderIdentityId(searchParams.get('providerId') || undefined, authorizedProvider.providerIdentityId);
  const { sessionId } = await context.params;
  const session = getServerDictationSession(sessionId, providerId);

  if (!session) {
    return NextResponse.json({ error: 'Dictation session not found.' }, { status: 404 });
  }

  if (searchParams.get('stream') === '1') {
    const encoder = new TextEncoder();
    let unsubscribe = () => {};
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const sendEvent = (event: string, payload: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        unsubscribe = subscribeToServerDictationSession({
          sessionId,
          providerIdentityId: providerId,
          onUpdate: (nextSession) => {
            sendEvent('session_state', serializeSessionState(nextSession));
          },
        });

        heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        }, 15000);

        request.signal.addEventListener('abort', () => {
          unsubscribe();
          if (heartbeat) {
            clearInterval(heartbeat);
          }
          controller.close();
        }, { once: true });
      },
      cancel() {
        unsubscribe();
        if (heartbeat) {
          clearInterval(heartbeat);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  }

  const persistedAuditEvents = await listDictationAuditEvents({
    providerId,
    sessionId: session.sessionId,
    limit: 10,
  });

  return NextResponse.json({
    session: {
      ...serializeSessionState(session),
      recentAuditEvents: persistedAuditEvents.length ? persistedAuditEvents : serializeSessionState(session).recentAuditEvents,
    },
  });
}

export async function POST(request: Request, context: RouteContext) {
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as {
    providerId?: string;
    action?: 'mock_utterance' | 'upload_chunk' | 'pull_events' | 'stop';
    transcriptText?: string;
    chunk?: DictationAudioChunkUpload;
    reason?: DictationStopReason;
  };

  const providerId = resolveScopedProviderIdentityId(body.providerId, authorizedProvider.providerIdentityId);
  const { sessionId } = await context.params;

  if (body.action === 'stop') {
    const stopped = stopServerDictationSession({
      sessionId,
      providerIdentityId: providerId,
      reason: body.reason || 'provider_stopped',
    });

    if (!stopped) {
      return NextResponse.json({ error: 'Dictation session not found.' }, { status: 404 });
    }

    return NextResponse.json({ stopped });
  }

  if (body.action === 'upload_chunk') {
    try {
      if (!body.chunk) {
        throw new Error('Audio chunk is required.');
      }

      const ingestion = await appendServerDictationAudioChunk({
        sessionId,
        providerIdentityId: providerId,
        chunk: body.chunk,
      });
      return NextResponse.json({ ingestion });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to ingest dictation audio chunk.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (body.action === 'pull_events') {
    try {
      const drained = drainServerDictationTranscriptEvents({
        sessionId,
        providerIdentityId: providerId,
      });
      return NextResponse.json({ transcriptEvents: drained.events });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load dictation transcript events.';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (body.action !== 'mock_utterance') {
    return NextResponse.json({ error: 'Unsupported dictation action.' }, { status: 400 });
  }

  try {
    const queued = await submitServerDictationMockUtterance({
      sessionId,
      providerIdentityId: providerId,
      transcriptText: body.transcriptText || '',
    });
    return NextResponse.json({ queued });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to process dictation utterance.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
