'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { buildFailureClusters } from '@/lib/veranote/lab/failure-clusters';
import { getFilteredAndSortedRunItems, summarizeRunDetailSlice } from '@/lib/veranote/lab/run-detail-utils';
import type { VeraLabRunDetail, VeraLabRunDetailItem, VeraLabRunDetailSort } from '@/lib/veranote/lab/types';

type FilterKey =
  | 'failedOnly'
  | 'highSeverityOnly'
  | 'routingFailuresOnly'
  | 'answerModeFailuresOnly';

const FILTER_KEYS: FilterKey[] = ['failedOnly', 'highSeverityOnly', 'routingFailuresOnly', 'answerModeFailuresOnly'];

type TriagePreset = {
  id: 'failures' | 'high-risk' | 'routing-audit' | 'answer-mode-audit';
  label: string;
  filters: Record<FilterKey, boolean>;
  sort: VeraLabRunDetailSort;
};

const TRIAGE_PRESETS: TriagePreset[] = [
  {
    id: 'failures',
    label: 'Failures only',
    filters: {
      failedOnly: true,
      highSeverityOnly: false,
      routingFailuresOnly: false,
      answerModeFailuresOnly: false,
    },
    sort: 'failure-first',
  },
  {
    id: 'high-risk',
    label: 'High risk only',
    filters: {
      failedOnly: false,
      highSeverityOnly: true,
      routingFailuresOnly: false,
      answerModeFailuresOnly: false,
    },
    sort: 'severity',
  },
  {
    id: 'routing-audit',
    label: 'Routing audit',
    filters: {
      failedOnly: true,
      highSeverityOnly: false,
      routingFailuresOnly: true,
      answerModeFailuresOnly: false,
    },
    sort: 'failure-first',
  },
  {
    id: 'answer-mode-audit',
    label: 'Answer-mode audit',
    filters: {
      failedOnly: true,
      highSeverityOnly: false,
      routingFailuresOnly: false,
      answerModeFailuresOnly: true,
    },
    sort: 'failure-first',
  },
];

type VeraLabRunDetailViewProps = {
  detail: VeraLabRunDetail;
  initialFilters?: Partial<Record<FilterKey, boolean>>;
  focusCaseId?: string | null;
  initialSearchQuery?: string;
  initialSort?: VeraLabRunDetailSort;
};

function formatTimestamp(value: string) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function FilterToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? 'rounded-full border border-cyan-200/28 bg-[rgba(62,161,217,0.18)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white'
        : 'rounded-full border border-cyan-200/10 bg-[rgba(13,30,50,0.48)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-50/76'}
    >
      {label}
    </button>
  );
}

function PresetButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active
        ? 'rounded-full border border-cyan-200/28 bg-[rgba(62,161,217,0.18)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white'
        : 'rounded-full border border-cyan-200/10 bg-[rgba(13,30,50,0.48)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-50/76'}
    >
      {label}
    </button>
  );
}

function ScorePill({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-full border border-cyan-200/10 bg-[rgba(13,30,50,0.48)] px-3 py-1 text-[11px] text-cyan-50/78">
      <span className="uppercase tracking-[0.12em] text-cyan-100/58">{label}</span>{' '}
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function PriorityPill({
  band,
  score,
}: {
  band: 'low' | 'medium' | 'high' | 'urgent';
  score: number;
}) {
  const className = {
    low: 'border-cyan-200/14 bg-[rgba(13,30,50,0.48)] text-cyan-50/82',
    medium: 'border-amber-300/20 bg-[rgba(109,77,24,0.28)] text-amber-100',
    high: 'border-orange-300/22 bg-[rgba(125,57,23,0.3)] text-orange-100',
    urgent: 'border-rose-300/24 bg-[rgba(92,21,38,0.32)] text-rose-100',
  }[band];

  return (
    <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${className}`}>
      {band} priority • {score}
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: 'proposed' | 'approved' | 'applied' | 'regressed' | 'rejected';
}) {
  const className = {
    proposed: 'border-cyan-200/14 bg-[rgba(13,30,50,0.48)] text-cyan-50/82',
    approved: 'border-emerald-300/20 bg-[rgba(16,66,53,0.28)] text-emerald-100',
    applied: 'border-emerald-300/24 bg-[rgba(11,84,62,0.32)] text-emerald-50',
    regressed: 'border-rose-300/24 bg-[rgba(92,21,38,0.32)] text-rose-100',
    rejected: 'border-slate-300/18 bg-[rgba(30,41,59,0.42)] text-slate-100',
  }[status];

  return (
    <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${className}`}>
      {status}
    </div>
  );
}

function DetailSection({
  title,
  children,
  tone = 'default',
}: {
  title: string;
  children: React.ReactNode;
  tone?: 'default' | 'alert' | 'success';
}) {
  const toneClassName = {
    default: 'border-cyan-200/10 bg-[rgba(9,20,35,0.5)]',
    alert: 'border-rose-300/18 bg-[rgba(92,21,38,0.22)]',
    success: 'border-emerald-300/18 bg-[rgba(16,66,53,0.24)]',
  }[tone];

  return (
    <div className={`rounded-[20px] border p-4 ${toneClassName}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100/66">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function JumpLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-sm text-cyan-50/82 transition hover:border-cyan-200/20 hover:text-white"
    >
      {label}
    </a>
  );
}

function MetadataRow({
  label,
  value,
  mono = false,
  compact = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2' : ''}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/58">{label}</dt>
      <dd className={mono ? 'mt-1 break-all font-mono text-xs text-white' : 'mt-1 text-sm text-white'}>
        {value}
      </dd>
    </div>
  );
}

function getCollapsedSummary(item: VeraLabRunDetailItem) {
  if (item.result?.failure_category) {
    return `${item.result.failure_category} • ${item.result.judge_notes || item.result.vera_response}`;
  }

  if (item.result?.judge_notes) {
    return item.result.judge_notes;
  }

  if (item.result?.vera_response) {
    return item.result.vera_response;
  }

  return item.case.prompt;
}

export function VeraLabRunDetailView({
  detail,
  initialFilters,
  focusCaseId = null,
  initialSearchQuery = '',
  initialSort = 'stored',
}: VeraLabRunDetailViewProps) {
  const pathname = usePathname();
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [reviewActionState, setReviewActionState] = useState<{ taskId: string; status: 'approved' | 'rejected' } | null>(null);
  const [reviewActionError, setReviewActionError] = useState<string | null>(null);
  const [activeFocusCaseId, setActiveFocusCaseId] = useState<string | null>(focusCaseId);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [sort, setSort] = useState<VeraLabRunDetailSort>(initialSort);
  const [expandedCaseIds, setExpandedCaseIds] = useState<string[]>(() => (
    detail.items
      .filter((item) => item.result?.passed === false || item.case.id === focusCaseId)
      .map((item) => item.case.id)
  ));
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
    failedOnly: Boolean(initialFilters?.failedOnly),
    highSeverityOnly: Boolean(initialFilters?.highSeverityOnly),
    routingFailuresOnly: Boolean(initialFilters?.routingFailuresOnly),
    answerModeFailuresOnly: Boolean(initialFilters?.answerModeFailuresOnly),
  });

  const filteredItems = useMemo(
    () => getFilteredAndSortedRunItems({
      items: detail.items,
      filters,
      searchQuery,
      sort,
    }),
    [detail.items, filters, searchQuery, sort],
  );

  const summaryNav = useMemo(() => {
    const visibleFailed = filteredItems.filter((item) => item.result?.passed === false);
    const visibleRepairs = filteredItems.filter((item) => item.repair_task);
    const visibleRegressions = filteredItems.filter((item) => item.regression_results.length);
    return {
      hasFocus: Boolean(activeFocusCaseId && filteredItems.some((item) => item.case.id === activeFocusCaseId)),
      firstFailedCaseId: visibleFailed[0]?.case.id || null,
      firstRepairCaseId: visibleRepairs[0]?.case.id || null,
      firstRegressionCaseId: visibleRegressions[0]?.case.id || null,
    };
  }, [activeFocusCaseId, filteredItems]);

  const failedCaseIds = useMemo(
    () => filteredItems.filter((item) => item.result?.passed === false).map((item) => item.case.id),
    [filteredItems],
  );

  const focusIndex = useMemo(
    () => (activeFocusCaseId ? failedCaseIds.indexOf(activeFocusCaseId) : -1),
    [activeFocusCaseId, failedCaseIds],
  );

  const previousFailedCaseId = focusIndex > 0 ? failedCaseIds[focusIndex - 1] : null;
  const nextFailedCaseId = focusIndex >= 0 && focusIndex < failedCaseIds.length - 1 ? failedCaseIds[focusIndex + 1] : null;

  const clusterByCaseId = useMemo(() => {
    const clusters = buildFailureClusters(
      detail.items
        .filter((item) => item.result?.passed === false && item.repair_task)
        .map((item) => ({
          case_id: item.case.id,
          result_id: item.result?.id || item.case.id,
          category: item.case.category,
          subtype: item.case.subtype,
          prompt: item.case.prompt,
          likely_root_cause: item.result?.likely_root_cause || item.repair_task?.assigned_layer || 'routing',
          assigned_layer: item.repair_task?.assigned_layer || item.result?.likely_root_cause || 'routing',
          failure_category: item.result?.failure_category || null,
        })),
    );

    return clusters.reduce<Record<string, (typeof clusters)[number]>>((acc, cluster) => {
      for (const caseId of cluster.case_ids) {
        acc[caseId] = cluster;
      }
      return acc;
    }, {});
  }, [detail.items]);

  const counts = useMemo(() => ({
    total: detail.items.length,
    filtered: filteredItems.length,
    failed: detail.items.filter((item) => item.result?.passed === false).length,
    pendingResults: detail.items.filter((item) => !item.result).length,
    highOrCritical: detail.items.filter((item) => item.case.severity_if_wrong === 'high' || item.case.severity_if_wrong === 'critical').length,
  }), [detail.items, filteredItems.length]);

  const sliceSummary = useMemo(
    () => summarizeRunDetailSlice(filteredItems),
    [filteredItems],
  );

  const activePresetId = useMemo(() => {
    const matched = TRIAGE_PRESETS.find((preset) => (
      preset.sort === sort
      && FILTER_KEYS.every((key) => preset.filters[key] === filters[key])
    ));
    return matched?.id || null;
  }, [filters, sort]);

  function toggleFilter(key: FilterKey) {
    setFilters((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function applyPreset(preset: TriagePreset) {
    setFilters(preset.filters);
    setSort(preset.sort);
  }

  function buildSharePath(hash?: string | null) {
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      if (filters[key]) {
        params.set(key, '1');
      }
    }
    if (searchQuery.trim()) {
      params.set('q', searchQuery.trim());
    }
    if (sort !== 'stored') {
      params.set('sort', sort);
    }
    if (activeFocusCaseId) {
      params.set('focusCase', activeFocusCaseId);
    }
    const query = params.toString();
    const suffix = hash ? `#${hash}` : '';
    return query ? `${pathname}?${query}${suffix}` : `${pathname}${suffix}`;
  }

  async function copyShareLink(hash: string | null, label: string) {
    const origin = window.location.origin;
    const url = `${origin}${buildSharePath(hash)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus(`${label} copied`);
    } catch {
      setCopyStatus('Copy failed');
    }
  }

  function focusCase(caseId: string | null) {
    if (!caseId) {
      return;
    }

    setActiveFocusCaseId(caseId);
    setExpandedCaseIds((current) => (current.includes(caseId) ? current : [...current, caseId]));
    window.location.hash = `case-${caseId}`;
  }

  function toggleCaseExpanded(caseId: string) {
    setExpandedCaseIds((current) => (
      current.includes(caseId)
        ? current.filter((item) => item !== caseId)
        : [...current, caseId]
    ));
  }

  function expandAllVisible() {
    setExpandedCaseIds(filteredItems.map((item) => item.case.id));
  }

  function expandFailedVisible() {
    setExpandedCaseIds(filteredItems.filter((item) => item.result?.passed === false).map((item) => item.case.id));
  }

  function collapsePassingVisible() {
    setExpandedCaseIds(
      filteredItems
        .filter((item) => item.result?.passed === false || item.case.id === activeFocusCaseId)
        .map((item) => item.case.id),
    );
  }

  function collapseAllVisible() {
    setExpandedCaseIds([]);
  }

  async function handleReviewAction(taskId: string, status: 'approved' | 'rejected') {
    setReviewActionError(null);
    setReviewActionState({ taskId, status });
    try {
      const response = await fetch(`/api/admin/vera-lab/fix-tasks/${taskId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to update fix-task approval state.');
      }
      window.location.reload();
    } catch (error) {
      setReviewActionError(error instanceof Error ? error.message : 'Unable to update fix-task approval state.');
    } finally {
      setReviewActionState(null);
    }
  }

  useEffect(() => {
    setActiveFocusCaseId(focusCaseId);
  }, [focusCaseId]);

  useEffect(() => {
    if (activeFocusCaseId && filteredItems.some((item) => item.case.id === activeFocusCaseId)) {
      return;
    }

    if (failedCaseIds.length) {
      setActiveFocusCaseId(failedCaseIds[0]);
      return;
    }

    if (activeFocusCaseId !== null) {
      setActiveFocusCaseId(null);
    }
  }, [activeFocusCaseId, failedCaseIds, filteredItems]);

  useEffect(() => {
    const alwaysExpanded = filteredItems
      .filter((item) => item.result?.passed === false || item.case.id === activeFocusCaseId)
      .map((item) => item.case.id);

    setExpandedCaseIds((current) => {
      const next = new Set(
        current.filter((caseId) => filteredItems.some((item) => item.case.id === caseId)),
      );
      for (const caseId of alwaysExpanded) {
        next.add(caseId);
      }
      return Array.from(next);
    });
  }, [activeFocusCaseId, filteredItems]);

  useEffect(() => {
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      if (filters[key]) {
        params.set(key, '1');
      }
    }
    if (searchQuery.trim()) {
      params.set('q', searchQuery.trim());
    }
    if (sort !== 'stored') {
      params.set('sort', sort);
    }
    if (activeFocusCaseId) {
      params.set('focusCase', activeFocusCaseId);
    }
    const hash = window.location.hash || '';
    const next = params.toString() ? `${pathname}?${params.toString()}${hash}` : `${pathname}${hash}`;
    window.history.replaceState(null, '', next);
  }, [activeFocusCaseId, filters, pathname, searchQuery, sort]);

  useEffect(() => {
    if (!copyStatus) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCopyStatus(null);
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [copyStatus]);

  return (
    <div className="grid gap-6">
      <section id="run-overview" className="aurora-panel scroll-mt-24 rounded-[28px] p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Run detail</div>
            <h2 className="mt-1 text-2xl font-semibold text-white">Persisted batch inspection</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-50/80">
              Review one Atlas Lab batch across the full chain: test case, judged result, repair task, and regression gate output.
            </p>
          </div>
          <Link
            href="/admin/vera-lab"
            className="aurora-secondary-button inline-flex rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Back to Atlas Lab
          </Link>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-[22px] border border-cyan-200/10 bg-[rgba(9,20,35,0.62)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Run metadata</div>
            <dl className="mt-4 grid gap-3 md:grid-cols-2">
              <MetadataRow label="Run id" value={detail.run.id} mono />
              <MetadataRow label="Created" value={formatTimestamp(detail.run.created_at)} />
              <MetadataRow label="Mode" value={detail.run.mode} />
              <MetadataRow label="Stage" value={detail.run.stage} />
              <MetadataRow label="Provider profile" value={detail.run.provider_profile_id || 'none'} />
              <MetadataRow label="Tester version" value={detail.run.tester_version} />
              <MetadataRow label="Repair version" value={detail.run.repair_version} />
              <MetadataRow label="Status" value={detail.run.status} />
            </dl>
          </div>

          <div className="rounded-[22px] border border-cyan-200/10 bg-[rgba(9,20,35,0.62)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Inspection filters</div>
            <div className="mt-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/58">Triage presets</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {TRIAGE_PRESETS.map((preset) => (
                  <PresetButton
                    key={preset.id}
                    active={activePresetId === preset.id}
                    onClick={() => applyPreset(preset)}
                    label={preset.label}
                  />
                ))}
              </div>
            </div>
            <label className="mt-4 grid gap-2 text-sm text-cyan-50/86">
              <span>Search visible cases</span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Prompt, subtype, failure, repair task..."
                className="rounded-xl border border-cyan-200/10 bg-[rgba(13,30,50,0.74)] px-3 py-2 text-cyan-50 placeholder:text-cyan-100/34"
              />
            </label>
            <label className="mt-4 grid gap-2 text-sm text-cyan-50/86">
              <span>Sort visible cases</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as VeraLabRunDetailSort)}
                className="rounded-xl border border-cyan-200/10 bg-[rgba(13,30,50,0.74)] px-3 py-2 text-cyan-50"
              >
                <option value="stored">Stored order</option>
                <option value="failure-first">Failure first</option>
                <option value="severity">Severity</option>
                <option value="category">Category</option>
              </select>
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <FilterToggle active={filters.failedOnly} onClick={() => toggleFilter('failedOnly')} label="Failed only" />
              <FilterToggle active={filters.highSeverityOnly} onClick={() => toggleFilter('highSeverityOnly')} label="High / critical" />
              <FilterToggle active={filters.routingFailuresOnly} onClick={() => toggleFilter('routingFailuresOnly')} label="Routing failures" />
              <FilterToggle active={filters.answerModeFailuresOnly} onClick={() => toggleFilter('answerModeFailuresOnly')} label="Answer-mode failures" />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <ScorePill label="visible" value={counts.filtered} />
              <ScorePill label="total" value={counts.total} />
              <ScorePill label="failed" value={counts.failed} />
              <ScorePill label="pending" value={counts.pendingResults} />
              <ScorePill label="high+" value={counts.highOrCritical} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-[24px] border border-cyan-200/10 bg-[rgba(9,20,35,0.62)] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Current slice summary</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <ScorePill label="visible" value={sliceSummary.totalVisible} />
            <ScorePill label="failed" value={sliceSummary.failedVisible} />
            <ScorePill label="passed" value={sliceSummary.passedVisible} />
            <ScorePill label="pending" value={sliceSummary.pendingVisible} />
          </div>
        </div>

        <div className="rounded-[24px] border border-cyan-200/10 bg-[rgba(9,20,35,0.62)] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Failure categories in view</div>
          {sliceSummary.byFailureCategory.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {sliceSummary.byFailureCategory.map((entry) => (
                <div key={entry.key} className="rounded-full border border-rose-300/18 bg-[rgba(92,21,38,0.22)] px-3 py-1 text-[11px] text-rose-100">
                  <span className="font-semibold">{entry.label}</span>{' '}
                  <span className="text-rose-50/84">{entry.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 text-sm text-cyan-50/66">No failed cases in the current filtered slice.</div>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-20 xl:self-start">
          <div className="rounded-[24px] border border-cyan-200/10 bg-[rgba(9,20,35,0.72)] p-4 shadow-[0_18px_60px_rgba(2,8,23,0.24)]">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Jump navigation</div>
            <div className="mt-4 grid gap-2">
              <JumpLink href="#run-overview" label="Run overview" />
              <JumpLink href="#case-results" label="Visible cases" />
              {summaryNav.hasFocus && activeFocusCaseId ? <JumpLink href={`#case-${activeFocusCaseId}`} label="Focused case" /> : null}
              {summaryNav.firstFailedCaseId ? <JumpLink href={`#case-${summaryNav.firstFailedCaseId}`} label="First failed case" /> : null}
              {summaryNav.firstRepairCaseId ? <JumpLink href={`#repair-${summaryNav.firstRepairCaseId}`} label="First repair task" /> : null}
              {summaryNav.firstRegressionCaseId ? <JumpLink href={`#regression-${summaryNav.firstRegressionCaseId}`} label="First regression result" /> : null}
            </div>

            {failedCaseIds.length ? (
              <div className="mt-5 border-t border-cyan-200/10 pt-4">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Failed-case navigation</div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => focusCase(previousFailedCaseId)}
                    disabled={!previousFailedCaseId}
                    className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-sm text-cyan-50/82 transition hover:border-cyan-200/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Previous failed
                  </button>
                  <button
                    type="button"
                    onClick={() => focusCase(nextFailedCaseId)}
                    disabled={!nextFailedCaseId}
                    className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-sm text-cyan-50/82 transition hover:border-cyan-200/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Next failed
                  </button>
                </div>
                <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/70">
                  {activeFocusCaseId && focusIndex >= 0 ? `Failed case ${focusIndex + 1} of ${failedCaseIds.length}` : `${failedCaseIds.length} failed cases visible`}
                </div>
              </div>
            ) : null}

            <div className="mt-5 border-t border-cyan-200/10 pt-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Case visibility</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={expandAllVisible}
                  className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-sm text-cyan-50/82 transition hover:border-cyan-200/20 hover:text-white"
                >
                  Expand visible
                </button>
                <button
                  type="button"
                  onClick={expandFailedVisible}
                  className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-sm text-cyan-50/82 transition hover:border-cyan-200/20 hover:text-white"
                >
                  Expand failed only
                </button>
                <button
                  type="button"
                  onClick={collapsePassingVisible}
                  className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-sm text-cyan-50/82 transition hover:border-cyan-200/20 hover:text-white"
                >
                  Collapse passing
                </button>
                <button
                  type="button"
                  onClick={collapseAllVisible}
                  className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-sm text-cyan-50/82 transition hover:border-cyan-200/20 hover:text-white"
                >
                  Collapse all
                </button>
              </div>
            </div>

            <div className="mt-5 border-t border-cyan-200/10 pt-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Shareable links</div>
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={() => void copyShareLink(window.location.hash ? window.location.hash.slice(1) : null, 'Current view')}
                  className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-left text-sm text-cyan-50/82 transition hover:border-cyan-200/20 hover:text-white"
                >
                  Copy current view
                </button>
                {summaryNav.hasFocus && activeFocusCaseId ? (
                  <button
                    type="button"
                    onClick={() => void copyShareLink(`case-${activeFocusCaseId}`, 'Focused case link')}
                    className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-left text-sm text-cyan-50/82 transition hover:border-cyan-200/20 hover:text-white"
                  >
                    Copy focused case link
                  </button>
                ) : null}
                {summaryNav.firstFailedCaseId ? (
                  <button
                    type="button"
                    onClick={() => void copyShareLink(`case-${summaryNav.firstFailedCaseId}`, 'First failed case link')}
                    className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-left text-sm text-cyan-50/82 transition hover:border-cyan-200/20 hover:text-white"
                  >
                    Copy first failed case link
                  </button>
                ) : null}
              </div>
              {copyStatus ? (
                <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/70">
                  {copyStatus}
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <div id="case-results" className="grid gap-5">
          {filteredItems.length ? filteredItems.map((item) => {
            const tone = item.result?.passed === false ? 'border-rose-300/16 bg-[rgba(39,11,20,0.62)]' : 'border-cyan-200/10 bg-[rgba(7,17,30,0.62)]';
            const isExpanded = expandedCaseIds.includes(item.case.id);
            const cluster = clusterByCaseId[item.case.id] || null;

            return (
              <article
                key={item.case.id}
                id={`case-${item.case.id}`}
                className={`scroll-mt-24 rounded-[28px] border p-5 shadow-[0_24px_70px_rgba(2,8,23,0.28)] ${tone} ${
                  activeFocusCaseId === item.case.id ? 'ring-2 ring-cyan-300/30' : ''
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-cyan-200/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/72">
                        {item.case.category}
                      </span>
                      <span className="rounded-full border border-cyan-200/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/72">
                        {item.case.subtype}
                      </span>
                      <span className={item.case.severity_if_wrong === 'critical' || item.case.severity_if_wrong === 'high'
                        ? 'rounded-full border border-rose-300/24 bg-[rgba(92,21,38,0.26)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-100'
                        : 'rounded-full border border-cyan-200/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/72'}>
                        {item.case.severity_if_wrong}
                      </span>
                      <span className={item.result?.passed === false
                        ? 'rounded-full border border-rose-300/24 bg-[rgba(92,21,38,0.26)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-100'
                        : item.result?.passed === true
                          ? 'rounded-full border border-emerald-300/24 bg-[rgba(16,66,53,0.3)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-100'
                          : 'rounded-full border border-cyan-200/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/72'}>
                        {item.result ? (item.result.passed ? 'passed' : 'failed') : 'no result'}
                      </span>
                    </div>
                    <div className="mt-3 font-mono text-[11px] text-cyan-100/54">{item.case.id}</div>
                    {cluster ? (
                      <div className="mt-2 inline-flex rounded-full border border-cyan-200/12 bg-[rgba(13,30,50,0.48)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-50/78">
                        shared cluster • {cluster.count} cases • {cluster.assigned_layer}
                      </div>
                    ) : null}
                    {!isExpanded ? (
                      <div className="mt-3 max-w-3xl text-sm leading-7 text-cyan-50/76">
                        {getCollapsedSummary(item)}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-start justify-end gap-2">
                    {item.result ? (
                      <div className="flex flex-wrap gap-2">
                        <ScorePill label="safety" value={item.result.safety_score} />
                        <ScorePill label="directness" value={item.result.directness_score} />
                        <ScorePill label="usefulness" value={item.result.usefulness_score} />
                        <ScorePill label="chart" value={item.result.chart_usability_score} />
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => toggleCaseExpanded(item.case.id)}
                      className="rounded-[16px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-sm text-cyan-50/82 transition hover:border-cyan-200/20 hover:text-white"
                    >
                      {isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                </div>

                {isExpanded ? (
                  <>
                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                      <DetailSection title="Test case">
                        <div className="space-y-4 text-sm text-cyan-50/84">
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/58">Prompt</div>
                            <div className="mt-1 whitespace-pre-wrap leading-7 text-white">{item.case.prompt}</div>
                          </div>
                          {item.case.followup_prompt ? (
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/58">Follow-up prompt</div>
                              <div className="mt-1 whitespace-pre-wrap leading-7 text-cyan-50/78">{item.case.followup_prompt}</div>
                            </div>
                          ) : null}
                          <div className="grid gap-3 md:grid-cols-2">
                            <MetadataRow label="Expected answer mode" value={item.case.expected_answer_mode || 'none'} compact />
                            <MetadataRow label="Severity if wrong" value={item.case.severity_if_wrong} compact />
                          </div>
                        </div>
                      </DetailSection>

                      <DetailSection title="Judged result" tone={item.result?.passed === false ? 'alert' : item.result?.passed === true ? 'success' : 'default'}>
                        {item.result ? (
                          <div className="space-y-4 text-sm text-cyan-50/84">
                            <div>
                              <div className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/58">Atlas response</div>
                              <div className="mt-1 whitespace-pre-wrap leading-7 text-white">{item.result.vera_response}</div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                              <MetadataRow label="Answer mode returned" value={item.result.answer_mode_returned || 'none'} compact />
                              <MetadataRow label="Route taken" value={item.result.route_taken || 'none'} compact />
                              <MetadataRow label="Failure category" value={item.result.failure_category || 'none'} compact />
                              <MetadataRow label="Likely root cause" value={item.result.likely_root_cause} compact />
                            </div>
                            {item.result.judge_notes ? (
                              <div>
                                <div className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/58">Judge notes</div>
                                <div className="mt-1 whitespace-pre-wrap leading-7 text-cyan-50/78">{item.result.judge_notes}</div>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="text-sm text-cyan-50/64">No persisted result is linked to this case yet.</div>
                        )}
                      </DetailSection>
                    </div>

                    {(item.repair_task || item.regression_results.length) ? (
                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        <DetailSection title="Repair task">
                          {item.repair_task ? (
                            <div id={`repair-${item.case.id}`} className="scroll-mt-24 space-y-4 text-sm text-cyan-50/84">
                              <div className="flex flex-wrap gap-2">
                                <PriorityPill band={item.repair_task.priority_band} score={item.repair_task.priority_score} />
                                <StatusPill status={item.repair_task.status} />
                                <div className="rounded-full border border-cyan-200/10 bg-[rgba(13,30,50,0.48)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-50/78">
                                  approval required • {item.repair_task.approval_required ? 'yes' : 'no'}
                                </div>
                              </div>

                              <div className="grid gap-3 md:grid-cols-2">
                                <MetadataRow label="Assigned layer" value={item.repair_task.assigned_layer} compact />
                                <MetadataRow label="Human approval gate" value={item.repair_task.approval_required ? 'Approval required before patch application' : 'No approval gate recorded'} compact />
                              </div>

                              <div className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/58">Improvement plan summary</div>
                                <div className="mt-2 whitespace-pre-wrap leading-7 text-white">
                                  {item.repair_task.improvement_summary || 'No improvement summary stored for this repair task.'}
                                </div>
                              </div>

                              {item.repair_task.priority_explanation ? (
                                <div className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] p-4">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/58">Why this is prioritized</div>
                                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <MetadataRow label="Total score" value={String(item.repair_task.priority_explanation.total_score)} compact />
                                    <MetadataRow label="Band" value={item.repair_task.priority_explanation.band} compact />
                                    <MetadataRow label="Severity factor" value={String(item.repair_task.priority_explanation.factors.severity)} compact />
                                    <MetadataRow label="Frequency factor" value={String(item.repair_task.priority_explanation.factors.frequency)} compact />
                                    <MetadataRow label="Regression risk" value={String(item.repair_task.priority_explanation.factors.regression_risk)} compact />
                                    <MetadataRow label="Layer weight" value={String(item.repair_task.priority_explanation.factors.layer_weight)} compact />
                                    <MetadataRow label="Failure-category factor" value={String(item.repair_task.priority_explanation.factors.failure_category)} compact />
                                  </div>
                                  <div className="mt-4 space-y-2 text-sm text-cyan-50/82">
                                    {item.repair_task.priority_explanation.rationale.map((line) => (
                                      <div key={line} className="leading-7">
                                        {line}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {cluster ? (
                                <div className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] p-4">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/58">Shared failure cluster</div>
                                  <div className="mt-2 text-sm text-white">{cluster.representative_prompt}</div>
                                  <div className="mt-2 text-xs text-cyan-50/70">
                                    {cluster.count} related failed cases • {cluster.failure_category || 'unclassified failure'} • {cluster.assigned_layer}
                                  </div>
                                  <div className="mt-2 text-xs leading-6 text-cyan-50/72">
                                    Shared fix direction: {cluster.recommended_shared_fix}
                                  </div>
                                </div>
                              ) : null}

                              {item.repair_task.suggested_fix_strategy ? (
                                <div className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] p-4">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/58">Suggested fix strategy</div>
                                  <div className="mt-3 grid gap-3">
                                    <MetadataRow label="Layer" value={item.repair_task.suggested_fix_strategy.layer} compact />
                                    <div>
                                      <div className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/58">Why this layer</div>
                                      <div className="mt-1 whitespace-pre-wrap leading-7 text-white">{item.repair_task.suggested_fix_strategy.why_this_layer}</div>
                                    </div>
                                    <div>
                                      <div className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/58">Recommended change</div>
                                      <div className="mt-1 whitespace-pre-wrap leading-7 text-white">{item.repair_task.suggested_fix_strategy.recommended_change}</div>
                                    </div>
                                    <div>
                                      <div className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/58">Do not change</div>
                                      <div className="mt-1 whitespace-pre-wrap leading-7 text-cyan-50/78">{item.repair_task.suggested_fix_strategy.do_not_change}</div>
                                    </div>
                                    <div>
                                      <div className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/58">Validation approach</div>
                                      <div className="mt-1 whitespace-pre-wrap leading-7 text-cyan-50/78">{item.repair_task.suggested_fix_strategy.validation_approach}</div>
                                    </div>
                                  </div>
                                </div>
                              ) : null}

                              <div className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/58">Proposed patch prompt</div>
                                <div className="mt-2 whitespace-pre-wrap leading-7 text-white">{item.repair_task.patch_prompt}</div>
                              </div>

                              {item.repair_task.regression_plan ? (
                                <div className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] p-4">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/58">Recommended regression plan</div>
                                  <div className="mt-2 whitespace-pre-wrap leading-7 text-cyan-50/78">{item.repair_task.regression_plan}</div>
                                </div>
                              ) : null}

                              <div className="rounded-[18px] border border-cyan-200/10 bg-[rgba(7,17,30,0.54)] p-4">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/58">Approval and audit trail</div>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                  <MetadataRow label="Current approval state" value={item.repair_task.status} compact />
                                  <MetadataRow label="Approval gate" value={item.repair_task.approval_required ? 'Human approval required' : 'No approval gate recorded'} compact />
                                  <MetadataRow label="Approved by" value={item.repair_task.approved_by || 'not yet approved'} compact />
                                  <MetadataRow label="Approved at" value={item.repair_task.approved_at ? formatTimestamp(item.repair_task.approved_at) : 'not yet approved'} compact />
                                  <MetadataRow label="Rejected by" value={item.repair_task.rejected_by || 'not rejected'} compact />
                                  <MetadataRow label="Rejected at" value={item.repair_task.rejected_at ? formatTimestamp(item.repair_task.rejected_at) : 'not rejected'} compact />
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                  {item.repair_task.status !== 'approved' ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleReviewAction(item.repair_task!.id, 'approved')}
                                      disabled={reviewActionState?.taskId === item.repair_task.id}
                                      className="rounded-[16px] border border-emerald-300/20 bg-[rgba(16,66,53,0.3)] px-3 py-2 text-sm font-semibold text-emerald-50 disabled:opacity-50"
                                    >
                                      {reviewActionState?.taskId === item.repair_task.id && reviewActionState.status === 'approved' ? 'Approving…' : 'Approve plan'}
                                    </button>
                                  ) : null}
                                  {item.repair_task.status !== 'rejected' ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleReviewAction(item.repair_task!.id, 'rejected')}
                                      disabled={reviewActionState?.taskId === item.repair_task.id}
                                      className="rounded-[16px] border border-rose-300/20 bg-[rgba(92,21,38,0.32)] px-3 py-2 text-sm font-semibold text-rose-100 disabled:opacity-50"
                                    >
                                      {reviewActionState?.taskId === item.repair_task.id && reviewActionState.status === 'rejected' ? 'Rejecting…' : 'Reject plan'}
                                    </button>
                                  ) : null}
                                </div>
                                {reviewActionError ? (
                                  <div className="mt-3 rounded-[14px] border border-rose-300/20 bg-[rgba(92,21,38,0.32)] px-3 py-2 text-sm text-rose-100">
                                    {reviewActionError}
                                  </div>
                                ) : null}
                              </div>

                              {item.repair_task.patch_summary ? (
                                <div className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] p-4">
                                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/58">Patch summary</div>
                                  <div className="mt-2 whitespace-pre-wrap leading-7 text-cyan-50/78">{item.repair_task.patch_summary}</div>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="text-sm text-cyan-50/64">No repair task has been attached to this case.</div>
                          )}
                        </DetailSection>

                        <DetailSection title="Regression results">
                          {item.regression_results.length ? (
                            <div id={`regression-${item.case.id}`} className="scroll-mt-24 space-y-3">
                              {item.regression_results.map((regression) => (
                                <div key={regression.id} className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] p-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={regression.passed
                                      ? 'rounded-full border border-emerald-300/24 bg-[rgba(16,66,53,0.3)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-100'
                                      : 'rounded-full border border-rose-300/24 bg-[rgba(92,21,38,0.26)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-100'}>
                                      {regression.passed ? 'passed' : 'failed'}
                                    </span>
                                  </div>
                                  <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-white">{regression.prompt_variant}</div>
                                  {regression.notes ? (
                                    <div className="mt-2 text-xs leading-6 text-cyan-50/70">{regression.notes}</div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-cyan-50/64">No regression rows are linked to this case.</div>
                          )}
                        </DetailSection>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </article>
            );
          }) : (
            <div className="aurora-panel rounded-[28px] p-6 text-sm text-cyan-50/72">
              No cases match the current filter combination.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
