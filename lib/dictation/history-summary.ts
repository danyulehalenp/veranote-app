import type { DictationAuditEvent } from '@/types/dictation';

export type DictationSessionSummary = {
  sessionId: string;
  lastOccurredAt: string;
  providerId: string;
  providerLabel: string;
  engineLabel: string;
  encounterId: string;
  noteId?: string;
  eventCount: number;
  eventNames: string[];
  flaggedEventCount: number;
  insertedEventCount: number;
  flaggedTypes: string[];
  fallbackTransitionCount: number;
  draftResumeCount: number;
  finalState: 'stopped_cleanly' | 'stopped_with_errors' | 'active_or_unresolved';
  insertionOutcome: 'inserted_into_source' | 'captured_not_inserted' | 'no_final_output';
};

export type DictationTrendWindow = {
  label: '7d' | '30d';
  sessionCount: number;
  fallbackRate: number;
  insertionSuccessRate: number;
  reopenRate: number;
  flaggedRate: number;
};

export function formatDictationProviderLabel(sttProvider?: string) {
  if (!sttProvider) {
    return 'Unknown provider';
  }

  if (sttProvider === 'openai-transcription') {
    return 'OpenAI transcription';
  }

  if (sttProvider === 'mock-stt') {
    return 'Mock STT';
  }

  return sttProvider.replace(/-/g, ' ');
}

export function formatDictationEngineLabel(modelOrEngine?: string) {
  if (!modelOrEngine) {
    return 'Unknown engine';
  }

  if (modelOrEngine === 'whisper-1') {
    return 'Whisper 1';
  }

  if (modelOrEngine === 'mock-clinical-dictation') {
    return 'Mock clinical dictation';
  }

  return modelOrEngine.replace(/[-_]/g, ' ');
}

function getSessionEngineLabel(events: DictationAuditEvent[]) {
  const engineValue = events.find((event) => typeof event.payload?.modelOrEngine === 'string')?.payload?.modelOrEngine;
  return formatDictationEngineLabel(typeof engineValue === 'string' ? engineValue : undefined);
}

export function formatDictationEventName(eventName: DictationAuditEvent['eventName']) {
  return eventName.replace(/^dictation_/, '').replace(/_/g, ' ');
}

export function summarizeDictationSessions(events: DictationAuditEvent[]) {
  const grouped = new Map<string, DictationAuditEvent[]>();

  for (const event of events) {
    const sessionId = event.dictationSessionId || 'unknown-session';
    const existing = grouped.get(sessionId) || [];
    existing.push(event);
    grouped.set(sessionId, existing);
  }

  return [...grouped.entries()]
    .map(([sessionId, sessionEvents]) => {
      const sorted = [...sessionEvents].sort((left, right) => (
        new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
      ));
      const flaggedEvents = sessionEvents.filter((event) => (
        event.eventName === 'dictation_session_error'
        || event.eventName === 'dictation_segment_review_flagged'
      ));
      const insertedEventCount = sessionEvents.filter((event) => event.eventName === 'dictation_segment_inserted').length;
      const finalSegmentCount = sessionEvents.filter((event) => event.eventName === 'dictation_final_segment').length;
      const fallbackTransitionCount = sessionEvents.filter((event) => (
        event.eventName === 'dictation_session_error'
        && event.payload?.fallback === 'polling'
      )).length;
      const draftResumeCount = sessionEvents.filter((event) => event.eventName === 'dictation_draft_resumed').length;
      const hasStopEvent = sessionEvents.some((event) => event.eventName === 'dictation_session_stopped');
      const finalState: DictationSessionSummary['finalState'] = hasStopEvent
        ? (flaggedEvents.length ? 'stopped_with_errors' : 'stopped_cleanly')
        : 'active_or_unresolved';
      const insertionOutcome: DictationSessionSummary['insertionOutcome'] = insertedEventCount > 0
        ? 'inserted_into_source'
        : finalSegmentCount > 0
          ? 'captured_not_inserted'
          : 'no_final_output';

      return {
        sessionId,
        lastOccurredAt: sorted[0]?.occurredAt || new Date().toISOString(),
        providerId: sorted[0]?.sttProvider || 'unknown-provider',
        providerLabel: formatDictationProviderLabel(sorted[0]?.sttProvider),
        engineLabel: getSessionEngineLabel(sorted),
        encounterId: sorted[0]?.encounterId || 'unknown-encounter',
        noteId: sorted.find((event) => event.noteId)?.noteId,
        eventCount: sorted.length,
        eventNames: sorted
          .map((event) => formatDictationEventName(event.eventName))
          .filter((name, index, names) => index === names.indexOf(name))
          .slice(0, 4),
        flaggedEventCount: flaggedEvents.length,
        insertedEventCount,
        flaggedTypes: flaggedEvents
          .map((event) => formatDictationEventName(event.eventName))
          .filter((name, index, names) => index === names.indexOf(name)),
        fallbackTransitionCount,
        draftResumeCount,
        finalState,
        insertionOutcome,
      } satisfies DictationSessionSummary;
    })
    .sort((left, right) => new Date(right.lastOccurredAt).getTime() - new Date(left.lastOccurredAt).getTime());
}

export function getJumpDraftId(session: DictationSessionSummary | null) {
  if (!session) {
    return null;
  }

  if (session.noteId?.startsWith('draft_')) {
    return session.noteId;
  }

  if (session.encounterId?.startsWith('draft_')) {
    return session.encounterId;
  }

  return null;
}

export function buildDictationTrendWindows(
  sessions: DictationSessionSummary[],
  nowIso = new Date().toISOString(),
) {
  const now = new Date(nowIso).getTime();

  const buildWindow = (label: DictationTrendWindow['label'], days: number): DictationTrendWindow => {
    const cutoff = now - (days * 24 * 60 * 60 * 1000);
    const windowSessions = sessions.filter((session) => new Date(session.lastOccurredAt).getTime() >= cutoff);
    const count = windowSessions.length;
    const ratio = (value: number) => count ? Math.round((value / count) * 100) : 0;

    return {
      label,
      sessionCount: count,
      fallbackRate: ratio(windowSessions.filter((session) => session.fallbackTransitionCount > 0).length),
      insertionSuccessRate: ratio(windowSessions.filter((session) => session.insertionOutcome === 'inserted_into_source').length),
      reopenRate: ratio(windowSessions.filter((session) => session.draftResumeCount > 0).length),
      flaggedRate: ratio(windowSessions.filter((session) => session.flaggedEventCount > 0).length),
    };
  };

  return [
    buildWindow('7d', 7),
    buildWindow('30d', 30),
  ];
}
