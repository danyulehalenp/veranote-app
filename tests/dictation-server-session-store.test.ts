import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendServerDictationAudioChunk,
  createServerDictationSession,
  drainServerDictationTranscriptEvents,
  getRecentServerDictationAuditEvents,
  getServerDictationSession,
  resetServerDictationSessions,
  stopServerDictationSession,
  subscribeToServerDictationSession,
  submitServerDictationMockUtterance,
} from '@/lib/dictation/server-session-store';

describe('server dictation session store', () => {
  beforeEach(() => {
    resetServerDictationSessions();
  });

  it('creates provider-scoped sessions and returns mock transcript segments', async () => {
    const created = createServerDictationSession({
      providerIdentityId: 'provider-1',
      config: {
        tenantId: 'local-prototype',
        encounterId: 'encounter-1',
        providerUserId: 'provider-1',
        targetSection: 'clinicianNotes',
        mode: 'provider_dictation',
        sttProvider: 'mock-stt',
        language: 'en',
        commitMode: 'manual_accept',
        retention: {
          storeAudio: false,
          audioRetentionDays: 0,
          storeInterimTranscripts: false,
        },
      },
    });

    const stored = getServerDictationSession(created.sessionId, 'provider-1');
    expect(stored?.status).toBe('active');

    const queued = await submitServerDictationMockUtterance({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      transcriptText: 'Patient denies SI and asks for discharge.',
    });
    expect(queued.queuedEventCount).toBe(2);

    const drained = drainServerDictationTranscriptEvents({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
    });
    const segments = drained.events;

    expect(segments[0]?.text).toContain('...');
    expect(segments[1]?.text).toBe('Patient denies SI and asks for discharge.');
    expect(segments[1]?.reviewFlags.length).toBeGreaterThan(0);
  });

  it('stops sessions and rejects later utterances', async () => {
    const created = createServerDictationSession({
      providerIdentityId: 'provider-1',
      config: {
        tenantId: 'local-prototype',
        encounterId: 'encounter-1',
        providerUserId: 'provider-1',
        targetSection: 'clinicianNotes',
        mode: 'provider_dictation',
        sttProvider: 'mock-stt',
        language: 'en',
        commitMode: 'manual_accept',
        retention: {
          storeAudio: false,
          audioRetentionDays: 0,
          storeInterimTranscripts: false,
        },
      },
    });

    stopServerDictationSession({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      reason: 'provider_stopped',
    });

    await expect(submitServerDictationMockUtterance({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      transcriptText: 'Another utterance',
    })).rejects.toThrow('Active dictation session not found.');
  });

  it('tracks uploaded audio chunk stats per session', async () => {
    const created = createServerDictationSession({
      providerIdentityId: 'provider-1',
      config: {
        tenantId: 'local-prototype',
        encounterId: 'encounter-1',
        providerUserId: 'provider-1',
        targetSection: 'clinicianNotes',
        mode: 'provider_dictation',
        sttProvider: 'mock-stt',
        language: 'en',
        commitMode: 'manual_accept',
        retention: {
          storeAudio: false,
          audioRetentionDays: 0,
          storeInterimTranscripts: false,
        },
      },
    });

    const ingestion = await appendServerDictationAudioChunk({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      chunk: {
        sessionId: created.sessionId,
        sequence: 1,
        base64Audio: 'aGVsbG8=',
        mimeType: 'audio/webm',
        sizeBytes: 1280,
        capturedAt: '2026-04-23T00:00:00.000Z',
      },
    });

    expect(ingestion.receivedAudioChunkCount).toBe(1);
    expect(ingestion.receivedAudioBytes).toBe(1280);
    expect(ingestion.lastChunkSequence).toBe(1);
    expect(ingestion.queuedEventCount).toBe(0);
  });

  it('merges adjacent duplicate or continued final transcript events', async () => {
    const created = createServerDictationSession({
      providerIdentityId: 'provider-1',
      config: {
        tenantId: 'local-prototype',
        encounterId: 'encounter-1',
        providerUserId: 'provider-1',
        targetSection: 'clinicianNotes',
        mode: 'provider_dictation',
        sttProvider: 'mock-stt',
        language: 'en',
        commitMode: 'manual_accept',
        retention: {
          storeAudio: false,
          audioRetentionDays: 0,
          storeInterimTranscripts: false,
        },
      },
    });

    await submitServerDictationMockUtterance({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      transcriptText: 'Patient denies SI',
    });
    await submitServerDictationMockUtterance({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      transcriptText: 'and asks for discharge.',
    });

    const drained = drainServerDictationTranscriptEvents({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
    });
    const finalEvents = drained.events.filter((event) => event.isFinal);

    expect(finalEvents).toHaveLength(1);
    expect(finalEvents[0]?.text).toContain('Patient denies SI and asks for discharge.');
  });

  it('notifies session subscribers when transcript state changes', async () => {
    const created = createServerDictationSession({
      providerIdentityId: 'provider-1',
      config: {
        tenantId: 'local-prototype',
        encounterId: 'encounter-1',
        providerUserId: 'provider-1',
        targetSection: 'clinicianNotes',
        mode: 'provider_dictation',
        sttProvider: 'mock-stt',
        language: 'en',
        commitMode: 'manual_accept',
        retention: {
          storeAudio: false,
          audioRetentionDays: 0,
          storeInterimTranscripts: false,
        },
      },
    });

    const updates: number[] = [];
    const unsubscribe = subscribeToServerDictationSession({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      onUpdate: (session) => {
        updates.push(session.pendingTranscriptEvents.length);
      },
    });

    await submitServerDictationMockUtterance({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      transcriptText: 'Patient denies SI and asks for discharge.',
    });

    drainServerDictationTranscriptEvents({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
    });
    unsubscribe();

    expect(updates).toEqual([0, 2, 0]);
  });

  it('keeps a recent event ledger for session activity', async () => {
    const created = createServerDictationSession({
      providerIdentityId: 'provider-1',
      config: {
        tenantId: 'local-prototype',
        encounterId: 'encounter-1',
        providerUserId: 'provider-1',
        targetSection: 'clinicianNotes',
        mode: 'provider_dictation',
        sttProvider: 'mock-stt',
        language: 'en',
        commitMode: 'manual_accept',
        retention: {
          storeAudio: false,
          audioRetentionDays: 0,
          storeInterimTranscripts: false,
        },
      },
    });

    await submitServerDictationMockUtterance({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      transcriptText: 'Patient denies SI and asks for discharge.',
    });

    stopServerDictationSession({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      reason: 'provider_stopped',
    });

    const events = getRecentServerDictationAuditEvents({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      limit: 6,
    });

    expect(events.map((event) => event.eventName)).toContain('dictation_session_started');
    expect(events.map((event) => event.eventName)).toContain('dictation_final_segment');
    expect(events.map((event) => event.eventName)).toContain('dictation_session_stopped');
  });
});
