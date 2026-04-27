import { NextResponse } from 'next/server';
import {
  acceptServerAmbientSection,
  confirmServerAmbientTurn,
  drainServerAmbientTranscriptEvents,
  editServerAmbientSentence,
  excludeServerAmbientTurn,
  getServerAmbientSession,
  markServerAmbientTurnUnresolved,
  relabelServerAmbientTurn,
  serializeAmbientSession,
  setServerAmbientSentenceStatus,
  setServerAmbientSessionState,
  setServerAmbientSpeakerLabel,
  subscribeToServerAmbientSession,
  updateServerAmbientConsent,
} from '@/lib/ambient-listening/server-session-store';
import type { AmbientConsentEventDraft } from '@/lib/ambient-listening/mock-data';
import { getAuthorizedProviderContext, resolveScopedProviderIdentityId } from '@/lib/veranote/provider-session';
import type { AmbientParticipantRole, AmbientSessionState } from '@/types/ambient-listening';

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export const runtime = 'nodejs';

export async function GET(request: Request, context: RouteContext) {
  const { searchParams } = new URL(request.url);
  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providerId = resolveScopedProviderIdentityId(searchParams.get('providerId') || undefined, authorizedProvider.providerIdentityId);
  const { sessionId } = await context.params;
  const session = getServerAmbientSession(sessionId, providerId);

  if (!session) {
    return NextResponse.json({ error: 'Ambient session not found.' }, { status: 404 });
  }

  if (searchParams.get('stream') === '1') {
    const encoder = new TextEncoder();
    let unsubscribe = () => {};
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let transcriptPushInterval: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const sendEvent = (event: string, payload: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        const maybePushTranscriptEvent = () => {
          const currentSession = getServerAmbientSession(sessionId, providerId);
          if (!currentSession || currentSession.state !== 'recording' || currentSession.transcriptSourceKind !== 'live_stream_adapter') {
            return;
          }

          const drained = drainServerAmbientTranscriptEvents({
            sessionId,
            providerIdentityId: providerId,
            limit: 1,
            deliveryTransport: 'stream_push',
          });

          if (drained.events.length) {
            for (const event of drained.events) {
              sendEvent('transcript_event', {
                ...event,
                deliveryTransport: 'stream_push' as const,
              });
            }
            sendEvent('session_state', serializeAmbientSession(drained.session));
          }
        };

        unsubscribe = subscribeToServerAmbientSession({
          sessionId,
          providerIdentityId: providerId,
          onUpdate: (nextSession) => {
            sendEvent('session_state', serializeAmbientSession(nextSession));
          },
        });

        transcriptPushInterval = setInterval(() => {
          maybePushTranscriptEvent();
        }, 1200);

        heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        }, 15000);

        request.signal.addEventListener('abort', () => {
          unsubscribe();
          if (transcriptPushInterval) {
            clearInterval(transcriptPushInterval);
          }
          if (heartbeat) {
            clearInterval(heartbeat);
          }
          controller.close();
        }, { once: true });
      },
      cancel() {
        unsubscribe();
        if (transcriptPushInterval) {
          clearInterval(transcriptPushInterval);
        }
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

  return NextResponse.json({
    session: serializeAmbientSession(session),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const body = await request.json() as {
    providerId?: string;
    action?:
      | 'save_consent'
      | 'set_state'
      | 'relabel_turn'
      | 'set_speaker_label'
      | 'mark_unresolved'
      | 'exclude_turn'
      | 'restore_turn'
      | 'confirm_turn'
      | 'pull_events'
      | 'edit_sentence'
      | 'accept_sentence'
      | 'reject_sentence'
      | 'accept_section';
    consentDrafts?: AmbientConsentEventDraft[];
    state?: AmbientSessionState;
    turnId?: string;
    role?: AmbientParticipantRole;
    speakerLabel?: string | null;
    sentenceId?: string;
    text?: string;
    sectionId?: string;
  };

  const authorizedProvider = await getAuthorizedProviderContext();
  if (!authorizedProvider) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const providerId = resolveScopedProviderIdentityId(body.providerId, authorizedProvider.providerIdentityId);
  const { sessionId } = await context.params;

  try {
    let session;

    switch (body.action) {
      case 'save_consent':
        if (!body.consentDrafts) {
          throw new Error('Consent drafts are required.');
        }
        session = updateServerAmbientConsent({
          sessionId,
          providerIdentityId: providerId,
          consentDrafts: body.consentDrafts,
        });
        break;
      case 'set_state':
        if (!body.state) {
          throw new Error('Ambient state is required.');
        }
        session = setServerAmbientSessionState({
          sessionId,
          providerIdentityId: providerId,
          state: body.state,
        });
        break;
      case 'relabel_turn':
        if (!body.turnId || !body.role) {
          throw new Error('Turn id and role are required.');
        }
        session = relabelServerAmbientTurn({
          sessionId,
          providerIdentityId: providerId,
          turnId: body.turnId,
          role: body.role,
        });
        break;
      case 'set_speaker_label':
        if (!body.turnId) {
          throw new Error('Turn id is required.');
        }
        session = setServerAmbientSpeakerLabel({
          sessionId,
          providerIdentityId: providerId,
          turnId: body.turnId,
          speakerLabel: body.speakerLabel || null,
        });
        break;
      case 'mark_unresolved':
        if (!body.turnId) {
          throw new Error('Turn id is required.');
        }
        session = markServerAmbientTurnUnresolved({
          sessionId,
          providerIdentityId: providerId,
          turnId: body.turnId,
        });
        break;
      case 'exclude_turn':
      case 'restore_turn':
        if (!body.turnId) {
          throw new Error('Turn id is required.');
        }
        session = excludeServerAmbientTurn({
          sessionId,
          providerIdentityId: providerId,
          turnId: body.turnId,
          excluded: body.action === 'exclude_turn',
        });
        break;
      case 'confirm_turn':
        if (!body.turnId) {
          throw new Error('Turn id is required.');
        }
        session = confirmServerAmbientTurn({
          sessionId,
          providerIdentityId: providerId,
          turnId: body.turnId,
        });
        break;
      case 'pull_events': {
        const drained = drainServerAmbientTranscriptEvents({
          sessionId,
          providerIdentityId: providerId,
          limit: 1,
        });

        return NextResponse.json({
          transcriptEvents: drained.events.map((event) => ({
            ...event,
            deliveryTransport: 'polling_pull' as const,
          })),
          session: serializeAmbientSession(drained.session),
        });
      }
      case 'edit_sentence':
        if (!body.sentenceId || typeof body.text !== 'string') {
          throw new Error('Sentence id and text are required.');
        }
        session = editServerAmbientSentence({
          sessionId,
          providerIdentityId: providerId,
          sentenceId: body.sentenceId,
          text: body.text,
        });
        break;
      case 'accept_sentence':
      case 'reject_sentence':
        if (!body.sentenceId) {
          throw new Error('Sentence id is required.');
        }
        session = setServerAmbientSentenceStatus({
          sessionId,
          providerIdentityId: providerId,
          sentenceId: body.sentenceId,
          accepted: body.action === 'accept_sentence',
          rejected: body.action === 'reject_sentence',
        });
        break;
      case 'accept_section':
        if (!body.sectionId) {
          throw new Error('Section id is required.');
        }
        session = acceptServerAmbientSection({
          sessionId,
          providerIdentityId: providerId,
          sectionId: body.sectionId,
        });
        break;
      default:
        return NextResponse.json({ error: 'Unsupported ambient action.' }, { status: 400 });
    }

    return NextResponse.json({
      session: serializeAmbientSession(session),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to update ambient session.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
