import { describe, expect, it } from 'vitest';
import { buildDictationTrendWindows, getJumpDraftId, summarizeDictationSessions } from '@/lib/dictation/history-summary';
import type { DictationAuditEvent } from '@/types/dictation';

function createEvent(overrides?: Partial<DictationAuditEvent>): DictationAuditEvent {
  return {
    id: `dictation-event-${Math.random().toString(36).slice(2, 8)}`,
    eventName: 'dictation_session_started',
    eventDomain: 'session',
    occurredAt: '2026-04-24T04:00:00.000Z',
    encounterId: 'draft_123',
    noteId: 'draft_123',
    dictationSessionId: 'session-1',
    actorUserId: 'provider-1',
    sttProvider: 'openai-transcription',
    mode: 'provider_dictation',
    payload: {},
    containsPhi: false,
    retentionClass: 'audit_only',
    ...overrides,
  };
}

describe('dictation history summary', () => {
  it('derives final state, insertion outcome, fallback transitions, and draft reopen count', () => {
    const summaries = summarizeDictationSessions([
      createEvent(),
      createEvent({
        id: 'event-final',
        eventName: 'dictation_final_segment',
        eventDomain: 'transcript',
        occurredAt: '2026-04-24T04:01:00.000Z',
      }),
      createEvent({
        id: 'event-inserted',
        eventName: 'dictation_segment_inserted',
        eventDomain: 'editor',
        occurredAt: '2026-04-24T04:02:00.000Z',
      }),
      createEvent({
        id: 'event-fallback',
        eventName: 'dictation_session_error',
        eventDomain: 'frontend',
        occurredAt: '2026-04-24T04:03:00.000Z',
        payload: {
          fallback: 'polling',
        },
      }),
      createEvent({
        id: 'event-resume',
        eventName: 'dictation_draft_resumed',
        eventDomain: 'frontend',
        occurredAt: '2026-04-24T04:04:00.000Z',
      }),
      createEvent({
        id: 'event-stopped',
        eventName: 'dictation_session_stopped',
        eventDomain: 'session',
        occurredAt: '2026-04-24T04:05:00.000Z',
      }),
    ]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.finalState).toBe('stopped_with_errors');
    expect(summaries[0]?.insertionOutcome).toBe('inserted_into_source');
    expect(summaries[0]?.fallbackTransitionCount).toBe(1);
    expect(summaries[0]?.draftResumeCount).toBe(1);
  });

  it('derives provider and engine labels from the saved audit trail', () => {
    const summaries = summarizeDictationSessions([
      createEvent(),
      createEvent({
        id: 'event-final',
        eventName: 'dictation_final_segment',
        eventDomain: 'transcript',
        occurredAt: '2026-04-24T04:01:00.000Z',
        payload: {
          modelOrEngine: 'whisper-1',
        },
      }),
    ]);

    expect(summaries[0]).toMatchObject({
      providerId: 'openai-transcription',
      providerLabel: 'OpenAI transcription',
      engineLabel: 'Whisper 1',
    });
  });

  it('falls back to encounter id when deriving a resumable draft id', () => {
    const session = summarizeDictationSessions([
      createEvent({
        noteId: undefined,
        encounterId: 'draft_resume_target',
      }),
    ])[0] || null;

    expect(getJumpDraftId(session)).toBe('draft_resume_target');
  });

  it('builds 7-day and 30-day trend windows from session summaries', () => {
    const sessions = summarizeDictationSessions([
      createEvent({
        dictationSessionId: 'session-1',
        occurredAt: '2026-04-23T12:00:00.000Z',
      }),
      createEvent({
        id: 'session-1-inserted',
        dictationSessionId: 'session-1',
        eventName: 'dictation_segment_inserted',
        eventDomain: 'editor',
        occurredAt: '2026-04-23T12:01:00.000Z',
      }),
      createEvent({
        id: 'session-1-stopped',
        dictationSessionId: 'session-1',
        eventName: 'dictation_session_stopped',
        occurredAt: '2026-04-23T12:02:00.000Z',
      }),
      createEvent({
        id: 'session-2-start',
        dictationSessionId: 'session-2',
        occurredAt: '2026-04-20T09:00:00.000Z',
      }),
      createEvent({
        id: 'session-2-error',
        dictationSessionId: 'session-2',
        eventName: 'dictation_session_error',
        eventDomain: 'frontend',
        occurredAt: '2026-04-20T09:01:00.000Z',
        payload: {
          fallback: 'polling',
        },
      }),
      createEvent({
        id: 'session-2-stopped',
        dictationSessionId: 'session-2',
        eventName: 'dictation_session_stopped',
        occurredAt: '2026-04-20T09:02:00.000Z',
      }),
      createEvent({
        id: 'session-3-start',
        dictationSessionId: 'session-3',
        occurredAt: '2026-04-01T10:00:00.000Z',
      }),
      createEvent({
        id: 'session-3-resume',
        dictationSessionId: 'session-3',
        eventName: 'dictation_draft_resumed',
        eventDomain: 'frontend',
        occurredAt: '2026-04-01T10:01:00.000Z',
      }),
      createEvent({
        id: 'session-3-stopped',
        dictationSessionId: 'session-3',
        eventName: 'dictation_session_stopped',
        occurredAt: '2026-04-01T10:02:00.000Z',
      }),
    ]);

    const [sevenDay, thirtyDay] = buildDictationTrendWindows(sessions, '2026-04-24T12:00:00.000Z');

    expect(sevenDay).toMatchObject({
      label: '7d',
      sessionCount: 2,
      insertionSuccessRate: 50,
      fallbackRate: 50,
      reopenRate: 0,
      flaggedRate: 50,
    });
    expect(thirtyDay).toMatchObject({
      label: '30d',
      sessionCount: 3,
      insertionSuccessRate: 33,
      fallbackRate: 33,
      reopenRate: 33,
      flaggedRate: 33,
    });
  });
});
