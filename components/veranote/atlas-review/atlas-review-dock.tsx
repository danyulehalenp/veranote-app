'use client';

import { useMemo, useState } from 'react';
import { AtlasSeverityBadge } from '@/components/veranote/atlas-review/atlas-severity-badge';
import { AssistantPersonaAvatar } from '@/components/veranote/assistant/assistant-persona-avatar';
import type { AssistantAvatarId } from '@/lib/veranote/assistant-persona';
import type { AtlasReviewGroup, AtlasReviewItem } from '@/lib/veranote/atlas-review';

const GROUP_ORDER: AtlasReviewGroup[] = ['Medication/Lab', 'Documentation', 'Risk', 'Workflow'];

type AtlasReviewDockProps = {
  items: AtlasReviewItem[];
  onAskAtlas: (item: AtlasReviewItem) => void;
  onShowSource: (item: AtlasReviewItem) => void;
  defaultOpen?: boolean;
  assistantName?: string;
  assistantAvatar?: AssistantAvatarId;
};

type AtlasNudgeStripProps = {
  items: AtlasReviewItem[];
  onAskAtlas: (item: AtlasReviewItem) => void;
  onShowSource: (item: AtlasReviewItem) => void;
  assistantName?: string;
};

function severityRank(item: AtlasReviewItem) {
  switch (item.severity) {
    case 'urgent':
      return 0;
    case 'caution':
      return 1;
    case 'review':
      return 2;
    case 'info':
    default:
      return 3;
  }
}

function groupItems(items: AtlasReviewItem[]) {
  return GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((item) => item.group === group).sort((left, right) => severityRank(left) - severityRank(right)),
  })).filter((entry) => entry.items.length);
}

export function AtlasNudgeStrip({
  items,
  onAskAtlas,
  onShowSource,
  assistantName = 'Assistant',
}: AtlasNudgeStripProps) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="grid gap-3">
      {items.slice(0, 3).map((item) => (
        <div
          key={item.id}
          className={`rounded-[18px] border px-4 py-3 shadow-[0_16px_34px_rgba(2,8,18,0.18)] ${
            item.severity === 'urgent'
              ? 'border-rose-300/28 bg-[rgba(136,19,55,0.28)]'
              : item.severity === 'caution'
                ? 'border-orange-300/24 bg-[rgba(154,52,18,0.2)]'
                : 'border-amber-300/20 bg-[rgba(120,53,15,0.16)]'
          }`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <AtlasSeverityBadge severity={item.severity} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">{item.group}</span>
              </div>
              <div className="mt-2 text-sm font-semibold text-white">{item.summary}</div>
              <div className="mt-1 text-sm text-cyan-50/78">{item.whyThisMatters}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onAskAtlas(item)}
                data-testid="atlas-review-dock-ask-button"
                className="rounded-full border border-cyan-200/18 bg-[rgba(8,27,44,0.86)] px-3 py-1.5 text-xs font-medium text-cyan-50"
              >
                Ask {assistantName}
              </button>
              {item.sourceReference?.targetId ? (
                <button
                  type="button"
                  onClick={() => onShowSource(item)}
                  className="rounded-full border border-white/16 bg-white/10 px-3 py-1.5 text-xs font-medium text-cyan-50/86"
                >
                  Show source
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AtlasReviewDock({
  items,
  onAskAtlas,
  onShowSource,
  defaultOpen = false,
  assistantName = 'Assistant',
  assistantAvatar = 'clinical-orbit',
}: AtlasReviewDockProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);

  const visibleItems = useMemo(
    () => items.filter((item) => !dismissedIds.includes(item.id)),
    [dismissedIds, items],
  );
  const grouped = useMemo(() => groupItems(visibleItems), [visibleItems]);
  const urgentCount = visibleItems.filter((item) => item.severity === 'urgent').length;
  const cautionCount = visibleItems.filter((item) => item.severity === 'caution').length;

  if (!items.length) {
    return null;
  }

  return (
    <aside className="workspace-panel sticky top-4 rounded-[24px] border border-cyan-200/12 bg-[rgba(6,17,31,0.96)] p-4 shadow-[0_20px_48px_rgba(2,8,18,0.28)]">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={isOpen}
      >
        <div className="flex min-w-0 items-start gap-3">
          <AssistantPersonaAvatar avatar={assistantAvatar} label={assistantName} size="sm" />
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/62">{assistantName} Review</div>
            <div className="mt-1 text-base font-semibold text-white">
            {urgentCount ? `${urgentCount} urgent item${urgentCount === 1 ? '' : 's'} active` : `${visibleItems.length} item${visibleItems.length === 1 ? '' : 's'} available`}
            </div>
            <div className="mt-1 text-sm text-cyan-50/70">
              {visibleItems.length
                ? `${cautionCount ? `${cautionCount} caution item${cautionCount === 1 ? '' : 's'} also needs review.` : `${assistantName} stays quiet until a source-bound issue is worth checking.`}`
                : 'Dismissed items stay quiet until the source changes.'}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100/50">Verified by Veranote</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {urgentCount ? <AtlasSeverityBadge severity="urgent" /> : cautionCount ? <AtlasSeverityBadge severity="caution" /> : <AtlasSeverityBadge severity="review" />}
          <span className="rounded-full border border-cyan-200/16 bg-[rgba(13,30,50,0.82)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/72">
            {isOpen ? 'Hide' : 'Open'}
          </span>
        </div>
      </button>

      {isOpen ? (
        <div className="mt-4 space-y-4">
          {grouped.map((entry) => (
            <section key={entry.group} className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/60">{entry.group}</div>
                <div className="text-[11px] text-cyan-50/58">{entry.items.length} item{entry.items.length === 1 ? '' : 's'}</div>
              </div>
              <div className="mt-3 space-y-3">
                {entry.items.map((item) => {
                  const isReviewed = reviewedIds.includes(item.id);

                  return (
                    <div key={item.id} className="rounded-[16px] border border-white/10 bg-[rgba(255,255,255,0.04)] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <AtlasSeverityBadge severity={item.severity} />
                        {isReviewed ? (
                          <span className="rounded-full border border-emerald-300/24 bg-emerald-500/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
                            reviewed
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-white">{item.summary}</div>
                      <div className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/56">Why this matters</div>
                      <div className="mt-1 text-sm text-cyan-50/78">{item.whyThisMatters}</div>
                      <div className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/56">What to check</div>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-cyan-50/78">
                        {item.whatToCheck.map((check) => (
                          <li key={check}>{check}</li>
                        ))}
                      </ul>
                      {item.sourceReference?.label ? (
                        <div className="mt-3 rounded-[14px] border border-cyan-200/10 bg-[rgba(5,16,28,0.76)] px-3 py-2 text-xs text-cyan-50/70">
                          Source reference: <span className="font-semibold text-cyan-50">{item.sourceReference.label}</span>
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onAskAtlas(item)}
                          data-testid="atlas-review-dock-ask-button"
                          className="rounded-full border border-cyan-200/18 bg-[rgba(8,27,44,0.9)] px-3 py-1.5 text-xs font-medium text-cyan-50"
                        >
                          Ask {assistantName}
                        </button>
                        {item.sourceReference?.targetId ? (
                          <button
                            type="button"
                            onClick={() => onShowSource(item)}
                            className="rounded-full border border-white/16 bg-white/10 px-3 py-1.5 text-xs font-medium text-cyan-50/86"
                          >
                            Show source
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setReviewedIds((current) => current.includes(item.id) ? current : [...current, item.id])}
                          className="rounded-full border border-emerald-200/18 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-50"
                        >
                          Mark reviewed
                        </button>
                        <button
                          type="button"
                          onClick={() => setDismissedIds((current) => current.includes(item.id) ? current : [...current, item.id])}
                          className="rounded-full border border-white/14 bg-white/10 px-3 py-1.5 text-xs font-medium text-cyan-50/72"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
