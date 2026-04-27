'use client';

import { useState } from 'react';
import type { AmbientReviewFlag } from '@/types/ambient-listening';
import type { AmbientDraftSectionViewModel } from '@/lib/ambient-listening/mock-data';

export function AmbientDraftReviewPanel({
  sections,
  reviewFlags,
  onAcceptSentence,
  onRejectSentence,
  onEditSentence,
  onJumpToSource,
  onAcceptSection,
}: {
  sections: AmbientDraftSectionViewModel[];
  reviewFlags: AmbientReviewFlag[];
  onAcceptSentence: (sentenceId: string) => void;
  onRejectSentence: (sentenceId: string) => void;
  onEditSentence: (sentenceId: string, text: string) => void;
  onJumpToSource: (turnId: string) => void;
  onAcceptSection: (sectionId: string) => void;
}) {
  const [editing, setEditing] = useState<Record<string, string>>({});

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Evidence-linked draft</div>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Accept only what the encounter actually supports</h3>
          <p className="mt-2 text-sm text-slate-600">
            Draft sentences stay tied to transcript evidence. If speaker attribution or source support is unresolved, the sentence should not be accepted casually.
          </p>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
          {reviewFlags.length} review flag{reviewFlags.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="mt-5 rounded-[18px] border border-slate-200 bg-slate-50 p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Open review flags</div>
        <div className="mt-3 space-y-2">
          {reviewFlags.map((flag) => (
            <div key={flag.flagId} className="rounded-[14px] border border-amber-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-950">
                  {flag.category.replace(/_/g, ' ')}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                  {flag.severity}
                </span>
              </div>
              <div className="mt-2 text-sm text-slate-800">{flag.message}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {sections.map((section) => (
          <div key={section.sectionId} className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-950">{section.label}</div>
              <button
                type="button"
                onClick={() => onAcceptSection(section.sectionId)}
                className="rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              >
                Accept section
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {section.sentences.map((sentence) => {
                const draftText = editing[sentence.sentenceId] ?? sentence.text;
                const hasBlockingFlags = sentence.blockingFlagIds.length > 0;

                return (
                  <div key={sentence.sentenceId} className={`rounded-[16px] border p-4 ${sentence.accepted ? 'border-emerald-200 bg-emerald-50/60' : sentence.rejected ? 'border-rose-200 bg-rose-50/60' : 'border-white bg-white'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                        {sentence.assertionType.replace(/_/g, ' ')}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                        {sentence.supportSummary}
                      </span>
                      {hasBlockingFlags ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-950">
                          blocking review needed
                        </span>
                      ) : null}
                    </div>

                    <textarea
                      value={draftText}
                      onChange={(event) => setEditing((current) => ({ ...current, [sentence.sentenceId]: event.target.value }))}
                      className="mt-3 min-h-[88px] w-full rounded-[14px] border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-900"
                    />

                    <div className="mt-3 flex flex-wrap gap-2">
                      {sentence.primaryTurnIds.map((turnId) => (
                        <button
                          key={`${sentence.sentenceId}-${turnId}`}
                          type="button"
                          onClick={() => onJumpToSource(turnId)}
                          className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-950"
                        >
                          Jump to {turnId}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onAcceptSentence(sentence.sentenceId)}
                        disabled={hasBlockingFlags}
                        className="rounded-[14px] bg-emerald-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditSentence(sentence.sentenceId, draftText)}
                        className="rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                      >
                        Save edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectSentence(sentence.sentenceId)}
                        className="rounded-[14px] border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-950"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
