'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DRAFT_SESSION_KEY } from '@/lib/constants/storage';
import type { DraftSession } from '@/types/session';

type SavedDraft = DraftSession & {
  id: string;
  updatedAt: string;
};

function excerpt(value: string, max = 160) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, max).trimEnd()}...`;
}

export function SavedDraftsList() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('All specialties');

  useEffect(() => {
    async function loadDrafts() {
      try {
        const response = await fetch('/api/drafts', { cache: 'no-store' });
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
    }

    void loadDrafts();
  }, []);

  const specialtyOptions = useMemo(() => {
    const values = Array.from(new Set(drafts.map((draft) => draft.specialty))).filter(Boolean);
    return ['All specialties', ...values];
  }, [drafts]);

  const filteredDrafts = useMemo(() => {
    if (selectedSpecialty === 'All specialties') {
      return drafts;
    }

    return drafts.filter((draft) => draft.specialty === selectedSpecialty);
  }, [drafts, selectedSpecialty]);

  function handleOpenDraft(draft: SavedDraft) {
    const session: DraftSession = {
      specialty: draft.specialty,
      role: draft.role,
      noteType: draft.noteType,
      template: draft.template,
      outputStyle: draft.outputStyle,
      format: draft.format,
      keepCloserToSource: draft.keepCloserToSource,
      flagMissingInfo: draft.flagMissingInfo,
      sourceInput: draft.sourceInput,
      sourceSections: draft.sourceSections,
      note: draft.note,
      flags: draft.flags,
      copilotSuggestions: draft.copilotSuggestions,
      sectionReviewState: draft.sectionReviewState,
      mode: draft.mode,
      warning: draft.warning,
    };

    localStorage.setItem(DRAFT_SESSION_KEY, JSON.stringify(session));
    router.push('/dashboard/review');
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
      <div className="aurora-panel flex flex-col gap-4 rounded-[28px] p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Recent Drafts</h2>
          <p className="mt-1 text-sm text-muted">Open a recent draft to continue review, editing, or rewriting without starting from scratch.</p>
        </div>
        <div className="w-full md:w-[260px]">
          <label className="grid gap-2 text-sm font-medium text-ink">
            <span>Filter by specialty</span>
            <select value={selectedSpecialty} onChange={(event) => setSelectedSpecialty(event.target.value)} className="rounded-lg border border-border bg-white p-3">
              {specialtyOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {!filteredDrafts.length ? (
        <div className="aurora-panel rounded-[28px] p-6">
          <h3 className="text-lg font-semibold">No saved drafts yet</h3>
          <p className="mt-2 text-sm text-muted">Generate and save a few drafts first, then reopen them here for review, editing, or rewriting.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredDrafts.map((draft) => {
            const reviewEntries = Object.values(draft.sectionReviewState || {});
            const approvedCount = reviewEntries.filter((entry) => entry.status === 'approved').length;
            const needsReviewCount = reviewEntries.filter((entry) => entry.status === 'needs-review').length;
            const confirmedEvidenceCount = reviewEntries.reduce((total, entry) => total + (entry.confirmedEvidenceBlockIds?.length || 0), 0);

            return (
              <button
                key={draft.id}
                type="button"
                onClick={() => handleOpenDraft(draft)}
                className="aurora-panel rounded-[26px] p-5 text-left transition hover:shadow-md"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-ink">{draft.noteType}</div>
                    <div className="mt-1 text-sm text-muted">
                      {draft.specialty} • {draft.role} • {draft.template}
                    </div>
                  </div>
                  <div className="aurora-pill rounded-full px-3 py-1 text-xs font-medium">
                    Saved {new Date(draft.updatedAt).toLocaleString()}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">Approved sections: {approvedCount}</span>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-900">Needs review: {needsReviewCount}</span>
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-violet-800">Confirmed evidence: {confirmedEvidenceCount}</span>
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
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
