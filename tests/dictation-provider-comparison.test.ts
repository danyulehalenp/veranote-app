import { describe, expect, it } from 'vitest';
import {
  buildDictationProviderAlerts,
  buildDictationProviderComparisons,
  buildDictationProviderDriftComparisons,
} from '@/lib/dictation/history-provider-comparison';
import type { DictationSessionSummary } from '@/lib/dictation/history-summary';
import type { DictationReviewLink } from '@/lib/dictation/history-review-link';

function createSession(overrides?: Partial<DictationSessionSummary>): DictationSessionSummary {
  return {
    sessionId: 'session-1',
    lastOccurredAt: '2026-04-24T05:00:00.000Z',
    providerId: 'openai-transcription',
    providerLabel: 'OpenAI transcription',
    engineLabel: 'Whisper 1',
    encounterId: 'draft_1',
    noteId: 'draft_1',
    eventCount: 5,
    eventNames: ['session started'],
    flaggedEventCount: 0,
    insertedEventCount: 1,
    flaggedTypes: [],
    fallbackTransitionCount: 0,
    draftResumeCount: 0,
    finalState: 'stopped_cleanly',
    insertionOutcome: 'inserted_into_source',
    ...overrides,
  };
}

function createLink(overrides?: Partial<DictationReviewLink>): DictationReviewLink {
  return {
    sessionId: 'session-1',
    linkedDraftId: 'draft_1',
    linked: true,
    linkedDraftArchived: false,
    carriedInsertionCount: 1,
    linkedReviewState: 'review_complete',
    confirmedEvidenceCount: 1,
    reviewAttentionCount: 0,
    ...overrides,
  };
}

describe('dictation provider comparison', () => {
  it('groups by provider and engine and computes downstream rates', () => {
    const sessions = [
      createSession({
        sessionId: 'openai-1',
        noteId: 'draft_1',
        encounterId: 'draft_1',
      }),
      createSession({
        sessionId: 'openai-2',
        noteId: 'draft_2',
        encounterId: 'draft_2',
        insertedEventCount: 0,
        insertionOutcome: 'captured_not_inserted',
        flaggedEventCount: 1,
        flaggedTypes: ['segment review flagged'],
        fallbackTransitionCount: 1,
      }),
      createSession({
        sessionId: 'mock-1',
        providerId: 'mock-stt',
        providerLabel: 'Mock STT',
        engineLabel: 'Mock clinical dictation',
        noteId: 'draft_3',
        encounterId: 'draft_3',
      }),
    ];
    const links = [
      createLink({
        sessionId: 'openai-1',
        linkedDraftId: 'draft_1',
        carriedInsertionCount: 1,
        linkedReviewState: 'review_complete',
      }),
      createLink({
        sessionId: 'openai-2',
        linkedDraftId: 'draft_2',
        carriedInsertionCount: 0,
        linkedReviewState: 'needs_review',
        reviewAttentionCount: 1,
      }),
      createLink({
        sessionId: 'mock-1',
        linkedDraftId: 'draft_3',
        carriedInsertionCount: 1,
        linkedReviewState: 'review_complete',
      }),
    ];

    const comparisons = buildDictationProviderComparisons(sessions, links);

    expect(comparisons).toHaveLength(2);
    expect(comparisons[0]).toMatchObject({
      providerId: 'openai-transcription',
      engineLabel: 'Whisper 1',
      sessionCount: 2,
      insertionSuccessRate: 50,
      carriedInsertionRate: 50,
      reviewCompleteRate: 50,
      needsReviewRate: 50,
      fallbackRate: 50,
      flaggedRate: 50,
    });
    expect(comparisons[1]).toMatchObject({
      providerId: 'mock-stt',
      engineLabel: 'Mock clinical dictation',
      sessionCount: 1,
      insertionSuccessRate: 100,
      carriedInsertionRate: 100,
      reviewCompleteRate: 100,
      needsReviewRate: 0,
      fallbackRate: 0,
      flaggedRate: 0,
    });
  });

  it('computes recent drift against the earlier 30-day baseline', () => {
    const sessions = [
      createSession({
        sessionId: 'openai-recent',
        lastOccurredAt: '2026-04-23T05:00:00.000Z',
        noteId: 'draft_1',
        encounterId: 'draft_1',
      }),
      createSession({
        sessionId: 'openai-baseline',
        lastOccurredAt: '2026-04-10T05:00:00.000Z',
        noteId: 'draft_2',
        encounterId: 'draft_2',
        insertedEventCount: 0,
        insertionOutcome: 'captured_not_inserted',
        flaggedEventCount: 1,
        flaggedTypes: ['segment review flagged'],
        fallbackTransitionCount: 1,
      }),
      createSession({
        sessionId: 'mock-recent',
        providerId: 'mock-stt',
        providerLabel: 'Mock STT',
        engineLabel: 'Mock clinical dictation',
        lastOccurredAt: '2026-04-22T05:00:00.000Z',
        noteId: 'draft_3',
        encounterId: 'draft_3',
      }),
    ];
    const links = [
      createLink({
        sessionId: 'openai-recent',
        linkedDraftId: 'draft_1',
        carriedInsertionCount: 1,
        linkedReviewState: 'review_complete',
      }),
      createLink({
        sessionId: 'openai-baseline',
        linkedDraftId: 'draft_2',
        carriedInsertionCount: 0,
        linkedReviewState: 'needs_review',
        reviewAttentionCount: 1,
      }),
      createLink({
        sessionId: 'mock-recent',
        linkedDraftId: 'draft_3',
        carriedInsertionCount: 1,
        linkedReviewState: 'review_complete',
      }),
    ];

    const drift = buildDictationProviderDriftComparisons(sessions, links, '2026-04-24T12:00:00.000Z');

    expect(drift[0]).toMatchObject({
      providerId: 'openai-transcription',
      recentSessionCount: 1,
      baselineSessionCount: 1,
      insertionSuccessDrift: 100,
      reviewCompleteDrift: 100,
      needsReviewDrift: -100,
      fallbackDrift: -100,
      flaggedDrift: -100,
      driftStatus: 'improving',
    });
    expect(drift[1]).toMatchObject({
      providerId: 'mock-stt',
      recentSessionCount: 1,
      baselineSessionCount: 0,
      driftStatus: 'improving',
    });
  });

  it('derives operator-facing alerts from provider outcomes and drift', () => {
    const sessions = [
      createSession({
        sessionId: 'openai-recent-1',
        lastOccurredAt: '2026-04-23T05:00:00.000Z',
        noteId: 'draft_1',
        encounterId: 'draft_1',
        insertedEventCount: 0,
        insertionOutcome: 'captured_not_inserted',
        flaggedEventCount: 1,
        flaggedTypes: ['segment review flagged'],
        fallbackTransitionCount: 1,
      }),
      createSession({
        sessionId: 'openai-recent-2',
        lastOccurredAt: '2026-04-22T05:00:00.000Z',
        noteId: 'draft_2',
        encounterId: 'draft_2',
        insertedEventCount: 0,
        insertionOutcome: 'captured_not_inserted',
      }),
      createSession({
        sessionId: 'openai-baseline-1',
        lastOccurredAt: '2026-04-10T05:00:00.000Z',
        noteId: 'draft_3',
        encounterId: 'draft_3',
      }),
      createSession({
        sessionId: 'openai-baseline-2',
        lastOccurredAt: '2026-04-09T05:00:00.000Z',
        noteId: 'draft_4',
        encounterId: 'draft_4',
      }),
      createSession({
        sessionId: 'mock-recent',
        providerId: 'mock-stt',
        providerLabel: 'Mock STT',
        engineLabel: 'Mock clinical dictation',
        lastOccurredAt: '2026-04-22T05:00:00.000Z',
        noteId: 'draft_5',
        encounterId: 'draft_5',
      }),
    ];
    const links = [
      createLink({
        sessionId: 'openai-recent-1',
        linkedDraftId: 'draft_1',
        carriedInsertionCount: 0,
        linkedReviewState: 'needs_review',
        reviewAttentionCount: 1,
      }),
      createLink({
        sessionId: 'openai-recent-2',
        linkedDraftId: 'draft_2',
        carriedInsertionCount: 0,
        linkedReviewState: 'needs_review',
        reviewAttentionCount: 1,
      }),
      createLink({
        sessionId: 'openai-baseline-1',
        linkedDraftId: 'draft_3',
        carriedInsertionCount: 1,
        linkedReviewState: 'review_complete',
      }),
      createLink({
        sessionId: 'openai-baseline-2',
        linkedDraftId: 'draft_4',
        carriedInsertionCount: 1,
        linkedReviewState: 'review_complete',
      }),
      createLink({
        sessionId: 'mock-recent',
        linkedDraftId: 'draft_5',
        carriedInsertionCount: 1,
        linkedReviewState: 'review_complete',
      }),
    ];

    const comparisons = buildDictationProviderComparisons(sessions, links);
    const drift = buildDictationProviderDriftComparisons(sessions, links, '2026-04-24T12:00:00.000Z');
    const alerts = buildDictationProviderAlerts({
      comparisons,
      driftComparisons: drift,
    });

    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          title: expect.stringContaining('slipping on review completion'),
        }),
        expect.objectContaining({
          severity: 'watch',
          title: expect.stringContaining('still leaves too many sessions needing review'),
        }),
        expect.objectContaining({
          severity: 'watch',
          title: expect.stringContaining('low recent sample size'),
        }),
      ]),
    );
  });
});
