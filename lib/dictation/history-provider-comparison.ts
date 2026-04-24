import type { DictationSessionSummary } from '@/lib/dictation/history-summary';
import type { DictationReviewLink } from '@/lib/dictation/history-review-link';

export type DictationProviderComparison = {
  providerId: string;
  providerLabel: string;
  engineLabel: string;
  sessionCount: number;
  insertionSuccessRate: number;
  carriedInsertionRate: number;
  reviewCompleteRate: number;
  needsReviewRate: number;
  fallbackRate: number;
  flaggedRate: number;
};

export type DictationProviderDriftComparison = {
  providerId: string;
  providerLabel: string;
  engineLabel: string;
  recentSessionCount: number;
  baselineSessionCount: number;
  insertionSuccessDrift: number;
  reviewCompleteDrift: number;
  needsReviewDrift: number;
  fallbackDrift: number;
  flaggedDrift: number;
  driftStatus: 'improving' | 'slipping' | 'steady';
};

export type DictationProviderAlert = {
  providerId: string;
  providerLabel: string;
  engineLabel: string;
  severity: 'warning' | 'watch' | 'positive';
  title: string;
  detail: string;
};

function ratio(count: number, total: number) {
  return total ? Math.round((count / total) * 100) : 0;
}

function buildProviderMetrics(
  sessions: DictationSessionSummary[],
  linksBySession: Map<string, DictationReviewLink>,
) {
  const count = sessions.length;
  const groupedLinks = sessions
    .map((session) => linksBySession.get(session.sessionId))
    .filter(Boolean) as DictationReviewLink[];

  return {
    sessionCount: count,
    insertionSuccessRate: ratio(
      sessions.filter((session) => session.insertionOutcome === 'inserted_into_source').length,
      count,
    ),
    carriedInsertionRate: ratio(
      groupedLinks.filter((link) => link.carriedInsertionCount > 0).length,
      count,
    ),
    reviewCompleteRate: ratio(
      groupedLinks.filter((link) => link.linkedReviewState === 'review_complete').length,
      count,
    ),
    needsReviewRate: ratio(
      groupedLinks.filter((link) => link.linkedReviewState === 'needs_review').length,
      count,
    ),
    fallbackRate: ratio(
      sessions.filter((session) => session.fallbackTransitionCount > 0).length,
      count,
    ),
    flaggedRate: ratio(
      sessions.filter((session) => session.flaggedEventCount > 0).length,
      count,
    ),
  };
}

export function buildDictationProviderComparisons(
  sessions: DictationSessionSummary[],
  links: DictationReviewLink[],
) {
  const linksBySession = new Map(links.map((link) => [link.sessionId, link]));
  const grouped = new Map<string, DictationSessionSummary[]>();

  for (const session of sessions) {
    const key = `${session.providerId}::${session.engineLabel}`;
    const existing = grouped.get(key) || [];
    existing.push(session);
    grouped.set(key, existing);
  }

  return [...grouped.entries()]
    .map(([_, groupedSessions]) => {
      const example = groupedSessions[0]!;
      const metrics = buildProviderMetrics(groupedSessions, linksBySession);

      return {
        providerId: example.providerId,
        providerLabel: example.providerLabel,
        engineLabel: example.engineLabel,
        ...metrics,
      } satisfies DictationProviderComparison;
    })
    .sort((left, right) => (
      right.sessionCount - left.sessionCount
      || right.reviewCompleteRate - left.reviewCompleteRate
      || left.needsReviewRate - right.needsReviewRate
    ));
}

export function buildDictationProviderDriftComparisons(
  sessions: DictationSessionSummary[],
  links: DictationReviewLink[],
  nowIso = new Date().toISOString(),
) {
  const linksBySession = new Map(links.map((link) => [link.sessionId, link]));
  const now = new Date(nowIso).getTime();
  const recentCutoff = now - (7 * 24 * 60 * 60 * 1000);
  const baselineCutoff = now - (30 * 24 * 60 * 60 * 1000);
  const grouped = new Map<string, DictationSessionSummary[]>();

  for (const session of sessions) {
    const key = `${session.providerId}::${session.engineLabel}`;
    const existing = grouped.get(key) || [];
    existing.push(session);
    grouped.set(key, existing);
  }

  return [...grouped.entries()]
    .map(([_, groupedSessions]) => {
      const example = groupedSessions[0]!;
      const recentSessions = groupedSessions.filter((session) => new Date(session.lastOccurredAt).getTime() >= recentCutoff);
      const baselineSessions = groupedSessions.filter((session) => {
        const time = new Date(session.lastOccurredAt).getTime();
        return time >= baselineCutoff && time < recentCutoff;
      });

      const recentMetrics = buildProviderMetrics(recentSessions, linksBySession);
      const baselineMetrics = buildProviderMetrics(baselineSessions, linksBySession);

      const insertionSuccessDrift = recentMetrics.insertionSuccessRate - baselineMetrics.insertionSuccessRate;
      const reviewCompleteDrift = recentMetrics.reviewCompleteRate - baselineMetrics.reviewCompleteRate;
      const needsReviewDrift = recentMetrics.needsReviewRate - baselineMetrics.needsReviewRate;
      const fallbackDrift = recentMetrics.fallbackRate - baselineMetrics.fallbackRate;
      const flaggedDrift = recentMetrics.flaggedRate - baselineMetrics.flaggedRate;
      const driftScore = insertionSuccessDrift + reviewCompleteDrift - needsReviewDrift - fallbackDrift - flaggedDrift;

      const driftStatus: DictationProviderDriftComparison['driftStatus'] = recentMetrics.sessionCount === 0
        ? 'steady'
        : driftScore >= 15
          ? 'improving'
          : driftScore <= -15
            ? 'slipping'
            : 'steady';

      return {
        providerId: example.providerId,
        providerLabel: example.providerLabel,
        engineLabel: example.engineLabel,
        recentSessionCount: recentMetrics.sessionCount,
        baselineSessionCount: baselineMetrics.sessionCount,
        insertionSuccessDrift,
        reviewCompleteDrift,
        needsReviewDrift,
        fallbackDrift,
        flaggedDrift,
        driftStatus,
      } satisfies DictationProviderDriftComparison;
    })
    .filter((item) => item.recentSessionCount > 0 || item.baselineSessionCount > 0)
    .sort((left, right) => (
      (right.recentSessionCount + right.baselineSessionCount) - (left.recentSessionCount + left.baselineSessionCount)
      || Math.abs(right.insertionSuccessDrift) - Math.abs(left.insertionSuccessDrift)
    ));
}

export function buildDictationProviderAlerts(input: {
  comparisons: DictationProviderComparison[];
  driftComparisons: DictationProviderDriftComparison[];
}) {
  const comparisonByKey = new Map(
    input.comparisons.map((item) => [`${item.providerId}::${item.engineLabel}`, item]),
  );

  const alerts = input.driftComparisons.flatMap((drift) => {
    const key = `${drift.providerId}::${drift.engineLabel}`;
    const comparison = comparisonByKey.get(key);
    const recentSample = drift.recentSessionCount;
    const totalSample = drift.recentSessionCount + drift.baselineSessionCount;
    const providerRef = `${drift.providerLabel} ${drift.engineLabel}`;
    const nextAlerts: DictationProviderAlert[] = [];

    if (drift.driftStatus === 'slipping' && recentSample >= 2) {
      if (drift.reviewCompleteDrift <= -20) {
        nextAlerts.push({
          providerId: drift.providerId,
          providerLabel: drift.providerLabel,
          engineLabel: drift.engineLabel,
          severity: 'warning',
          title: `${providerRef} is slipping on review completion`,
          detail: `Recent review completion is down ${Math.abs(drift.reviewCompleteDrift)} points versus its prior baseline.`,
        });
      } else if (drift.fallbackDrift >= 20) {
        nextAlerts.push({
          providerId: drift.providerId,
          providerLabel: drift.providerLabel,
          engineLabel: drift.engineLabel,
          severity: 'warning',
          title: `${providerRef} is hitting more fallback transitions`,
          detail: `Fallback pressure is up ${drift.fallbackDrift} points in the last 7 days.`,
        });
      } else if (drift.flaggedDrift >= 20) {
        nextAlerts.push({
          providerId: drift.providerId,
          providerLabel: drift.providerLabel,
          engineLabel: drift.engineLabel,
          severity: 'warning',
          title: `${providerRef} is producing more flagged sessions`,
          detail: `Flagged-session rate is up ${drift.flaggedDrift} points in the last 7 days.`,
        });
      }
    }

    if (comparison && comparison.needsReviewRate >= 50 && totalSample >= 2) {
      nextAlerts.push({
        providerId: drift.providerId,
        providerLabel: drift.providerLabel,
        engineLabel: drift.engineLabel,
        severity: 'watch',
        title: `${providerRef} still leaves too many sessions needing review`,
        detail: `${comparison.needsReviewRate}% of saved sessions still need review after dictation.`,
      });
    }

    if (comparison && comparison.reviewCompleteRate >= 80 && drift.driftStatus === 'improving' && recentSample >= 2) {
      nextAlerts.push({
        providerId: drift.providerId,
        providerLabel: drift.providerLabel,
        engineLabel: drift.engineLabel,
        severity: 'positive',
        title: `${providerRef} is holding up well`,
        detail: `Recent runs are improving and ${comparison.reviewCompleteRate}% of linked sessions are review-complete.`,
      });
    }

    if (recentSample > 0 && recentSample < 2) {
      nextAlerts.push({
        providerId: drift.providerId,
        providerLabel: drift.providerLabel,
        engineLabel: drift.engineLabel,
        severity: 'watch',
        title: `${providerRef} has low recent sample size`,
        detail: `Only ${recentSample} recent session is available, so drift should be treated cautiously.`,
      });
    }

    return nextAlerts;
  });

  const severityRank = { warning: 0, watch: 1, positive: 2 } as const;
  return alerts
    .sort((left, right) => severityRank[left.severity] - severityRank[right.severity] || left.title.localeCompare(right.title))
    .slice(0, 6);
}
