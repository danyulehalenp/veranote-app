import { listDictationAuditEvents, recordDictationAuditEvent, resetDictationEventLedger } from '@/lib/dictation/event-ledger';
import { resolveServerSTTAdapter } from '@/lib/dictation/server-stt-adapters';
import type { DictationAudioChunkUpload, DictationSessionConfig, DictationStopReason, TranscriptSegment } from '@/types/dictation';

type ServerDictationSessionRecord = {
  sessionId: string;
  providerIdentityId: string;
  config: DictationSessionConfig;
  status: 'active' | 'stopped';
  createdAt: string;
  stoppedAt?: string;
  receivedAudioChunkCount: number;
  receivedAudioBytes: number;
  lastChunkAt?: string;
  lastChunkSequence?: number;
  lastChunkMimeType?: string;
  pendingTranscriptEvents: TranscriptSegment[];
};

type ServerDictationSessionListener = (record: ServerDictationSessionRecord) => void;

const serverDictationSessions = new Map<string, ServerDictationSessionRecord>();
const serverDictationSessionListeners = new Map<string, Set<ServerDictationSessionListener>>();

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createHandle(sessionId: string, provider: string) {
  return {
    sessionId,
    provider,
  };
}

function normalizeComparableText(text: string) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function mergeTranscriptEvents(
  existingEvents: TranscriptSegment[],
  newEvents: TranscriptSegment[],
) {
  const nextEvents = [...existingEvents];

  for (const event of newEvents) {
    const lastEvent = nextEvents[nextEvents.length - 1];
    if (!lastEvent) {
      nextEvents.push(event);
      continue;
    }

    const latestComparableFinalIndex = event.isFinal
      ? [...nextEvents]
          .map((item, index) => ({ item, index }))
          .reverse()
          .find(({ item }) => (
            item.isFinal
            && item.targetSection === event.targetSection
            && item.source.provider === event.source.provider
          ))?.index
      : undefined;
    const comparableEventIndex = latestComparableFinalIndex ?? (nextEvents.length - 1);
    const comparableEvent = nextEvents[comparableEventIndex];
    if (!comparableEvent) {
      nextEvents.push(event);
      continue;
    }

    const lastText = normalizeComparableText(comparableEvent.text);
    const nextText = normalizeComparableText(event.text);

    if (
      event.isFinal
      && comparableEvent.isFinal
      && comparableEvent.targetSection === event.targetSection
      && comparableEvent.source.provider === event.source.provider
    ) {
      if (lastText === nextText || lastText.includes(nextText) || nextText.includes(lastText)) {
        nextEvents[comparableEventIndex] = nextText.length >= lastText.length ? event : comparableEvent;
        continue;
      }

      const endsWithTerminalPunctuation = /[.!?]$/.test(comparableEvent.text.trim());
      if (!endsWithTerminalPunctuation) {
        nextEvents[comparableEventIndex] = {
          ...event,
          text: `${comparableEvent.text.trim()} ${event.text.trim()}`.replace(/\s+/g, ' ').trim(),
          normalizedText: `${comparableEvent.normalizedText || comparableEvent.text} ${event.normalizedText || event.text}`.replace(/\s+/g, ' ').trim(),
          reviewFlags: [...comparableEvent.reviewFlags, ...event.reviewFlags].filter((flag, index, flags) => (
            index === flags.findIndex((candidate) => (
              candidate.flagType === flag.flagType && candidate.matchedText === flag.matchedText
            ))
          )),
        };
        continue;
      }
    }

    nextEvents.push(event);
  }

  return nextEvents;
}

export function resetServerDictationSessions() {
  serverDictationSessions.clear();
  serverDictationSessionListeners.clear();
  resetDictationEventLedger();
}

function notifyServerDictationSessionListeners(record: ServerDictationSessionRecord) {
  const listeners = serverDictationSessionListeners.get(record.sessionId);
  if (!listeners?.size) {
    return;
  }

  for (const listener of listeners) {
    listener(record);
  }
}

export function subscribeToServerDictationSession(input: {
  sessionId: string;
  providerIdentityId: string;
  onUpdate: ServerDictationSessionListener;
}) {
  const record = getServerDictationSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Dictation session not found.');
  }

  const existing = serverDictationSessionListeners.get(input.sessionId) || new Set<ServerDictationSessionListener>();
  existing.add(input.onUpdate);
  serverDictationSessionListeners.set(input.sessionId, existing);

  input.onUpdate(record);

  return () => {
    const listeners = serverDictationSessionListeners.get(input.sessionId);
    if (!listeners) {
      return;
    }

    listeners.delete(input.onUpdate);
    if (!listeners.size) {
      serverDictationSessionListeners.delete(input.sessionId);
    }
  };
}

export function createServerDictationSession(input: {
  providerIdentityId: string;
  config: DictationSessionConfig;
}) {
  const sessionId = createId('server-dictation');
  const record: ServerDictationSessionRecord = {
    sessionId,
    providerIdentityId: input.providerIdentityId,
    config: input.config,
    status: 'active',
    createdAt: new Date().toISOString(),
    receivedAudioChunkCount: 0,
    receivedAudioBytes: 0,
    pendingTranscriptEvents: [],
  };

  serverDictationSessions.set(sessionId, record);
  notifyServerDictationSessionListeners(record);
  recordDictationAuditEvent({
    sessionId,
    encounterId: input.config.encounterId,
    noteId: input.config.noteId,
    actorUserId: input.providerIdentityId,
    sttProvider: input.config.sttProvider,
    mode: input.config.mode,
    eventName: 'dictation_session_started',
    eventDomain: 'session',
    payload: {
      targetSection: input.config.targetSection,
      commitMode: input.config.commitMode,
      language: input.config.language,
    },
  });
  return {
    sessionId,
    provider: input.config.sttProvider,
    createdAt: record.createdAt,
    receivedAudioChunkCount: record.receivedAudioChunkCount,
    receivedAudioBytes: record.receivedAudioBytes,
  };
}

export function getServerDictationSession(sessionId: string, providerIdentityId: string) {
  const record = serverDictationSessions.get(sessionId);
  if (!record || record.providerIdentityId !== providerIdentityId) {
    return null;
  }

  return record;
}

export function getRecentServerDictationAuditEvents(input: {
  sessionId: string;
  providerIdentityId: string;
  limit?: number;
}) {
  const record = getServerDictationSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Dictation session not found.');
  }

  return listDictationAuditEvents({
    sessionId: input.sessionId,
    limit: input.limit,
  });
}

export async function submitServerDictationMockUtterance(input: {
  sessionId: string;
  providerIdentityId: string;
  transcriptText: string;
}) {
  const record = getServerDictationSession(input.sessionId, input.providerIdentityId);
  if (!record || record.status !== 'active') {
    throw new Error('Active dictation session not found.');
  }

  if (!input.transcriptText.trim()) {
    throw new Error('Transcript text is required.');
  }

  const adapter = resolveServerSTTAdapter(record.config.sttProvider);
  const events = await adapter.createTranscriptEventsFromMockUtterance({
    config: record.config,
    handle: createHandle(record.sessionId, record.config.sttProvider),
    transcriptText: input.transcriptText,
  });

  const nextRecord: ServerDictationSessionRecord = {
    ...record,
    pendingTranscriptEvents: mergeTranscriptEvents(record.pendingTranscriptEvents, events),
  };
  serverDictationSessions.set(input.sessionId, nextRecord);
  notifyServerDictationSessionListeners(nextRecord);

  for (const event of events) {
    recordDictationAuditEvent({
      sessionId: record.sessionId,
      encounterId: record.config.encounterId,
      noteId: record.config.noteId,
      actorUserId: record.providerIdentityId,
      sttProvider: record.config.sttProvider,
      mode: record.config.mode,
      eventName: event.isFinal ? 'dictation_final_segment' : 'dictation_interim_segment',
      eventDomain: 'transcript',
      payload: {
        targetSection: event.targetSection,
        queuedTranscriptEventCount: nextRecord.pendingTranscriptEvents.length,
        reviewFlagCount: event.reviewFlags.length,
        modelOrEngine: event.source.modelOrEngine,
        sourceMode: event.source.mode,
      },
    });
  }

  return {
    queuedEventCount: events.length,
  };
}

export async function appendServerDictationAudioChunk(input: {
  sessionId: string;
  providerIdentityId: string;
  chunk: DictationAudioChunkUpload;
}) {
  const record = getServerDictationSession(input.sessionId, input.providerIdentityId);
  if (!record || record.status !== 'active') {
    throw new Error('Active dictation session not found.');
  }

  const nextRecord: ServerDictationSessionRecord = {
    ...record,
    receivedAudioChunkCount: record.receivedAudioChunkCount + 1,
    receivedAudioBytes: record.receivedAudioBytes + Math.max(0, input.chunk.sizeBytes || 0),
    lastChunkAt: input.chunk.capturedAt,
    lastChunkSequence: input.chunk.sequence,
    lastChunkMimeType: input.chunk.mimeType,
  };

  if (nextRecord.receivedAudioChunkCount === 1) {
    recordDictationAuditEvent({
      sessionId: record.sessionId,
      encounterId: record.config.encounterId,
      noteId: record.config.noteId,
      actorUserId: record.providerIdentityId,
      sttProvider: record.config.sttProvider,
      mode: record.config.mode,
      eventName: 'dictation_audio_stream_started',
      eventDomain: 'session',
      payload: {
        mimeType: input.chunk.mimeType,
      },
    });
  }

  const adapter = resolveServerSTTAdapter(record.config.sttProvider);
  let adapterEvents: TranscriptSegment[] = [];
  try {
    adapterEvents = await (adapter.createTranscriptEventsFromAudioChunk?.({
      config: record.config,
      handle: createHandle(record.sessionId, record.config.sttProvider),
      chunk: input.chunk,
      receivedAudioChunkCount: nextRecord.receivedAudioChunkCount,
    }) || Promise.resolve([]));
  } catch (error) {
    recordDictationAuditEvent({
      sessionId: record.sessionId,
      encounterId: record.config.encounterId,
      noteId: record.config.noteId,
      actorUserId: record.providerIdentityId,
      sttProvider: record.config.sttProvider,
      mode: record.config.mode,
      eventName: 'dictation_session_error',
      eventDomain: 'session',
      payload: {
        stage: 'append_audio_chunk',
        message: error instanceof Error ? error.message : 'Unknown provider error',
      },
    });
    adapterEvents = [];
  }
  nextRecord.pendingTranscriptEvents = mergeTranscriptEvents(record.pendingTranscriptEvents, adapterEvents);

  serverDictationSessions.set(input.sessionId, nextRecord);
  notifyServerDictationSessionListeners(nextRecord);

  for (const event of adapterEvents) {
    recordDictationAuditEvent({
      sessionId: record.sessionId,
      encounterId: record.config.encounterId,
      noteId: record.config.noteId,
      actorUserId: record.providerIdentityId,
      sttProvider: record.config.sttProvider,
      mode: record.config.mode,
      eventName: event.isFinal ? 'dictation_final_segment' : 'dictation_interim_segment',
      eventDomain: 'transcript',
      payload: {
        targetSection: event.targetSection,
        queuedTranscriptEventCount: nextRecord.pendingTranscriptEvents.length,
        reviewFlagCount: event.reviewFlags.length,
        modelOrEngine: event.source.modelOrEngine,
        sourceMode: event.source.mode,
      },
    });
  }

  return {
    sessionId: nextRecord.sessionId,
    receivedAudioChunkCount: nextRecord.receivedAudioChunkCount,
    receivedAudioBytes: nextRecord.receivedAudioBytes,
    lastChunkAt: nextRecord.lastChunkAt,
    lastChunkSequence: nextRecord.lastChunkSequence,
    lastChunkMimeType: nextRecord.lastChunkMimeType,
    queuedEventCount: nextRecord.pendingTranscriptEvents.length,
  };
}

export function drainServerDictationTranscriptEvents(input: {
  sessionId: string;
  providerIdentityId: string;
}) {
  const record = getServerDictationSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Dictation session not found.');
  }

  const events = [...record.pendingTranscriptEvents];
  const nextRecord: ServerDictationSessionRecord = {
    ...record,
    pendingTranscriptEvents: [],
  };
  serverDictationSessions.set(input.sessionId, nextRecord);
  notifyServerDictationSessionListeners(nextRecord);
  recordDictationAuditEvent({
    sessionId: record.sessionId,
    encounterId: record.config.encounterId,
    noteId: record.config.noteId,
    actorUserId: record.providerIdentityId,
    sttProvider: record.config.sttProvider,
    mode: record.config.mode,
    eventName: 'dictation_segment_marked_reviewed',
    eventDomain: 'transcript',
    payload: {
      drainedEventCount: events.length,
    },
  });

  return {
    sessionId: record.sessionId,
    events,
  };
}

export function stopServerDictationSession(input: {
  sessionId: string;
  providerIdentityId: string;
  reason: DictationStopReason;
}) {
  const record = getServerDictationSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    return null;
  }

  const nextRecord: ServerDictationSessionRecord = {
    ...record,
    status: 'stopped',
    stoppedAt: new Date().toISOString(),
  };

  serverDictationSessions.set(input.sessionId, nextRecord);
  notifyServerDictationSessionListeners(nextRecord);
  recordDictationAuditEvent({
    sessionId: nextRecord.sessionId,
    encounterId: nextRecord.config.encounterId,
    noteId: nextRecord.config.noteId,
    actorUserId: nextRecord.providerIdentityId,
    sttProvider: nextRecord.config.sttProvider,
    mode: nextRecord.config.mode,
    eventName: 'dictation_session_stopped',
    eventDomain: 'session',
    payload: {
      reason: input.reason,
    },
  });
  return {
    sessionId: nextRecord.sessionId,
    reason: input.reason,
    stoppedAt: nextRecord.stoppedAt,
  };
}
