'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getDraftReviewAttentionCount, getReviewStatusCounts } from '@/lib/veranote/draft-recovery';
import { getCurrentProviderId, getDraftRecoveryStorageKey, getDraftSessionStorageKey } from '@/lib/veranote/provider-identity';
import type { DraftRecoveryState, DraftSession, PersistedDraftSession } from '@/types/session';

type SavedDraft = PersistedDraftSession;

type DraftRecoveryStage = 'setup' | 'generate' | 'review' | 'polish';
type DraftVisibilityFilter = 'active' | 'archived' | 'all';
type DraftSortMode = 'recommended' | 'recent' | 'needs-review' | 'ready-to-finalize';

type DraftStatusMeta = {
  stage: DraftRecoveryStage;
  label: string;
  detail: string;
  pillClassName: string;
  stageStorageValue: 'compose' | 'review';
};

function excerpt(value: string, max = 160) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, max).trimEnd()}...`;
}

function getDraftStatusMeta(draft: SavedDraft): DraftStatusMeta {
  const hasSource = Boolean(draft.sourceInput?.trim());
  const hasNote = Boolean(draft.note?.trim());
  const reviewAttentionCount = getDraftReviewAttentionCount(draft);
  const reviewEntryCount = Object.values(draft.sectionReviewState || {}).length;

  if (!hasSource) {
    return {
      stage: 'setup',
      label: 'Finish setup',
      detail: 'This draft still needs source material before note generation can continue.',
      pillClassName: 'border-slate-200 bg-slate-50 text-slate-900',
      stageStorageValue: 'compose',
    };
  }

  if (!hasNote) {
    return {
      stage: 'generate',
      label: 'Ready to generate',
      detail: 'Source is loaded. Reopen this draft to generate the note in the main workspace.',
      pillClassName: 'border-cyan-200 bg-cyan-50 text-cyan-950',
      stageStorageValue: 'compose',
    };
  }

  if (!reviewEntryCount || reviewAttentionCount > 0) {
    return {
      stage: 'review',
      label: 'Review in progress',
      detail: 'A generated note is available and still has sections that need review.',
      pillClassName: 'border-amber-200 bg-amber-50 text-amber-950',
      stageStorageValue: 'review',
    };
  }

  return {
    stage: 'polish',
    label: 'Ready to finalize',
    detail: 'The note appears fully reviewed and is ready for final polish or export.',
    pillClassName: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    stageStorageValue: 'review',
  };
}

function formatRelativeUpdate(updatedAt: string) {
  const date = new Date(updatedAt);
  const diffMs = Date.now() - date.getTime();

  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return date.toLocaleString();
  }

  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) {
    return 'just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return date.toLocaleDateString();
}

function buildDraftSession(draft: SavedDraft, stageOverride?: 'compose' | 'review'): DraftSession {
  return {
    draftId: draft.id,
    draftVersion: draft.version,
    providerIdentityId: draft.providerIdentityId,
    lastSavedAt: draft.updatedAt,
    specialty: draft.specialty,
    role: draft.role,
    noteType: draft.noteType,
    template: draft.template,
    outputStyle: draft.outputStyle,
    format: draft.format,
    keepCloserToSource: draft.keepCloserToSource,
    flagMissingInfo: draft.flagMissingInfo,
    outputScope: draft.outputScope,
    requestedSections: draft.requestedSections,
    selectedPresetId: draft.selectedPresetId,
    presetName: draft.presetName,
    customInstructions: draft.customInstructions,
    encounterSupport: draft.encounterSupport,
    medicationProfile: draft.medicationProfile,
    diagnosisProfile: draft.diagnosisProfile,
    sourceInput: draft.sourceInput,
    sourceSections: draft.sourceSections,
    note: draft.note,
    flags: draft.flags,
    copilotSuggestions: draft.copilotSuggestions,
    sectionReviewState: draft.sectionReviewState,
    recoveryState: {
      ...(draft.recoveryState || {
        workflowStage: stageOverride || getDraftStatusMeta(draft).stageStorageValue,
        composeLane: 'finish',
        recommendedStage: stageOverride || getDraftStatusMeta(draft).stageStorageValue,
        updatedAt: draft.updatedAt,
      }),
      workflowStage: stageOverride || draft.recoveryState?.workflowStage || getDraftStatusMeta(draft).stageStorageValue,
      recommendedStage: stageOverride || draft.recoveryState?.recommendedStage || getDraftStatusMeta(draft).stageStorageValue,
      updatedAt: new Date().toISOString(),
      lastOpenedAt: new Date().toISOString(),
    } as DraftRecoveryState,
    mode: draft.mode,
    warning: draft.warning,
  };
}

function getRecommendationScore(draft: SavedDraft) {
  const statusMeta = getDraftStatusMeta(draft);
  const reviewAttentionCount = getDraftReviewAttentionCount(draft);
  const recency = new Date(draft.lastOpenedAt || draft.updatedAt).getTime() || 0;
  const statusWeightMap: Record<DraftRecoveryStage, number> = {
    review: 5,
    generate: 4,
    polish: 3,
    setup: 2,
  };

  return (statusWeightMap[statusMeta.stage] * 1_000_000_000_000) + (reviewAttentionCount * 10_000_000_000) + recency;
}

export function SavedDraftsList() {
  const router = useRouter();
  const { data: sessionData } = useSession();
  const resolvedProviderIdentityId = sessionData?.user?.providerIdentityId || getCurrentProviderId();
  const draftSessionStorageKey = getDraftSessionStorageKey(resolvedProviderIdentityId);
  const draftRecoveryStorageKey = getDraftRecoveryStorageKey(resolvedProviderIdentityId);
  const draftStageStorageKey = `${draftSessionStorageKey}-stage`;
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('All specialties');
  const [selectedStage, setSelectedStage] = useState<'All stages' | DraftRecoveryStage>('All stages');
  const [visibilityFilter, setVisibilityFilter] = useState<DraftVisibilityFilter>('active');
  const [sortMode, setSortMode] = useState<DraftSortMode>('recommended');
  const [actionDraftId, setActionDraftId] = useState<string | null>(null);

  const loadDrafts = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(
        `/api/drafts?providerId=${encodeURIComponent(resolvedProviderIdentityId)}&includeArchived=true`,
        { cache: 'no-store' },
      );
      const data = (await response.json()) as { drafts?: SavedDraft[]; error?: string };

      if (!response.ok) {
        throw new Error(data?.error || 'Unable to load saved drafts right now.');
      }

      setDrafts(Array.isArray(data.drafts) ? data.drafts : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load saved drafts right now.');
    } finally {
      setIsLoading(false);
    }
  }, [resolvedProviderIdentityId]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const specialtyOptions = useMemo(() => {
    const values = Array.from(new Set(drafts.map((draft) => draft.specialty))).filter(Boolean);
    return ['All specialties', ...values];
  }, [drafts]);

  const filteredDrafts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return drafts
      .filter((draft) => {
        const statusMeta = getDraftStatusMeta(draft);
        const matchesVisibility =
          visibilityFilter === 'all'
          || (visibilityFilter === 'archived' ? Boolean(draft.archivedAt) : !draft.archivedAt);
        const matchesSpecialty = selectedSpecialty === 'All specialties' || draft.specialty === selectedSpecialty;
        const matchesStage = selectedStage === 'All stages' || statusMeta.stage === selectedStage;
        const matchesQuery =
          !normalizedQuery
          || [
            draft.noteType,
            draft.specialty,
            draft.role,
            draft.template,
            draft.sourceInput,
            draft.note,
          ]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(normalizedQuery));

        return matchesVisibility && matchesSpecialty && matchesStage && matchesQuery;
      })
      .sort((left, right) => {
        if (sortMode === 'recent') {
          return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        }

        if (sortMode === 'needs-review') {
          return getDraftReviewAttentionCount(right) - getDraftReviewAttentionCount(left);
        }

        if (sortMode === 'ready-to-finalize') {
          return Number(getDraftStatusMeta(right).stage === 'polish') - Number(getDraftStatusMeta(left).stage === 'polish')
            || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        }

        return getRecommendationScore(right) - getRecommendationScore(left);
      });
  }, [drafts, query, selectedSpecialty, selectedStage, sortMode, visibilityFilter]);

  const draftSummary = useMemo(() => {
    const activeDrafts = drafts.filter((draft) => !draft.archivedAt);
    const archivedDrafts = drafts.filter((draft) => Boolean(draft.archivedAt));
    const reviewReady = activeDrafts.filter((draft) => Boolean(draft.note)).length;
    const withSource = activeDrafts.filter((draft) => draft.sourceInput?.trim()).length;
    const needsAttention = activeDrafts.filter((draft) => getDraftReviewAttentionCount(draft) > 0).length;
    const readyToGenerate = activeDrafts.filter((draft) => getDraftStatusMeta(draft).stage === 'generate').length;

    return {
      total: activeDrafts.length,
      archived: archivedDrafts.length,
      reviewReady,
      withSource,
      needsAttention,
      readyToGenerate,
    };
  }, [drafts]);

  const resumeCandidate = useMemo(() => {
    return drafts
      .filter((draft) => !draft.archivedAt)
      .sort((left, right) => getRecommendationScore(right) - getRecommendationScore(left))[0] || null;
  }, [drafts]);

  async function rememberDraftOpen(draft: SavedDraft, session: DraftSession) {
    localStorage.setItem(draftSessionStorageKey, JSON.stringify(session));
    localStorage.setItem(draftStageStorageKey, session.recoveryState?.workflowStage || getDraftStatusMeta(draft).stageStorageValue);
    localStorage.setItem(draftRecoveryStorageKey, JSON.stringify({
      draftId: draft.id,
      recoveryState: session.recoveryState,
    }));

    try {
      await fetch(`/api/drafts/${encodeURIComponent(draft.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark-opened',
          providerId: resolvedProviderIdentityId,
          recoveryState: session.recoveryState,
        }),
      });
    } catch {
      // Local recovery still works even if backend open-state sync fails.
    }
  }

  async function handleOpenDraft(draft: SavedDraft, stageOverride?: 'compose' | 'review') {
    const session = buildDraftSession(draft, stageOverride);
    await rememberDraftOpen(draft, session);
    router.push('/#workspace');
  }

  async function handleDraftAction(draft: SavedDraft, action: 'archive' | 'restore' | 'delete') {
    setActionDraftId(draft.id);
    setError('');

    try {
      if (action === 'delete') {
        const response = await fetch(
          `/api/drafts/${encodeURIComponent(draft.id)}?providerId=${encodeURIComponent(resolvedProviderIdentityId)}`,
          { method: 'DELETE' },
        );
        if (!response.ok) {
          const payload = await response.json() as { error?: string };
          throw new Error(payload.error || 'Unable to delete draft right now.');
        }
      } else {
        const response = await fetch(`/api/drafts/${encodeURIComponent(draft.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            providerId: resolvedProviderIdentityId,
          }),
        });

        if (!response.ok) {
          const payload = await response.json() as { error?: string };
          throw new Error(payload.error || 'Unable to update draft right now.');
        }
      }

      if (draft.id === resumeCandidate?.id && (action === 'archive' || action === 'delete')) {
        localStorage.removeItem(draftSessionStorageKey);
        localStorage.removeItem(draftRecoveryStorageKey);
        localStorage.removeItem(draftStageStorageKey);
      }

      await loadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update draft right now.');
    } finally {
      setActionDraftId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="aurora-panel rounded-[28px] p-6">
        <h2 className="text-lg font-semibold">Loading saved drafts...</h2>
        <p className="mt-2 text-sm text-muted">Pulling recent drafts from your saved draft library.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="aurora-panel grid gap-4 rounded-[28px] p-6">
        <div>
          <h2 className="text-lg font-semibold">Draft Recovery</h2>
          <p className="mt-1 text-sm text-muted">Use this as a provider-scoped recovery board. Resume the right working draft, clean up stale ones, and keep active notes from turning into duplicates.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(220px,0.8fr)_minmax(220px,0.8fr)_minmax(220px,0.8fr)_minmax(220px,0.8fr)]">
          <label className="grid gap-2 text-sm font-medium text-ink">
            <span>Search drafts</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search note type, source text, or draft text"
              className="rounded-lg border border-border bg-white p-3"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink">
            <span>Filter by specialty</span>
            <select value={selectedSpecialty} onChange={(event) => setSelectedSpecialty(event.target.value)} className="rounded-lg border border-border bg-white p-3">
              {specialtyOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink">
            <span>Filter by stage</span>
            <select
              value={selectedStage}
              onChange={(event) => setSelectedStage(event.target.value as 'All stages' | DraftRecoveryStage)}
              className="rounded-lg border border-border bg-white p-3"
            >
              <option>All stages</option>
              <option value="setup">Finish setup</option>
              <option value="generate">Ready to generate</option>
              <option value="review">Review in progress</option>
              <option value="polish">Ready to finalize</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink">
            <span>Visibility</span>
            <select
              value={visibilityFilter}
              onChange={(event) => setVisibilityFilter(event.target.value as DraftVisibilityFilter)}
              className="rounded-lg border border-border bg-white p-3"
            >
              <option value="active">Active only</option>
              <option value="archived">Archived only</option>
              <option value="all">All drafts</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink">
            <span>Sort</span>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as DraftSortMode)}
              className="rounded-lg border border-border bg-white p-3"
            >
              <option value="recommended">Best recovery point</option>
              <option value="recent">Most recent</option>
              <option value="needs-review">Most review work</option>
              <option value="ready-to-finalize">Ready to finalize</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="aurora-soft-panel rounded-[22px] p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Active drafts</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{draftSummary.total}</div>
        </div>
        <div className="aurora-soft-panel rounded-[22px] p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Archived</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{draftSummary.archived}</div>
        </div>
        <div className="aurora-soft-panel rounded-[22px] p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Generated notes</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{draftSummary.reviewReady}</div>
        </div>
        <div className="aurora-soft-panel rounded-[22px] p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">With source loaded</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{draftSummary.withSource}</div>
        </div>
        <div className="aurora-soft-panel rounded-[22px] p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Ready to generate</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{draftSummary.readyToGenerate}</div>
        </div>
        <div className="aurora-soft-panel rounded-[22px] p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Need review</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{draftSummary.needsAttention}</div>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {resumeCandidate ? (
        <div className="aurora-panel grid gap-4 rounded-[28px] border border-cyan-200/70 p-6 lg:grid-cols-[minmax(0,1.2fr)_auto] lg:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-900/75">Resume last working draft</div>
            <h3 className="mt-2 text-xl font-semibold text-ink">{resumeCandidate.noteType}</h3>
            <p className="mt-2 text-sm text-muted">{getDraftStatusMeta(resumeCandidate).detail}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
              <span className={`rounded-full border px-3 py-1 ${getDraftStatusMeta(resumeCandidate).pillClassName}`}>
                {getDraftStatusMeta(resumeCandidate).label}
              </span>
              <span className="rounded-full border border-border bg-paper px-3 py-1 text-muted">
                Updated {formatRelativeUpdate(resumeCandidate.updatedAt)}
              </span>
              <span className="rounded-full border border-border bg-paper px-3 py-1 text-muted">
                Last opened {formatRelativeUpdate(resumeCandidate.lastOpenedAt || resumeCandidate.updatedAt)}
              </span>
              <span className="rounded-full border border-border bg-paper px-3 py-1 text-muted">
                Version {resumeCandidate.version}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleOpenDraft(resumeCandidate)}
              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Resume last draft
            </button>
            {resumeCandidate.note?.trim() ? (
              <button
                type="button"
                onClick={() => void handleOpenDraft(resumeCandidate, 'review')}
                className="rounded-full border border-border bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:border-ink"
              >
                Jump to review
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleOpenDraft(resumeCandidate, 'compose')}
                className="rounded-full border border-border bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:border-ink"
              >
                Return to source entry
              </button>
            )}
          </div>
        </div>
      ) : null}

      {!filteredDrafts.length ? (
        <div className="aurora-panel rounded-[28px] p-6">
          <h3 className="text-lg font-semibold">{drafts.length ? 'No drafts match these filters' : 'No saved drafts yet'}</h3>
          <p className="mt-2 text-sm text-muted">
            {drafts.length
              ? 'Try clearing the search or stage filters to surface another recovery checkpoint.'
              : 'Generate and save a few drafts first, then reopen them here for review, editing, or cleanup.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredDrafts.map((draft) => {
            const statusMeta = getDraftStatusMeta(draft);
            const { approved, needsReview, unreviewed, confirmedEvidence } = getReviewStatusCounts(draft.sectionReviewState);

            return (
              <div key={draft.id} className={`aurora-panel rounded-[26px] p-5 text-left transition hover:shadow-md ${draft.archivedAt ? 'opacity-80' : ''}`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-ink">{draft.noteType}</div>
                    <div className="mt-1 text-sm text-muted">
                      {draft.specialty} • {draft.role} • {draft.template}
                    </div>
                    <p className="mt-3 max-w-2xl text-sm text-muted">{statusMeta.detail}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusMeta.pillClassName}`}>{statusMeta.label}</span>
                    <span className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">v{draft.version}</span>
                    <span className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">
                      Saved {formatRelativeUpdate(draft.updatedAt)}
                    </span>
                    {draft.archivedAt ? (
                      <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        Archived {formatRelativeUpdate(draft.archivedAt)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-900">
                    {draft.note?.trim() ? 'Generated note saved' : 'Source/setup only'}
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">Approved sections: {approved}</span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-900">Needs review: {needsReview}</span>
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-rose-900">Unreviewed: {unreviewed}</span>
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-violet-800">Confirmed evidence: {confirmedEvidence}</span>
                  <span className="rounded-full border border-border bg-paper px-3 py-1 text-muted">
                    Last opened {formatRelativeUpdate(draft.lastOpenedAt || draft.updatedAt)}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted">Source excerpt</div>
                    <p className="mt-2 text-sm text-ink">{excerpt(draft.sourceInput)}</p>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted">Draft excerpt</div>
                    <p className="mt-2 text-sm text-ink">{excerpt(draft.note)}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  {!draft.archivedAt ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleOpenDraft(draft)}
                        className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                      >
                        Resume recommended step
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleOpenDraft(draft, 'compose')}
                        className="rounded-full border border-border bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:border-ink"
                      >
                        Open source/setup
                      </button>
                      {draft.note?.trim() ? (
                        <button
                          type="button"
                          onClick={() => void handleOpenDraft(draft, 'review')}
                          className="rounded-full border border-border bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:border-ink"
                        >
                          Open review
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={actionDraftId === draft.id}
                        onClick={() => void handleDraftAction(draft, 'archive')}
                        className="rounded-full border border-border bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:border-ink disabled:opacity-60"
                      >
                        {actionDraftId === draft.id ? 'Working...' : 'Archive'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={actionDraftId === draft.id}
                      onClick={() => void handleDraftAction(draft, 'restore')}
                      className="rounded-full border border-border bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:border-ink disabled:opacity-60"
                    >
                      {actionDraftId === draft.id ? 'Working...' : 'Restore'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={actionDraftId === draft.id}
                    onClick={() => void handleDraftAction(draft, 'delete')}
                    className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-300 disabled:opacity-60"
                  >
                    {actionDraftId === draft.id ? 'Working...' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
