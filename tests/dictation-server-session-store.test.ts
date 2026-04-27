import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendServerDictationAudioChunk,
  createServerDictationSession,
  drainServerDictationTranscriptEvents,
  getRecentServerDictationAuditEvents,
  getServerAudioChunkSkipReason,
  getServerDictationSession,
  resetServerDictationSessions,
  stopServerDictationSession,
  subscribeToServerDictationSession,
  submitServerDictationMockUtterance,
} from '@/lib/dictation/server-session-store';
import { resolveServerSTTProviderSelection } from '@/lib/dictation/server-stt-adapters';

function createProviderSelection(requestedProvider = 'mock-stt') {
  return resolveServerSTTProviderSelection({
    requestedProvider,
    allowMockFallback: true,
  });
}

function createStandaloneWebmBase64(size = 1280) {
  const bytes = Buffer.alloc(size, 0);
  bytes[0] = 0x1a;
  bytes[1] = 0x45;
  bytes[2] = 0xdf;
  bytes[3] = 0xa3;
  return bytes.toString('base64');
}

function createHeaderlessWebmBase64(size = 1280) {
  const bytes = Buffer.alloc(size, 1);
  return bytes.toString('base64');
}

describe('server dictation session store', () => {
  beforeEach(() => {
    resetServerDictationSessions();
  });

  it('creates provider-scoped sessions and returns mock transcript segments', async () => {
    const created = createServerDictationSession({
      providerIdentityId: 'provider-1',
      providerSelection: createProviderSelection(),
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
      providerSelection: createProviderSelection(),
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
      providerSelection: createProviderSelection(),
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
        base64Audio: createStandaloneWebmBase64(),
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

  it('skips empty and headerless audio chunks before adapter transcription', async () => {
    const created = createServerDictationSession({
      providerIdentityId: 'provider-1',
      providerSelection: createProviderSelection(),
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

    expect(getServerAudioChunkSkipReason({
      sessionId: created.sessionId,
      sequence: 1,
      base64Audio: '',
      mimeType: 'audio/webm',
      sizeBytes: 0,
      capturedAt: '2026-04-23T00:00:00.000Z',
    })).toBe('empty_audio_chunk');

    const ingestion = await appendServerDictationAudioChunk({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      chunk: {
        sessionId: created.sessionId,
        sequence: 2,
        base64Audio: createHeaderlessWebmBase64(),
        mimeType: 'audio/webm;codecs=opus',
        sizeBytes: 1280,
        capturedAt: '2026-04-23T00:00:01.000Z',
      },
    });

    expect(ingestion).toMatchObject({
      receivedAudioChunkCount: 0,
      receivedAudioBytes: 0,
      queuedEventCount: 0,
      skipped: true,
      skipReason: 'non_standalone_webm_chunk',
    });

    const events = getRecentServerDictationAuditEvents({
      sessionId: created.sessionId,
      providerIdentityId: 'provider-1',
      limit: 10,
    });
    expect(events.some((event) => event.eventName === 'dictation_session_error')).toBe(false);
  });

  it('merges adjacent duplicate or continued final transcript events', async () => {
    const created = createServerDictationSession({
      providerIdentityId: 'provider-1',
      providerSelection: createProviderSelection(),
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
      providerSelection: createProviderSelection(),
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
      providerSelection: createProviderSelection(),
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
