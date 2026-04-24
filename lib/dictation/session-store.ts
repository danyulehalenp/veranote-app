import type {
  DictationSessionConfig,
  DictationTargetSection,
  DictationUiState,
  LocalDictationSessionState,
  TranscriptSegment,
} from '@/types/dictation';

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createLocalDictationSession(config: Pick<DictationSessionConfig, 'targetSection'> & { sessionId?: string }): LocalDictationSessionState {
  return {
    sessionId: config.sessionId || createId('dictation-session'),
    targetSection: config.targetSection as DictationTargetSection | undefined,
    uiState: 'idle',
    pendingSegments: [],
    insertedSegments: [],
  };
}

export function setDictationUiState(
  session: LocalDictationSessionState,
  uiState: DictationUiState,
  error?: string,
): LocalDictationSessionState {
  const startedAt = session.startedAt || (uiState === 'starting' || uiState === 'listening' ? new Date().toISOString() : undefined);
  const stoppedAt = uiState === 'stopped' ? new Date().toISOString() : session.stoppedAt;

  return {
    ...session,
    uiState,
    startedAt,
    stoppedAt,
    lastError: error,
  };
}

export function updateDictationTarget(
  session: LocalDictationSessionState,
  targetSection?: DictationTargetSection,
): LocalDictationSessionState {
  return {
    ...session,
    targetSection,
  };
}

export function applyInterimSegment(
  session: LocalDictationSessionState,
  segment?: TranscriptSegment,
): LocalDictationSessionState {
  return {
    ...session,
    uiState: segment ? 'interim' : session.uiState,
    interimSegment: segment,
  };
}

export function queueFinalSegment(
  session: LocalDictationSessionState,
  segment: TranscriptSegment,
): LocalDictationSessionState {
  return {
    ...session,
    uiState: 'final_ready',
    interimSegment: undefined,
    pendingSegments: [...session.pendingSegments, segment],
  };
}

export function discardPendingSegment(
  session: LocalDictationSessionState,
  segmentId: string,
): LocalDictationSessionState {
  return {
    ...session,
    pendingSegments: session.pendingSegments.filter((segment) => segment.id !== segmentId),
  };
}

export function markSegmentInserted(
  session: LocalDictationSessionState,
  segmentId: string,
  transactionId: string,
): LocalDictationSessionState {
  const segment = session.pendingSegments.find((item) => item.id === segmentId);
  if (!segment) {
    return session;
  }

  return {
    ...session,
    uiState: 'committed',
    pendingSegments: session.pendingSegments.filter((item) => item.id !== segmentId),
    insertedSegments: [
      {
        ...segment,
        insertedTransactionId: transactionId,
        reviewStatus: segment.reviewFlags.length ? 'needs_review' : 'reviewed',
      },
      ...session.insertedSegments,
    ],
  };
}
