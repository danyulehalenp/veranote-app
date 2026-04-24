import { getReviewStatusCounts } from '@/lib/veranote/draft-recovery';
import type { PersistedDraftSession } from '@/types/session';
import type { DictationSessionSummary } from '@/lib/dictation/history-summary';

export type DictationReviewLink = {
  sessionId: string;
  linkedDraftId?: string;
  linked: boolean;
  linkedDraftArchived: boolean;
  carriedInsertionCount: number;
  linkedReviewState: 'no_draft' | 'draft_no_review' | 'needs_review' | 'review_complete';
  confirmedEvidenceCount: number;
  reviewAttentionCount: number;
};

export type DictationReviewTrendWindow = {
  label: '7d' | '30d';
  linkedDraftRate: number;
  carriedInsertionRate: number;
  reviewCompleteRate: number;
  needsReviewRate: number;
};

function flattenInsertions(draft: PersistedDraftSession) {
  return Object.values(draft.dictationInsertions || {}).flatMap((items) => items || []);
}

export function buildDictationReviewLinks(
  sessions: DictationSessionSummary[],
  drafts: PersistedDraftSession[],
) {
  const draftById = new Map(drafts.map((draft) => [draft.id, draft]));

  return sessions.map((session) => {
    const candidateDraftId = session.noteId?.startsWith('draft_')
      ? session.noteId
      : session.encounterId?.startsWith('draft_')
        ? session.encounterId
        : undefined;
    const linkedDraft = candidateDraftId ? draftById.get(candidateDraftId) : undefined;
    const reviewCounts = linkedDraft ? getReviewStatusCounts(linkedDraft.sectionReviewState) : {
      approved: 0,
      needsReview: 0,
      unreviewed: 0,
      confirmedEvidence: 0,
    };
    const carriedInsertionCount = linkedDraft
      ? flattenInsertions(linkedDraft).filter((item) => item.dictationSessionId === session.sessionId).length
      : 0;

    let linkedReviewState: DictationReviewLink['linkedReviewState'] = 'no_draft';
    if (linkedDraft) {
      if (!Object.values(linkedDraft.sectionReviewState || {}).length) {
        linkedReviewState = 'draft_no_review';
      } else if (reviewCounts.needsReview || reviewCounts.unreviewed) {
        linkedReviewState = 'needs_review';
      } else {
        linkedReviewState = 'review_complete';
      }
    }

    return {
      sessionId: session.sessionId,
      linkedDraftId: linkedDraft?.id,
      linked: Boolean(linkedDraft),
      linkedDraftArchived: Boolean(linkedDraft?.archivedAt),
      carriedInsertionCount,
      linkedReviewState,
      confirmedEvidenceCount: reviewCounts.confirmedEvidence,
      reviewAttentionCount: reviewCounts.needsReview + reviewCounts.unreviewed,
    } satisfies DictationReviewLink;
  });
}

export function buildDictationReviewTrendWindows(
  sessions: DictationSessionSummary[],
  links: DictationReviewLink[],
  nowIso = new Date().toISOString(),
) {
  const linksBySession = new Map(links.map((link) => [link.sessionId, link]));
  const now = new Date(nowIso).getTime();

  const buildWindow = (label: DictationReviewTrendWindow['label'], days: number): DictationReviewTrendWindow => {
    const cutoff = now - (days * 24 * 60 * 60 * 1000);
    const windowSessions = sessions.filter((session) => new Date(session.lastOccurredAt).getTime() >= cutoff);
    const windowLinks = windowSessions.map((session) => linksBySession.get(session.sessionId)).filter(Boolean) as DictationReviewLink[];
    const count = windowSessions.length;
    const ratio = (value: number) => count ? Math.round((value / count) * 100) : 0;

    return {
      label,
      linkedDraftRate: ratio(windowLinks.filter((link) => link.linked).length),
      carriedInsertionRate: ratio(windowLinks.filter((link) => link.carriedInsertionCount > 0).length),
      reviewCompleteRate: ratio(windowLinks.filter((link) => link.linkedReviewState === 'review_complete').length),
      needsReviewRate: ratio(windowLinks.filter((link) => link.linkedReviewState === 'needs_review').length),
    };
  };

  return [
    buildWindow('7d', 7),
    buildWindow('30d', 30),
  ];
}
