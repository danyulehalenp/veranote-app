import { beforeEach, describe, expect, it } from 'vitest';
import {
  createServerAmbientSession,
  drainServerAmbientTranscriptEvents,
  getServerAmbientSession,
  resetServerAmbientSessions,
  setServerAmbientSessionState,
  updateServerAmbientConsent,
} from '@/lib/ambient-listening/server-session-store';
import {
  getAmbientMockConsentDrafts,
  getAmbientMockParticipants,
  getAmbientMockSetupDraft,
} from '@/lib/ambient-listening/mock-data';

describe('ambient server session store', () => {
  beforeEach(() => {
    resetServerAmbientSessions();
  });

  it('uses the live adapter stub and preserves stream-push transport state', () => {
    const created = createServerAmbientSession({
      providerIdentityId: 'provider-1',
      encounterId: 'ambient-encounter-1',
      setupDraft: {
        ...getAmbientMockSetupDraft(),
        transcriptSimulator: 'live_stream_adapter',
      },
      participants: getAmbientMockParticipants(),
      consentDrafts: getAmbientMockConsentDrafts(),
    });

    updateServerAmbientConsent({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      consentDrafts: getAmbientMockConsentDrafts(),
    });

    const recording = setServerAmbientSessionState({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      state: 'recording',
    });

    expect(recording.transcriptAdapterId).toBe('ambient-openai-realtime-stub');
    expect(recording.transcriptAdapterLabel).toContain('OpenAI Realtime');
    expect(recording.transcriptSourceKind).toBe('live_stream_adapter');

    const firstDrain = drainServerAmbientTranscriptEvents({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      limit: 1,
      deliveryTransport: 'stream_push',
    });

    expect(firstDrain.events).toHaveLength(1);
    expect(firstDrain.events[0]?.sourceKind).toBe('live_stream_adapter');
    expect(firstDrain.session.lastTranscriptDeliveryTransport).toBe('stream_push');

    const stored = getServerAmbientSession(created.sessionId, 'provider-1');
    expect(stored?.transcriptSourceKind).toBe('live_stream_adapter');
    expect(stored?.lastTranscriptDeliveryTransport).toBe('stream_push');
    expect(stored?.state).toBe('recording');
  });

  it('keeps low-confidence patient turns flagged for speaker review after live adapter ingestion', () => {
    const created = createServerAmbientSession({
      providerIdentityId: 'provider-1',
      encounterId: 'ambient-encounter-2',
      setupDraft: {
        ...getAmbientMockSetupDraft(),
        transcriptSimulator: 'live_stream_adapter',
      },
      participants: getAmbientMockParticipants(),
      consentDrafts: getAmbientMockConsentDrafts(),
    });

    updateServerAmbientConsent({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      consentDrafts: getAmbientMockConsentDrafts(),
    });

    setServerAmbientSessionState({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      state: 'recording',
    });

    let patientFinalSeen = false;
    for (let i = 0; i < 6; i += 1) {
      const drained = drainServerAmbientTranscriptEvents({
        sessionId: created.sessionId,
        providerIdentityId: 'provider-1',
        limit: 1,
        deliveryTransport: 'stream_push',
      });

      const event = drained.events[0];
      if (event?.eventType === 'final_turn' && event.turn.speakerRole === 'patient') {
        patientFinalSeen = true;
        expect(event.turn.attributionNeedsReview).toBe(true);
        expect(event.turn.severityBadges).toContain('speaker review');
        expect(event.turn.riskMarkers).toContain('not safe going home');
        break;
      }
    }

    expect(patientFinalSeen).toBe(true);

    const processing = setServerAmbientSessionState({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      state: 'processing_transcript',
    });
    expect(processing.state).toBe('needs_review');

    const stored = getServerAmbientSession(created.sessionId, 'provider-1');
    expect(stored?.state).toBe('needs_review');
    expect(stored?.reviewFlags.some((flag) => flag.flagId === 'flag-speaker-1' && flag.status === 'open')).toBe(true);
  });
});
