'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  buildDictationTrendWindows,
  formatDictationEventName,
  summarizeDictationSessions,
  getJumpDraftId,
  type DictationSessionSummary,
} from '@/lib/dictation/history-summary';
import {
  buildDictationReviewLinks,
  buildDictationReviewTrendWindows,
} from '@/lib/dictation/history-review-link';
import {
  buildDictationProviderAlerts,
  buildDictationProviderComparisons,
  buildDictationProviderDriftComparisons,
} from '@/lib/dictation/history-provider-comparison';
import { getCurrentProviderId } from '@/lib/veranote/provider-identity';
import type { DictationAuditEvent } from '@/types/dictation';
import type { PersistedDraftSession } from '@/types/session';

export function DictationHistoryDashboard() {
  const { data: sessionData } = useSession();
  const resolvedProviderIdentityId = sessionData?.user?.providerIdentityId || getCurrentProviderId();
  const [events, setEvents] = useState<DictationAuditEvent[]>([]);
  const [drafts, setDrafts] = useState<PersistedDraftSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'flagged' | 'clean'>('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [encounterFilter, setEncounterFilter] = useState('all');
  const [flagTypeFilter, setFlagTypeFilter] = useState<'all' | 'session error' | 'segment review flagged'>('all');
  const [insertionFilter, setInsertionFilter] = useState<'all' | 'with-insertions' | 'without-insertions'>('all');
  const [finalStateFilter, setFinalStateFilter] = useState<'all' | DictationSessionSummary['finalState']>('all');
  const [resumeFilter, setResumeFilter] = useState<'all' | 'resumed' | 'not-resumed'>('all');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      setError('');

      try {
        const [historyResponse, draftsResponse] = await Promise.all([
          fetch(`/api/dictation/audit?providerId=${encodeURIComponent(resolvedProviderIdentityId)}&limit=200`, {
            cache: 'no-store',
          }),
          fetch(`/api/drafts?providerId=${encodeURIComponent(resolvedProviderIdentityId)}&includeArchived=true`, {
            cache: 'no-store',
          }),
        ]);
        const payload = await historyResponse.json() as {
          events?: DictationAuditEvent[];
          error?: string;
        };
        const draftsPayload = await draftsResponse.json() as {
          drafts?: PersistedDraftSession[];
        };

        if (!historyResponse.ok) {
          throw new Error(payload.error || 'Unable to load dictation history.');
        }

        if (cancelled) {
          return;
        }

        const nextEvents = Array.isArray(payload.events) ? payload.events : [];
        const nextSessions = summarizeDictationSessions(nextEvents);
        setEvents(nextEvents);
        setDrafts(Array.isArray(draftsPayload.drafts) ? draftsPayload.drafts : []);
        setSelectedSessionId((current) => current || nextSessions[0]?.sessionId || '');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load dictation history.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedProviderIdentityId]);

  const sessionSummaries = useMemo(() => summarizeDictationSessions(events), [events]);
  const trendWindows = useMemo(() => buildDictationTrendWindows(sessionSummaries), [sessionSummaries]);
  const reviewLinks = useMemo(() => buildDictationReviewLinks(sessionSummaries, drafts), [drafts, sessionSummaries]);
  const reviewTrendWindows = useMemo(() => buildDictationReviewTrendWindows(sessionSummaries, reviewLinks), [reviewLinks, sessionSummaries]);
  const reviewLinkBySession = useMemo(() => new Map(reviewLinks.map((link) => [link.sessionId, link])), [reviewLinks]);
  const providerComparisons = useMemo(
    () => buildDictationProviderComparisons(sessionSummaries, reviewLinks).slice(0, 6),
    [reviewLinks, sessionSummaries],
  );
  const providerDriftComparisons = useMemo(
    () => buildDictationProviderDriftComparisons(sessionSummaries, reviewLinks).slice(0, 4),
    [reviewLinks, sessionSummaries],
  );
  const providerAlerts = useMemo(
    () => buildDictationProviderAlerts({
      comparisons: buildDictationProviderComparisons(sessionSummaries, reviewLinks),
      driftComparisons: buildDictationProviderDriftComparisons(sessionSummaries, reviewLinks),
    }),
    [reviewLinks, sessionSummaries],
  );

  const providerOptions = useMemo(() => ['all', ...Array.from(new Set(sessionSummaries.map((item) => item.providerLabel)))], [sessionSummaries]);
  const encounterOptions = useMemo(() => ['all', ...Array.from(new Set(sessionSummaries.map((item) => item.encounterId))).slice(0, 20)], [sessionSummaries]);

  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sessionSummaries.filter((item) => {
      const matchesQuery = !normalizedQuery || [
        item.sessionId,
        item.providerLabel,
        item.engineLabel,
        item.encounterId,
        ...item.eventNames,
      ].some((value) => value.toLowerCase().includes(normalizedQuery));

      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'flagged' ? item.flaggedEventCount > 0 : item.flaggedEventCount === 0);
      const matchesProvider = providerFilter === 'all' || item.providerLabel === providerFilter;
      const matchesEncounter = encounterFilter === 'all' || item.encounterId === encounterFilter;
      const matchesFlagType = flagTypeFilter === 'all' || item.flaggedTypes.includes(flagTypeFilter);
      const matchesInsertion = insertionFilter === 'all'
        || (insertionFilter === 'with-insertions' ? item.insertedEventCount > 0 : item.insertedEventCount === 0);
      const matchesFinalState = finalStateFilter === 'all' || item.finalState === finalStateFilter;
      const matchesResume = resumeFilter === 'all'
        || (resumeFilter === 'resumed' ? item.draftResumeCount > 0 : item.draftResumeCount === 0);

      return matchesQuery && matchesStatus && matchesProvider && matchesEncounter && matchesFlagType && matchesInsertion && matchesFinalState && matchesResume;
    });
  }, [encounterFilter, finalStateFilter, flagTypeFilter, insertionFilter, providerFilter, query, resumeFilter, sessionSummaries, statusFilter]);

  const selectedSessionEvents = useMemo(() => (
    events
      .filter((event) => event.dictationSessionId === selectedSessionId)
      .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
  ), [events, selectedSessionId]);

  const selectedSession = useMemo(() => (
    sessionSummaries.find((item) => item.sessionId === selectedSessionId) || null
  ), [selectedSessionId, sessionSummaries]);

  const totals = useMemo(() => ({
    sessions: sessionSummaries.length,
    events: events.length,
    flagged: sessionSummaries.filter((item) => item.flaggedEventCount > 0).length,
    inserted: sessionSummaries.filter((item) => item.insertedEventCount > 0).length,
    openai: sessionSummaries.filter((item) => item.providerLabel === 'OpenAI transcription').length,
    resumed: sessionSummaries.filter((item) => item.draftResumeCount > 0).length,
    fallback: sessionSummaries.filter((item) => item.fallbackTransitionCount > 0).length,
  }), [events.length, sessionSummaries]);
  const selectedDraftId = getJumpDraftId(selectedSession);
  const selectedReviewLink = selectedSession ? reviewLinkBySession.get(selectedSession.sessionId) || null : null;

  if (isLoading) {
    return (
      <div className="aurora-panel rounded-[28px] p-6 text-sm text-cyan-50/78">
        Loading dictation history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="aurora-panel rounded-[28px] p-6 text-sm text-rose-100">
        {error}
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="aurora-panel rounded-[28px] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Dictation history</div>
            <h2 className="mt-1 text-2xl font-semibold text-white">Saved sessions and event trails</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-50/82">
              Review past dictation runs, inspect flagged sessions, and open the full event trail without relying on the active compose session still being live.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-cyan-50/78">
            <span className="aurora-pill rounded-full px-3 py-1">{totals.sessions} sessions</span>
            <span className="aurora-pill rounded-full px-3 py-1">{totals.events} events</span>
            <span className="aurora-pill rounded-full px-3 py-1">{totals.flagged} flagged</span>
            <span className="aurora-pill rounded-full px-3 py-1">{totals.inserted} with insertions</span>
            <span className="aurora-pill rounded-full px-3 py-1">{totals.openai} OpenAI</span>
            <span className="aurora-pill rounded-full px-3 py-1">{totals.resumed} reopened</span>
            <span className="aurora-pill rounded-full px-3 py-1">{totals.fallback} fallback transitions</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {trendWindows.map((window) => (
          <div key={window.label} className="aurora-panel rounded-[28px] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">{window.label === '7d' ? 'Last 7 days' : 'Last 30 days'}</div>
                <div className="mt-1 text-xl font-semibold text-white">{window.sessionCount} session{window.sessionCount === 1 ? '' : 's'}</div>
              </div>
              <span className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">
                Trend window
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Insertion success</div>
                <div className="mt-2 text-2xl font-semibold text-white">{window.insertionSuccessRate}%</div>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Fallback rate</div>
                <div className="mt-2 text-2xl font-semibold text-white">{window.fallbackRate}%</div>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Reopen rate</div>
                <div className="mt-2 text-2xl font-semibold text-white">{window.reopenRate}%</div>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Flagged-session rate</div>
                <div className="mt-2 text-2xl font-semibold text-white">{window.flaggedRate}%</div>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {reviewTrendWindows.map((window) => (
          <div key={`review-${window.label}`} className="aurora-panel rounded-[28px] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">{window.label === '7d' ? 'Review link 7 days' : 'Review link 30 days'}</div>
                <div className="mt-1 text-xl font-semibold text-white">Downstream review outcomes</div>
              </div>
              <span className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">
                Cross-link band
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Linked to draft</div>
                <div className="mt-2 text-2xl font-semibold text-white">{window.linkedDraftRate}%</div>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Carried into draft</div>
                <div className="mt-2 text-2xl font-semibold text-white">{window.carriedInsertionRate}%</div>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Review complete</div>
                <div className="mt-2 text-2xl font-semibold text-white">{window.reviewCompleteRate}%</div>
              </div>
              <div className="rounded-[18px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Still needs review</div>
                <div className="mt-2 text-2xl font-semibold text-white">{window.needsReviewRate}%</div>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="aurora-panel rounded-[28px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Operator flags</div>
            <div className="mt-1 text-xl font-semibold text-white">What needs inspection across transcription paths</div>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-50/78">
              Plain-language alerts derived from provider outcomes, review carry-through, drift, and sample size.
            </p>
          </div>
          <span className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">
            Prioritized view
          </span>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {providerAlerts.length ? providerAlerts.map((alert) => (
            <div
              key={`${alert.providerId}-${alert.engineLabel}-${alert.title}`}
              className={`rounded-[22px] border p-5 ${
                alert.severity === 'warning'
                  ? 'border-amber-300/24 bg-[rgba(245,158,11,0.12)]'
                  : alert.severity === 'positive'
                    ? 'border-emerald-300/24 bg-[rgba(16,185,129,0.12)]'
                    : 'border-white/10 bg-[rgba(255,255,255,0.04)]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{alert.title}</div>
                  <div className="mt-1 text-xs text-cyan-50/68">{alert.providerLabel} • {alert.engineLabel}</div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                  alert.severity === 'warning'
                    ? 'border border-amber-300/24 bg-[rgba(245,158,11,0.18)] text-amber-50'
                    : alert.severity === 'positive'
                      ? 'border border-emerald-300/24 bg-[rgba(16,185,129,0.18)] text-emerald-50'
                      : 'aurora-pill'
                }`}>
                  {alert.severity}
                </span>
              </div>
              <div className="mt-3 text-sm leading-7 text-cyan-50/80">
                {alert.detail}
              </div>
            </div>
          )) : (
            <div className="rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4 text-sm text-cyan-50/72">
              No provider-level operator flags are active yet.
            </div>
          )}
        </div>
      </section>

      <section className="aurora-panel rounded-[28px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Provider drift</div>
            <div className="mt-1 text-xl font-semibold text-white">Which transcription paths are improving or slipping</div>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-50/78">
              Recent 7-day behavior compared against the earlier 30-day baseline for each provider and engine pair.
            </p>
          </div>
          <span className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">
            7d vs prior 30d
          </span>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {providerDriftComparisons.length ? providerDriftComparisons.map((item) => (
            <div key={`drift-${item.providerId}-${item.engineLabel}`} className="rounded-[22px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{item.providerLabel}</div>
                  <div className="mt-1 text-xs text-cyan-50/68">{item.engineLabel}</div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                  item.driftStatus === 'improving'
                    ? 'border border-emerald-300/24 bg-[rgba(16,185,129,0.14)] text-emerald-50'
                    : item.driftStatus === 'slipping'
                      ? 'border border-amber-300/24 bg-[rgba(245,158,11,0.14)] text-amber-50'
                      : 'aurora-pill'
                }`}>
                  {item.driftStatus}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-cyan-50/72">
                <span className="aurora-pill rounded-full px-3 py-1">{item.recentSessionCount} recent</span>
                <span className="aurora-pill rounded-full px-3 py-1">{item.baselineSessionCount} baseline</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.03)] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">Insertion drift</div>
                  <div className="mt-2 text-xl font-semibold text-white">{item.insertionSuccessDrift > 0 ? '+' : ''}{item.insertionSuccessDrift} pts</div>
                </div>
                <div className="rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.03)] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">Review complete drift</div>
                  <div className="mt-2 text-xl font-semibold text-white">{item.reviewCompleteDrift > 0 ? '+' : ''}{item.reviewCompleteDrift} pts</div>
                </div>
                <div className="rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.03)] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">Needs review drift</div>
                  <div className="mt-2 text-xl font-semibold text-white">{item.needsReviewDrift > 0 ? '+' : ''}{item.needsReviewDrift} pts</div>
                </div>
                <div className="rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.03)] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">Fallback drift</div>
                  <div className="mt-2 text-xl font-semibold text-white">{item.fallbackDrift > 0 ? '+' : ''}{item.fallbackDrift} pts</div>
                </div>
              </div>
              <div className="mt-3 text-sm text-cyan-50/72">
                Flagged-session drift: <span className="font-medium text-white">{item.flaggedDrift > 0 ? '+' : ''}{item.flaggedDrift} pts</span>
              </div>
            </div>
          )) : (
            <div className="rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4 text-sm text-cyan-50/72">
              Drift reporting will appear once provider paths have both recent and baseline history to compare.
            </div>
          )}
        </div>
      </section>

      <section className="aurora-panel rounded-[28px] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Provider and engine outcomes</div>
            <div className="mt-1 text-xl font-semibold text-white">Which transcription path is holding up best downstream</div>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-50/78">
              Compare provider and engine combinations by carried insertion, review completion, flagged-session rate, and fallback pressure.
            </p>
          </div>
          <span className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">
            Ranked by session volume
          </span>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {providerComparisons.length ? providerComparisons.map((item) => (
            <div key={`${item.providerId}-${item.engineLabel}`} className="rounded-[22px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{item.providerLabel}</div>
                  <div className="mt-1 text-xs text-cyan-50/68">{item.engineLabel}</div>
                </div>
                <span className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">{item.sessionCount} sessions</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.03)] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">Insertion success</div>
                  <div className="mt-2 text-xl font-semibold text-white">{item.insertionSuccessRate}%</div>
                </div>
                <div className="rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.03)] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">Carried into draft</div>
                  <div className="mt-2 text-xl font-semibold text-white">{item.carriedInsertionRate}%</div>
                </div>
                <div className="rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.03)] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">Review complete</div>
                  <div className="mt-2 text-xl font-semibold text-white">{item.reviewCompleteRate}%</div>
                </div>
                <div className="rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.03)] p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">Still needs review</div>
                  <div className="mt-2 text-xl font-semibold text-white">{item.needsReviewRate}%</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-cyan-50/72">
                <span className="aurora-pill rounded-full px-3 py-1">{item.flaggedRate}% flagged</span>
                <span className="aurora-pill rounded-full px-3 py-1">{item.fallbackRate}% fallback</span>
              </div>
            </div>
          )) : (
            <div className="rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4 text-sm text-cyan-50/72">
              Provider and engine comparison will appear once saved sessions have enough metadata to compare.
            </div>
          )}
        </div>
      </section>

      <section className="aurora-panel grid gap-4 rounded-[28px] p-6 lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search session id, provider, encounter, or event..."
              className="workspace-control w-full rounded-xl px-3 py-2.5 text-sm"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="workspace-control w-full rounded-xl px-3 py-2.5 text-sm"
            >
              <option value="all">All sessions</option>
              <option value="flagged">Flagged only</option>
              <option value="clean">Clean only</option>
            </select>
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
              className="workspace-control w-full rounded-xl px-3 py-2.5 text-sm"
            >
              {providerOptions.map((option) => (
                <option key={option} value={option}>{option === 'all' ? 'All providers' : option}</option>
              ))}
            </select>
            <select
              value={encounterFilter}
              onChange={(event) => setEncounterFilter(event.target.value)}
              className="workspace-control w-full rounded-xl px-3 py-2.5 text-sm"
            >
              {encounterOptions.map((option) => (
                <option key={option} value={option}>{option === 'all' ? 'All encounters' : option}</option>
              ))}
            </select>
            <select
              value={flagTypeFilter}
              onChange={(event) => setFlagTypeFilter(event.target.value as typeof flagTypeFilter)}
              className="workspace-control w-full rounded-xl px-3 py-2.5 text-sm"
            >
              <option value="all">All flagged types</option>
              <option value="session error">Session error</option>
              <option value="segment review flagged">Segment review flagged</option>
            </select>
            <select
              value={insertionFilter}
              onChange={(event) => setInsertionFilter(event.target.value as typeof insertionFilter)}
              className="workspace-control w-full rounded-xl px-3 py-2.5 text-sm"
            >
              <option value="all">All insertion activity</option>
              <option value="with-insertions">With insertions</option>
              <option value="without-insertions">Without insertions</option>
            </select>
            <select
              value={finalStateFilter}
              onChange={(event) => setFinalStateFilter(event.target.value as typeof finalStateFilter)}
              className="workspace-control w-full rounded-xl px-3 py-2.5 text-sm"
            >
              <option value="all">All final states</option>
              <option value="stopped_cleanly">Stopped cleanly</option>
              <option value="stopped_with_errors">Stopped with errors</option>
              <option value="active_or_unresolved">Active or unresolved</option>
            </select>
            <select
              value={resumeFilter}
              onChange={(event) => setResumeFilter(event.target.value as typeof resumeFilter)}
              className="workspace-control w-full rounded-xl px-3 py-2.5 text-sm"
            >
              <option value="all">All reopen counts</option>
              <option value="resumed">Reopened from history</option>
              <option value="not-resumed">Not reopened</option>
            </select>
          </div>

          <div className="space-y-3">
            {filteredSessions.length ? filteredSessions.map((item) => (
              <button
                key={item.sessionId}
                type="button"
                onClick={() => setSelectedSessionId(item.sessionId)}
                className={`block w-full rounded-[20px] border p-4 text-left transition ${selectedSessionId === item.sessionId ? 'border-cyan-300/32 bg-[rgba(56,189,248,0.12)]' : 'border-white/10 bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.07)]'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">{item.providerLabel}</div>
                    <div className="mt-1 text-[11px] text-cyan-50/62">{item.engineLabel}</div>
                  </div>
                  <div className="text-xs text-cyan-50/66">
                    {new Date(item.lastOccurredAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
                <div className="mt-2 text-xs text-cyan-50/66">
                  {item.sessionId} • {item.encounterId}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">{item.eventCount} events</span>
                  {item.insertedEventCount ? (
                    <span className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">{item.insertedEventCount} inserted</span>
                  ) : null}
                  {item.fallbackTransitionCount ? (
                    <span className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">{item.fallbackTransitionCount} fallback</span>
                  ) : null}
                  {item.draftResumeCount ? (
                    <span className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">{item.draftResumeCount} reopened</span>
                  ) : null}
                  {item.flaggedEventCount ? (
                    <span className="rounded-full border border-amber-300/24 bg-[rgba(245,158,11,0.14)] px-3 py-1 text-xs font-medium text-amber-50">
                      {item.flaggedEventCount} flagged
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 text-sm text-cyan-50/78">
                  {item.eventNames.join(' • ')}
                </div>
              </button>
            )) : (
              <div className="rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4 text-sm text-cyan-50/72">
                No dictation sessions match the current filters.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/68">Session detail</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {selectedSession ? selectedSession.providerLabel : 'Select a session'}
                </div>
              </div>
              {selectedSession ? (
                <div className="text-xs text-cyan-50/66">
                  {selectedSession.sessionId}
                </div>
              ) : null}
            </div>
            {selectedSession ? (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-cyan-50/74">
                <span className="aurora-pill rounded-full px-3 py-1">{selectedSession.eventCount} events</span>
                <span className="aurora-pill rounded-full px-3 py-1">{selectedSession.encounterId}</span>
                <span className="aurora-pill rounded-full px-3 py-1">{selectedSession.engineLabel}</span>
                <span className="aurora-pill rounded-full px-3 py-1">{selectedSession.finalState.replace(/_/g, ' ')}</span>
                <span className="aurora-pill rounded-full px-3 py-1">{selectedSession.insertionOutcome.replace(/_/g, ' ')}</span>
                {selectedSession.insertedEventCount ? (
                  <span className="aurora-pill rounded-full px-3 py-1">{selectedSession.insertedEventCount} inserted</span>
                ) : null}
                {selectedSession.fallbackTransitionCount ? (
                  <span className="aurora-pill rounded-full px-3 py-1">{selectedSession.fallbackTransitionCount} fallback</span>
                ) : null}
                {selectedSession.draftResumeCount ? (
                  <span className="aurora-pill rounded-full px-3 py-1">{selectedSession.draftResumeCount} reopened</span>
                ) : null}
                {selectedSession.flaggedEventCount ? (
                  <span className="rounded-full border border-amber-300/24 bg-[rgba(245,158,11,0.14)] px-3 py-1 text-amber-50">
                    {selectedSession.flaggedEventCount} flagged
                  </span>
                ) : null}
                {selectedReviewLink?.linked ? (
                  <span className="aurora-pill rounded-full px-3 py-1">linked draft</span>
                ) : null}
              </div>
            ) : null}
            {selectedReviewLink ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3 text-sm text-cyan-50/78">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">Review state</div>
                  <div className="mt-2 font-medium text-white">{selectedReviewLink.linkedReviewState.replace(/_/g, ' ')}</div>
                </div>
                <div className="rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3 text-sm text-cyan-50/78">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">Carried insertions</div>
                  <div className="mt-2 font-medium text-white">{selectedReviewLink.carriedInsertionCount}</div>
                </div>
                <div className="rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3 text-sm text-cyan-50/78">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">Review attention</div>
                  <div className="mt-2 font-medium text-white">{selectedReviewLink.reviewAttentionCount}</div>
                </div>
                <div className="rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3 text-sm text-cyan-50/78">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/68">Confirmed evidence</div>
                  <div className="mt-2 font-medium text-white">{selectedReviewLink.confirmedEvidenceCount}</div>
                </div>
              </div>
            ) : null}
            {selectedDraftId && selectedSession ? (
              <div className="mt-4">
                <Link
                  href={`/dashboard/new-note?draftId=${encodeURIComponent(selectedDraftId)}&dictationSessionId=${encodeURIComponent(selectedSession.sessionId)}`}
                  className="inline-flex rounded-xl border border-cyan-300/24 bg-[rgba(56,189,248,0.14)] px-4 py-2 text-sm font-semibold text-cyan-50"
                >
                  Open originating draft
                </Link>
              </div>
            ) : (
              <p className="mt-3 text-sm text-cyan-50/72">
                {selectedSession ? 'This session does not point to a resumable draft.' : 'Choose a saved session to inspect the full audit trail.'}
              </p>
            )}
          </div>

          <div className="space-y-3">
            {selectedSessionEvents.length ? selectedSessionEvents.map((event) => (
              <div key={event.id} className="rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-white">{formatDictationEventName(event.eventName)}</div>
                  <div className="text-xs text-cyan-50/66">
                    {new Date(event.occurredAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                  </div>
                </div>
                <div className="mt-2 text-xs text-cyan-50/66">
                  {event.eventDomain} • {selectedSession?.providerLabel || 'Unknown provider'} • {event.encounterId}
                </div>
                <div className="mt-3 grid gap-2 text-sm text-cyan-50/78">
                  {Object.entries(event.payload).length ? Object.entries(event.payload).map(([key, value]) => (
                    <div key={`${event.id}-${key}`} className="rounded-[14px] border border-white/8 bg-white/5 px-3 py-2">
                      <span className="font-medium text-cyan-50/86">{key}:</span> {String(value)}
                    </div>
                  )) : (
                    <div className="rounded-[14px] border border-white/8 bg-white/5 px-3 py-2">
                      No extra detail.
                    </div>
                  )}
                </div>
              </div>
            )) : (
              <div className="rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-4 text-sm text-cyan-50/72">
                No saved event detail is available for the selected session yet.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
