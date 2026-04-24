import { describe, expect, it } from 'vitest';
import {
  applyInterimSegment,
  createLocalDictationSession,
  markSegmentInserted,
  queueFinalSegment,
  setDictationUiState,
} from '@/lib/dictation/session-store';
import type { TranscriptSegment } from '@/types/dictation';

function buildSegment(overrides: Partial<TranscriptSegment> = {}): TranscriptSegment {
  return {
    id: 'segment-1',
    dictationSessionId: 'dictation-session-1',
    encounterId: 'encounter-1',
    targetSection: 'clinicianNotes',
    text: 'Patient denies SI today.',
    isFinal: true,
    reviewStatus: 'needs_review',
    reviewFlags: [],
    source: {
      provider: 'mock-stt',
      mode: 'manual',
    },
    createdAt: '2026-04-23T00:00:00.000Z',
    ...overrides,
  };
}

describe('dictation session store', () => {
  it('tracks interim, pending, and inserted segments in order', () => {
    let session = createLocalDictationSession({ targetSection: 'clinicianNotes', sessionId: 'dictation-session-1' });
    session = setDictationUiState(session, 'listening');
    session = applyInterimSegment(session, buildSegment({ id: 'segment-interim', isFinal: false, reviewStatus: 'not_required', text: 'Patient denies ...' }));
    session = queueFinalSegment(session, buildSegment());

    expect(session.uiState).toBe('final_ready');
    expect(session.interimSegment).toBeUndefined();
    expect(session.pendingSegments).toHaveLength(1);

    session = markSegmentInserted(session, 'segment-1', 'dictation-tx-1');

    expect(session.pendingSegments).toHaveLength(0);
    expect(session.insertedSegments[0]?.insertedTransactionId).toBe('dictation-tx-1');
    expect(session.uiState).toBe('committed');
  });
});
