import type { DraftComposeLane, DraftRecoveryState, DraftSession, PersistedDraftSession, ReviewStatus } from '@/types/session';

function countReviewStatuses(session: Pick<DraftSession, 'sectionReviewState'>) {
  const reviewEntries = Object.values(session.sectionReviewState || {});

  return {
    total: reviewEntries.length,
    approved: reviewEntries.filter((entry) => entry.status === 'approved').length,
    needsAttention: reviewEntries.filter((entry) => entry.status === 'needs-review' || entry.status === 'unreviewed').length,
  };
}

export function getRecommendedComposeLane(session: Pick<DraftSession, 'sourceInput' | 'note'>): DraftComposeLane {
  if (!session.sourceInput?.trim()) {
    return 'setup';
  }

  if (!session.note?.trim()) {
    return 'finish';
  }

  return 'finish';
}

export function buildDraftRecoveryState(
  session: Pick<DraftSession, 'sourceInput' | 'note' | 'sectionReviewState'>,
  options?: {
    workflowStage?: DraftRecoveryState['workflowStage'];
    composeLane?: DraftComposeLane;
    lastOpenedAt?: string;
    updatedAt?: string;
  },
): DraftRecoveryState {
  const updatedAt = options?.updatedAt || new Date().toISOString();
  const hasSource = Boolean(session.sourceInput?.trim());
  const hasNote = Boolean(session.note?.trim());
  const reviewCounts = countReviewStatuses(session);
  const composeLane = options?.composeLane || getRecommendedComposeLane(session);
  const recommendedStage = hasNote ? 'review' : 'compose';

  if (!hasSource) {
    return {
      workflowStage: options?.workflowStage || 'compose',
      composeLane: 'setup',
      recommendedStage: 'compose',
      updatedAt,
      lastOpenedAt: options?.lastOpenedAt,
    };
  }

  if (!hasNote) {
    return {
      workflowStage: options?.workflowStage || 'compose',
      composeLane,
      recommendedStage: 'compose',
      updatedAt,
      lastOpenedAt: options?.lastOpenedAt,
    };
  }

  if (!reviewCounts.total || reviewCounts.needsAttention > 0) {
    return {
      workflowStage: options?.workflowStage || 'review',
      composeLane,
      recommendedStage: 'review',
      updatedAt,
      lastOpenedAt: options?.lastOpenedAt,
    };
  }

  return {
    workflowStage: options?.workflowStage || 'review',
    composeLane,
    recommendedStage,
    updatedAt,
    lastOpenedAt: options?.lastOpenedAt,
  };
}

export function getDraftReviewAttentionCount(session: Pick<DraftSession, 'sectionReviewState'>) {
  return Object.values(session.sectionReviewState || {}).filter((entry) => (
    entry.status === 'needs-review' || entry.status === 'unreviewed'
  )).length;
}

export function getDraftPriorityScore(draft: Pick<PersistedDraftSession, 'note' | 'sourceInput' | 'updatedAt' | 'lastOpenedAt' | 'recoveryState' | 'sectionReviewState'>) {
  const reviewAttentionCount = getDraftReviewAttentionCount(draft);
  const hasNote = Boolean(draft.note?.trim());
  const hasSource = Boolean(draft.sourceInput?.trim());
  const recencySeed = new Date(draft.lastOpenedAt || draft.updatedAt).getTime() || 0;

  let stageWeight = 0;
  if (!hasSource) {
    stageWeight = 1;
  } else if (!hasNote) {
    stageWeight = 3;
  } else if (reviewAttentionCount > 0) {
    stageWeight = 4;
  } else {
    stageWeight = 2;
  }

  if (draft.recoveryState?.workflowStage === 'review' && hasNote) {
    stageWeight += 1;
  }

  return stageWeight * 1_000_000_000_000 + recencySeed;
}

export function getReviewStatusCounts(sectionReviewState: DraftSession['sectionReviewState']) {
  return Object.values(sectionReviewState || {}).reduce((counts, entry) => {
    if (entry.status === 'approved') {
      counts.approved += 1;
    } else if (entry.status === 'needs-review') {
      counts.needsReview += 1;
    } else if (entry.status === 'unreviewed') {
      counts.unreviewed += 1;
    }

    counts.confirmedEvidence += entry.confirmedEvidenceBlockIds?.length || 0;
    return counts;
  }, {
    approved: 0,
    needsReview: 0,
    unreviewed: 0,
    confirmedEvidence: 0,
  });
}

export function matchesReviewState(status: ReviewStatus | undefined) {
  return status === 'needs-review' || status === 'unreviewed';
}
