'use client';

import { useMemo, useState } from 'react';
import { summarizeVeraGaps } from '@/lib/beta/vera-gaps';
import type { BetaFeedbackItem, BetaFeedbackStatus, VeraGapType } from '@/types/beta-feedback';

type BetaFeedbackInboxProps = {
  feedback: BetaFeedbackItem[];
};

const categoryLabels: Record<BetaFeedbackItem['category'], string> = {
  workflow: 'Workflow issue',
  navigation: 'Hard to find',
  'feature-request': 'Need this added',
  bug: 'Error / bug',
  general: 'General feedback',
};

const statusLabels: Record<BetaFeedbackStatus, string> = {
  new: 'New',
  planned: 'Planned',
  taught: 'Taught',
};

const gapTypeLabels: Record<VeraGapType, string> = {
  knowledge: 'Knowledge',
  workflow: 'Workflow',
  drafting: 'Drafting',
  revision: 'Revision',
  'coding-reference': 'Coding / reference',
};

export function BetaFeedbackInbox({ feedback }: BetaFeedbackInboxProps) {
  const [items, setItems] = useState(feedback);
  const [activeGapType, setActiveGapType] = useState<VeraGapType | 'all'>('all');
  const [activeGapStatus, setActiveGapStatus] = useState<BetaFeedbackStatus | 'all'>('all');
  const [copiedQuestion, setCopiedQuestion] = useState('');

  const veraGapSummaries = useMemo(() => summarizeVeraGaps(items), [items]);
  const filteredGapSummaries = useMemo(() => veraGapSummaries.filter((summary) => {
    if (activeGapType !== 'all' && summary.gapType !== activeGapType) {
      return false;
    }

    if (activeGapStatus === 'all') {
      return true;
    }

    return summary.sample.status === activeGapStatus;
  }), [activeGapStatus, activeGapType, veraGapSummaries]);
  const orderedFeedback = useMemo(() => [...items].sort((a, b) => {
    const aGap = a.metadata?.source === 'vera-gap' ? 1 : 0;
    const bGap = b.metadata?.source === 'vera-gap' ? 1 : 0;

    if (bGap !== aGap) {
      return bGap - aGap;
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }), [items]);

  if (!items.length) {
    return (
      <div className="aurora-panel rounded-[28px] p-6">
        <h2 className="text-lg font-semibold">No beta feedback yet</h2>
        <p className="mt-2 text-sm text-muted">Once providers start sending feedback from the workspace, it will appear here for daily review.</p>
      </div>
    );
  }

  async function updateStatus(id: string, status: BetaFeedbackStatus) {
    const response = await fetch('/api/beta-feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });

    const data = await response.json() as { feedback?: BetaFeedbackItem; error?: string };

    if (!response.ok || !data.feedback) {
      throw new Error(data.error || 'Unable to update feedback status right now.');
    }

    setItems((current) => current.map((item) => item.id === id ? data.feedback as BetaFeedbackItem : item));
  }

  async function replayQuestion(question: string) {
    try {
      await navigator.clipboard.writeText(question);
      setCopiedQuestion(question);
      window.setTimeout(() => setCopiedQuestion(''), 2000);
    } catch {
      setCopiedQuestion(question);
      window.setTimeout(() => setCopiedQuestion(''), 2000);
    }
  }

  return (
    <div className="grid gap-5">
      {veraGapSummaries.length ? (
        <section className="aurora-panel rounded-[28px] p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Vera gaps</div>
              <h2 className="mt-1 text-2xl font-semibold text-white">Questions Vera still needs to learn</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-50/82">
                This is the live queue of unanswered provider asks. Use it to see what Vera misses most often, which note lanes they happen in, and which skills should be taught next.
              </p>
            </div>
            <div className="grid min-w-[220px] gap-2 text-sm text-cyan-50/76">
              <div className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.44)] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Tracked gap families</div>
                <div className="mt-1 text-xl font-semibold text-white">{veraGapSummaries.length}</div>
              </div>
              <div className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.44)] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Captured gap events</div>
                <div className="mt-1 text-xl font-semibold text-white">{items.filter((item) => item.metadata?.source === 'vera-gap').length}</div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveGapType('all')}
              className={filterButtonClass(activeGapType === 'all')}
            >
              All gap types
            </button>
            {(Object.keys(gapTypeLabels) as VeraGapType[]).map((gapType) => (
              <button
                key={gapType}
                type="button"
                onClick={() => setActiveGapType(gapType)}
                className={filterButtonClass(activeGapType === gapType)}
              >
                {gapTypeLabels[gapType]}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveGapStatus('all')}
              className={filterButtonClass(activeGapStatus === 'all')}
            >
              All statuses
            </button>
            {(['new', 'planned', 'taught'] as BetaFeedbackStatus[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setActiveGapStatus(status)}
                className={filterButtonClass(activeGapStatus === status)}
              >
                {statusLabels[status]}
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4">
            {filteredGapSummaries.map((summary) => (
              <section key={summary.key} className="rounded-[22px] border border-cyan-200/10 bg-[rgba(13,30,50,0.44)] p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-cyan-200/14 bg-[rgba(18,181,208,0.12)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50">
                        {gapTypeLabels[summary.gapType]}
                      </span>
                      <span className="rounded-full border border-cyan-200/14 bg-[rgba(13,30,50,0.58)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50">
                        {summary.count} occurrence{summary.count === 1 ? '' : 's'}
                      </span>
                      <span className="rounded-full border border-cyan-200/14 bg-[rgba(13,30,50,0.58)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-50">
                        {statusLabels[summary.sample.status]}
                      </span>
                    </div>
                    <div className="mt-3 text-lg font-semibold text-white">{summary.question}</div>
                    <div className="mt-2 text-sm text-cyan-50/72">
                      Last seen {new Date(summary.latestAt).toLocaleString()} • {summary.sample.metadata?.providerAddressingName || 'Unknown provider'}
                      {summary.sample.metadata?.noteType ? ` • ${summary.sample.metadata.noteType}` : ''}
                      {summary.sample.metadata?.stage ? ` • ${summary.sample.metadata.stage}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void replayQuestion(summary.question)}
                      className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                    >
                      Replay question
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateStatus(summary.sample.id, 'planned')}
                      className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                    >
                      Mark planned
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateStatus(summary.sample.id, 'taught')}
                      className="aurora-secondary-button rounded-xl px-3 py-2 text-xs font-medium"
                    >
                      Mark taught
                    </button>
                  </div>
                </div>
                {copiedQuestion === summary.question ? (
                  <div className="mt-3 text-xs text-emerald-100/88">Original question copied so it can be replayed while teaching Vera.</div>
                ) : null}
              </section>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4">
        {orderedFeedback.map((item) => (
          <section key={item.id} className="aurora-panel rounded-[28px] p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-lg font-semibold text-white">{categoryLabels[item.category]}</div>
                <div className="mt-1 text-sm text-cyan-50/76">
                  {item.pageContext} • {new Date(item.createdAt).toLocaleString()}
                </div>
                {item.metadata?.source === 'vera-gap' ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-cyan-50/72">
                    <span className="rounded-full border border-cyan-200/14 bg-[rgba(18,181,208,0.12)] px-2 py-1 font-semibold uppercase tracking-[0.12em] text-cyan-50">
                      Vera gap
                    </span>
                    {item.metadata.gapType ? <span>{gapTypeLabels[item.metadata.gapType]}</span> : null}
                    {item.metadata.providerAddressingName ? <span>• {item.metadata.providerAddressingName}</span> : null}
                    {item.metadata.noteType ? <span>• {item.metadata.noteType}</span> : null}
                    {item.metadata.stage ? <span>• {item.metadata.stage}</span> : null}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="aurora-pill rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]">
                  {statusLabels[item.status]}
                </div>
                {item.metadata?.source === 'vera-gap' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void updateStatus(item.id, 'planned')}
                      className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
                    >
                      Planned
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateStatus(item.id, 'taught')}
                      className="rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-[11px] font-medium text-cyan-50 transition hover:border-cyan-200/24 hover:bg-[rgba(18,181,208,0.12)]"
                    >
                      Taught
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-cyan-50/88">{item.message}</p>
            {item.metadata?.source === 'vera-gap' && item.metadata.originalQuestion ? (
              <div className="mt-4 rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.44)] px-4 py-3 text-sm text-cyan-50/82">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100">Original question</div>
                  <button
                    type="button"
                    onClick={() => void replayQuestion(item.metadata?.originalQuestion || '')}
                    className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100 hover:text-white"
                  >
                    Replay
                  </button>
                </div>
                <div className="mt-1">{item.metadata.originalQuestion}</div>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}

function filterButtonClass(active: boolean) {
  return `rounded-full border px-3 py-1.5 text-xs font-medium transition ${
    active
      ? 'border-cyan-200/30 bg-[rgba(18,181,208,0.18)] text-cyan-50'
      : 'border-cyan-200/10 bg-[rgba(13,30,50,0.68)] text-ink hover:border-cyan-200/20 hover:bg-[rgba(18,181,208,0.12)] hover:text-cyan-50'
  }`;
}
