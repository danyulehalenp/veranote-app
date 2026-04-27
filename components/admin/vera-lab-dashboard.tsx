'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { veraProviderQuestionPacks } from '@/lib/veranote/lab/question-bank';
import type { VeraLabDashboardSummary } from '@/lib/veranote/lab/types';

type RunResponse = {
  run: {
    id: string;
  };
  casesExecuted: number;
  report: {
    passFailByCategory: Record<string, { passed: number; failed: number }>;
    repeatedFailurePatterns: Array<{
      failure_category: string;
      count: number;
      likely_root_cause: string;
    }>;
    worstMisses: Array<{
      case_id: string;
      category: string;
      subtype: string;
      severity_if_wrong: string;
      failure_category: string | null;
      likely_root_cause: string;
      judge_notes: string;
    }>;
    topPriorities: Array<{
      case_id: string;
      category: string;
      subtype: string;
      severity_if_wrong: string;
      failure_category: string | null;
      likely_root_cause: string;
      priority_score: number;
      priority_band: string;
      priority_explanation: {
        rationale: string[];
      } | null;
      improvement_summary: string;
    }>;
  };
};

type RepeatedRunResponse = {
  cyclesRequested: number;
  cyclesCompleted: number;
  stoppedEarly: boolean;
  stopReason: string | null;
  totalCases: number;
  totalPassed: number;
  totalFailed: number;
  passRate: number;
  urgentFixTaskCount: number;
  highPriorityFixTaskCount: number;
  repeatedFailurePatterns: Array<{
    failure_category: string;
    count: number;
    likely_root_cause: string;
  }>;
  runIds: string[];
};

export function VeraLabDashboard() {
  const [summary, setSummary] = useState<VeraLabDashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [repairActionError, setRepairActionError] = useState<string | null>(null);
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>(veraProviderQuestionPacks.map((pack) => pack.id));
  const [stage, setStage] = useState<'review' | 'compose'>('review');
  const [mode, setMode] = useState<'workflow-help' | 'reference-lookup' | 'prompt-builder'>('workflow-help');
  const [testerVersion, setTesterVersion] = useState('vera-lab-v1');
  const [repairVersion, setRepairVersion] = useState('repair-router-v1');
  const [providerProfileId, setProviderProfileId] = useState('');
  const [isRunningRepeated, setIsRunningRepeated] = useState(false);
  const [repeatedRunResult, setRepeatedRunResult] = useState<RepeatedRunResponse | null>(null);
  const [cycles, setCycles] = useState(3);
  const [casesPerCycle, setCasesPerCycle] = useState(20);
  const [stopOnCriticalFailure, setStopOnCriticalFailure] = useState(true);

  async function loadSummary() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/vera-lab/summary', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to load Atlas Lab summary.');
      }
      setSummary(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load Atlas Lab summary.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSummary();
  }, []);

  const totalStarterCases = useMemo(
    () => veraProviderQuestionPacks
      .filter((pack) => selectedPackIds.includes(pack.id))
      .reduce((sum, pack) => sum + pack.cases.length, 0),
    [selectedPackIds],
  );

  async function handleRunBatch() {
    setIsRunning(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/vera-lab/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode,
          stage,
          tester_version: testerVersion,
          repair_version: repairVersion,
          pack_ids: selectedPackIds,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to run Atlas Lab batch.');
      }
      setRunResult(payload);
      await loadSummary();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Unable to run Atlas Lab batch.');
    } finally {
      setIsRunning(false);
    }
  }

  async function handleRunRepeatedCycles() {
    setIsRunningRepeated(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/vera-lab/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          repeated: true,
          cycles,
          casesPerCycle,
          stopOnCriticalFailure,
          mode,
          stage,
          providerProfileId: providerProfileId.trim() || null,
          tester_version: testerVersion,
          repair_version: repairVersion,
          pack_ids: selectedPackIds,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to run repeated Atlas Lab cycles.');
      }
      setRepeatedRunResult(payload);
      await loadSummary();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Unable to run repeated Atlas Lab cycles.');
    } finally {
      setIsRunningRepeated(false);
    }
  }

  async function handleRerunRegression(fixTaskId: string) {
    setRepairActionError(null);
    try {
      const response = await fetch(`/api/admin/vera-lab/fix-tasks/${fixTaskId}/regress`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode,
          stage,
          tester_version: testerVersion,
          repair_version: repairVersion,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to rerun regression gate.');
      }
      await loadSummary();
    } catch (repairError) {
      setRepairActionError(repairError instanceof Error ? repairError.message : 'Unable to rerun regression gate.');
    }
  }

  function togglePack(packId: string) {
    setSelectedPackIds((current) => (
      current.includes(packId)
        ? current.filter((item) => item !== packId)
        : [...current, packId]
    ));
  }

  function buildFailedCaseHref(item: NonNullable<VeraLabDashboardSummary['recentFailedCases']>[number]) {
    const params = new URLSearchParams({
      failedOnly: '1',
      focusCase: item.case_id,
    });

    if (item.failure_category === 'routing_failure') {
      params.set('routingFailuresOnly', '1');
    }

    if (item.failure_category === 'answer_mode_failure') {
      params.set('answerModeFailuresOnly', '1');
    }

    return `/admin/vera-lab/runs/${item.run_id}?${params.toString()}#case-${item.case_id}`;
  }

  return (
    <div className="grid gap-6">
      <section className="aurora-panel rounded-[28px] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Atlas Lab</div>
            <h2 className="mt-1 text-2xl font-semibold text-white">Internal interrogator, judge, and repair queue</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-50/82">
              Run real provider-style batches against the live Atlas endpoint, classify failures into repairable layers, and keep a regression gate attached to each fix task.
            </p>
          </div>
          <div className="rounded-[18px] border border-cyan-200/10 bg-[rgba(12,27,45,0.5)] px-4 py-3 text-sm text-cyan-50/78">
            Starter corpus loaded: <span className="font-semibold text-white">{totalStarterCases}</span> cases
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div className="rounded-[22px] border border-cyan-200/10 bg-[rgba(9,20,35,0.62)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Run test batch</div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm text-cyan-50/86">
                <span>Stage</span>
                <select value={stage} onChange={(event) => setStage(event.target.value as 'review' | 'compose')} className="rounded-xl border border-cyan-200/10 bg-[rgba(13,30,50,0.74)] px-3 py-2 text-cyan-50">
                  <option value="review">Review</option>
                  <option value="compose">Compose</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm text-cyan-50/86">
                <span>Mode</span>
                <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="rounded-xl border border-cyan-200/10 bg-[rgba(13,30,50,0.74)] px-3 py-2 text-cyan-50">
                  <option value="workflow-help">workflow-help</option>
                  <option value="reference-lookup">reference-lookup</option>
                  <option value="prompt-builder">prompt-builder</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm text-cyan-50/86">
                <span>Tester version</span>
                <input value={testerVersion} onChange={(event) => setTesterVersion(event.target.value)} className="rounded-xl border border-cyan-200/10 bg-[rgba(13,30,50,0.74)] px-3 py-2 text-cyan-50" />
              </label>
              <label className="grid gap-2 text-sm text-cyan-50/86">
                <span>Repair version</span>
                <input value={repairVersion} onChange={(event) => setRepairVersion(event.target.value)} className="rounded-xl border border-cyan-200/10 bg-[rgba(13,30,50,0.74)] px-3 py-2 text-cyan-50" />
              </label>
              <label className="grid gap-2 text-sm text-cyan-50/86 md:col-span-2">
                <span>Provider profile id</span>
                <input value={providerProfileId} onChange={(event) => setProviderProfileId(event.target.value)} placeholder="Optional profile id" className="rounded-xl border border-cyan-200/10 bg-[rgba(13,30,50,0.74)] px-3 py-2 text-cyan-50" />
              </label>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Starter packs</div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {veraProviderQuestionPacks.map((pack) => (
                  <label key={pack.id} className="flex items-start gap-3 rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-3 text-sm text-cyan-50/86">
                    <input
                      type="checkbox"
                      checked={selectedPackIds.includes(pack.id)}
                      onChange={() => togglePack(pack.id)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-semibold text-white">{pack.label}</span>
                      <span className="block text-xs text-cyan-50/64">{pack.cases.length} cases</span>
                    </span>
                  </label>
                ))}
              </div>
          </div>

          <div className="mt-4 rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Repeated Lab Cycle</div>
            <div className="mt-1 text-sm leading-6 text-cyan-50/72">
              Run the selected corpus in bounded repeated batches to watch failure patterns stabilize or stop early on critical misses.
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="grid gap-2 text-sm text-cyan-50/86">
                <span>Cycles</span>
                <input type="number" min={1} max={10} value={cycles} onChange={(event) => setCycles(Number(event.target.value) || 1)} className="rounded-xl border border-cyan-200/10 bg-[rgba(13,30,50,0.74)] px-3 py-2 text-cyan-50" />
              </label>
              <label className="grid gap-2 text-sm text-cyan-50/86">
                <span>Cases per cycle</span>
                <input type="number" min={1} max={50} value={casesPerCycle} onChange={(event) => setCasesPerCycle(Number(event.target.value) || 1)} className="rounded-xl border border-cyan-200/10 bg-[rgba(13,30,50,0.74)] px-3 py-2 text-cyan-50" />
              </label>
              <label className="flex items-end gap-3 rounded-xl border border-cyan-200/10 bg-[rgba(13,30,50,0.32)] px-3 py-3 text-sm text-cyan-50/86 md:col-span-2 xl:col-span-2">
                <input type="checkbox" checked={stopOnCriticalFailure} onChange={(event) => setStopOnCriticalFailure(event.target.checked)} />
                <span>Stop early on critical failure</span>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleRunRepeatedCycles()}
                disabled={isRunningRepeated || !selectedPackIds.length}
                className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {isRunningRepeated ? 'Running repeated cycles…' : 'Run repeated lab cycle'}
              </button>
            </div>
            {repeatedRunResult ? (
              <div className="mt-4 rounded-[18px] border border-cyan-200/10 bg-[rgba(7,17,30,0.42)] p-4 text-sm text-cyan-50/82">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-cyan-200/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/80">
                    {repeatedRunResult.cyclesCompleted}/{repeatedRunResult.cyclesRequested} cycles
                  </span>
                  <span className="rounded-full border border-cyan-200/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/80">
                    pass rate {(repeatedRunResult.passRate * 100).toFixed(1)}%
                  </span>
                  {repeatedRunResult.stoppedEarly ? (
                    <span className="rounded-full border border-rose-300/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-100">
                      stopped early
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="Total cases" value={String(repeatedRunResult.totalCases)} />
                  <MetricCard label="Passed" value={String(repeatedRunResult.totalPassed)} />
                  <MetricCard label="Failed" value={String(repeatedRunResult.totalFailed)} />
                  <MetricCard label="Urgent / high fixes" value={`${repeatedRunResult.urgentFixTaskCount} / ${repeatedRunResult.highPriorityFixTaskCount}`} />
                </div>
                {repeatedRunResult.stopReason ? (
                  <div className="mt-3 text-xs leading-6 text-rose-100/88">{repeatedRunResult.stopReason}</div>
                ) : null}
                {repeatedRunResult.repeatedFailurePatterns.length ? (
                  <div className="mt-3 space-y-2">
                    {repeatedRunResult.repeatedFailurePatterns.slice(0, 4).map((pattern) => (
                      <div key={`${pattern.failure_category}-${pattern.likely_root_cause}`} className="rounded-xl border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2 text-xs">
                        {pattern.failure_category} • {pattern.likely_root_cause} • {pattern.count}
                      </div>
                    ))}
                  </div>
                ) : null}
                {repeatedRunResult.runIds.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {repeatedRunResult.runIds.map((runId) => (
                      <Link key={runId} href={`/admin/vera-lab/runs/${runId}`} className="rounded-full border border-cyan-200/12 px-3 py-1 text-[11px] font-semibold text-cyan-50">
                        {runId.slice(0, 8)}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
                onClick={() => void handleRunBatch()}
                disabled={isRunning || !selectedPackIds.length}
                className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {isRunning ? 'Running Atlas Lab…' : 'Run test batch'}
              </button>
              <button
                type="button"
                onClick={() => void loadSummary()}
                className="rounded-xl border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-4 py-2 text-sm font-semibold text-cyan-50"
              >
                Refresh summary
              </button>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-rose-300/20 bg-[rgba(92,21,38,0.32)] px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}
          </div>

          <div className="rounded-[22px] border border-cyan-200/10 bg-[rgba(9,20,35,0.62)] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">Latest run report</div>
            {runResult ? (
              <div className="mt-3 space-y-4 text-sm text-cyan-50/82">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/58">Run</div>
                  <div className="mt-1 font-mono text-xs text-cyan-50/72">{runResult.run.id}</div>
                  <Link
                    href={`/admin/vera-lab/runs/${runResult.run.id}`}
                    className="mt-3 inline-flex rounded-xl border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-semibold text-cyan-50"
                  >
                    Open run detail
                  </Link>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/58">Pass / fail by category</div>
                  <div className="mt-2 space-y-2">
                    {Object.entries(runResult.report.passFailByCategory).map(([category, counts]) => (
                      <div key={category} className="rounded-xl border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-2">
                        <div className="font-semibold text-white">{category}</div>
                        <div className="mt-1 text-xs text-cyan-50/70">{counts.passed} passed / {counts.failed} failed</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/58">Worst misses</div>
                  <div className="mt-2 space-y-2">
                    {runResult.report.worstMisses.slice(0, 4).map((miss) => (
                      <div key={miss.case_id} className="rounded-xl border border-rose-300/14 bg-[rgba(92,21,38,0.22)] px-3 py-2">
                        <div className="font-semibold text-white">{miss.category} / {miss.subtype}</div>
                        <div className="mt-1 text-xs text-cyan-50/70">{miss.failure_category || 'unknown'} • {miss.likely_root_cause} • {miss.severity_if_wrong}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-cyan-50/62">
                Run a batch to generate a pass/fail report, repeated failure patterns, and the repair queue.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel title="Top priorities">
          {isLoading ? (
            <PanelBody>Loading top priorities…</PanelBody>
          ) : summary?.topPriorities.length ? (
            <div className="space-y-3">
              {summary.topPriorities.map((item) => (
                <Link
                  key={item.id}
                  href={`/admin/vera-lab/runs/${item.run_id}?failedOnly=1&focusCase=${item.case_id}#case-${item.case_id}`}
                  className="block rounded-[18px] border border-rose-300/14 bg-[rgba(92,21,38,0.22)] p-4 transition hover:border-rose-200/26 hover:bg-[rgba(109,29,49,0.28)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-rose-300/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-100">
                      {item.priority_band}
                    </span>
                    <span className="rounded-full border border-cyan-200/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/70">
                      score {item.priority_score}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/58">
                      {item.category} / {item.subtype}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">{item.improvement_summary || 'Priority fix plan pending summary.'}</div>
                  {item.priority_explanation?.rationale?.length ? (
                    <div className="mt-2 text-xs leading-6 text-cyan-50/72">
                      Why prioritized: {item.priority_explanation.rationale.slice(0, 2).join(' ')}
                    </div>
                  ) : null}
                  <div className="mt-2 text-[11px] text-cyan-100/58">
                    {item.failure_category || 'unclassified'} • {item.assigned_layer} • {item.severity_if_wrong}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <PanelBody>No prioritized fixes yet.</PanelBody>
          )}
        </Panel>

        <Panel title="Recent failed cases">
          {isLoading ? (
            <PanelBody>Loading failed cases…</PanelBody>
          ) : summary?.recentFailedCases.length ? (
            <div className="space-y-3">
              {summary.recentFailedCases.map((item) => (
                <Link
                  key={item.id}
                  href={buildFailedCaseHref(item)}
                  className="block rounded-[18px] border border-rose-300/14 bg-[rgba(92,21,38,0.22)] p-4 transition hover:border-rose-200/26 hover:bg-[rgba(109,29,49,0.28)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-rose-300/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-100">
                      {item.severity_if_wrong}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/58">{item.category} / {item.subtype}</span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">{item.prompt}</div>
                  <div className="mt-2 text-xs leading-6 text-cyan-50/74">{item.vera_response}</div>
                  <div className="mt-2 text-[11px] text-cyan-100/58">{item.failure_category || 'unclassified'} • {item.judge_notes}</div>
                  <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100/70">
                    Open in run detail
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <PanelBody>No failed cases yet.</PanelBody>
          )}
        </Panel>

        <Panel title="Repeated failure patterns">
          {isLoading ? (
            <PanelBody>Loading failure patterns…</PanelBody>
          ) : summary?.repeatedFailurePatterns.length ? (
            <div className="space-y-3">
              {summary.repeatedFailurePatterns.map((pattern) => (
                <div key={`${pattern.failure_category}-${pattern.likely_root_cause}`} className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] p-4">
                  <div className="text-sm font-semibold text-white">{pattern.failure_category}</div>
                  <div className="mt-1 text-xs text-cyan-50/70">{pattern.count} repeated misses • likely root cause: {pattern.likely_root_cause}</div>
                </div>
              ))}
            </div>
          ) : (
            <PanelBody>No repeated failure clusters yet.</PanelBody>
          )}
        </Panel>

        <Panel title="Fix queue by priority">
          {isLoading ? (
            <PanelBody>Loading repair queue…</PanelBody>
          ) : summary?.repairQueue.length ? (
            <div className="space-y-3">
              {summary.repairQueue.map((task) => (
                <div key={task.id} className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-white">{task.assigned_layer}</div>
                        <span className="rounded-full border border-cyan-200/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/70">
                          {task.priority_band}
                        </span>
                        <span className="rounded-full border border-cyan-200/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/70">
                          score {task.priority_score}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-cyan-50/70">{task.status} • approval required: {task.approval_required ? 'yes' : 'no'}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRerunRegression(task.id)}
                      className="rounded-xl border border-cyan-200/12 bg-[rgba(13,30,50,0.74)] px-3 py-1.5 text-xs font-semibold text-cyan-50"
                    >
                      Run regression gate
                    </button>
                  </div>
                  {task.improvement_summary ? (
                    <div className="mt-3 text-sm text-white">{task.improvement_summary}</div>
                  ) : null}
                  {task.priority_explanation?.rationale?.length ? (
                    <div className="mt-2 text-xs leading-6 text-cyan-50/72">
                      Why prioritized: {task.priority_explanation.rationale.slice(0, 2).join(' ')}
                    </div>
                  ) : null}
                  {task.suggested_fix_strategy ? (
                    <div className="mt-2 text-xs leading-6 text-cyan-50/72">
                      Strategy: {task.suggested_fix_strategy.recommended_change}
                    </div>
                  ) : null}
                  {task.regression_plan ? (
                    <div className="mt-2 text-xs leading-6 text-cyan-50/72">
                      Regression plan: {task.regression_plan}
                    </div>
                  ) : null}
                  <pre className="mt-3 whitespace-pre-wrap rounded-[14px] bg-[rgba(7,17,30,0.54)] p-3 text-xs leading-6 text-cyan-50/76">{task.patch_prompt}</pre>
                </div>
              ))}
              {repairActionError ? (
                <div className="rounded-xl border border-rose-300/20 bg-[rgba(92,21,38,0.32)] px-4 py-3 text-sm text-rose-100">
                  {repairActionError}
                </div>
              ) : null}
            </div>
          ) : (
            <PanelBody>No repair tasks queued yet.</PanelBody>
          )}
        </Panel>

        <Panel title="Shared failure clusters">
          {isLoading ? (
            <PanelBody>Loading shared-fix clusters…</PanelBody>
          ) : summary?.sharedFailureClusters.length ? (
            <div className="space-y-3">
              {summary.sharedFailureClusters.map((cluster) => (
                <Link
                  key={cluster.cluster_key}
                  href={cluster.representative_run_id && cluster.representative_case_id
                    ? `/admin/vera-lab/runs/${cluster.representative_run_id}?failedOnly=1&focusCase=${cluster.representative_case_id}${cluster.search_query ? `&q=${encodeURIComponent(cluster.search_query)}` : ''}#case-${cluster.representative_case_id}`
                    : '/admin/vera-lab'}
                  className="block rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] p-4 transition hover:border-cyan-200/18 hover:bg-[rgba(19,38,61,0.46)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-white">{cluster.failure_category || 'unclassified failure'}</div>
                    <span className="rounded-full border border-cyan-200/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/70">
                      {cluster.count} cases
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-white">{cluster.representative_prompt}</div>
                  <div className="mt-2 text-xs text-cyan-50/70">
                    likely root cause: {cluster.likely_root_cause} • assigned layer: {cluster.assigned_layer}
                  </div>
                  <div className="mt-2 text-xs leading-6 text-cyan-50/72">
                    Shared fix direction: {cluster.recommended_shared_fix}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <PanelBody>No shared-fix clusters yet.</PanelBody>
          )}
        </Panel>

        <Panel title="Regression results">
          {isLoading ? (
            <PanelBody>Loading regression results…</PanelBody>
          ) : summary?.regressionResults.length ? (
            <div className="space-y-3">
              {summary.regressionResults.map((item) => (
                <div key={item.id} className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] p-4">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${item.passed ? 'bg-emerald-500/18 text-emerald-100' : 'bg-rose-500/18 text-rose-100'}`}>
                      {item.passed ? 'passed' : 'failed'}
                    </span>
                    <span className="text-[11px] text-cyan-100/58">{item.fix_task_id}</span>
                  </div>
                  <div className="mt-2 text-sm text-white">{item.prompt_variant}</div>
                  <div className="mt-1 text-xs text-cyan-50/70">{item.notes}</div>
                </div>
              ))}
            </div>
          ) : (
            <PanelBody>No regression rows yet.</PanelBody>
          )}
        </Panel>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-cyan-100/58">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="aurora-panel rounded-[28px] p-6">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100/70">{title}</div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PanelBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-cyan-200/10 bg-[rgba(13,30,50,0.42)] px-4 py-4 text-sm text-cyan-50/66">
      {children}
    </div>
  );
}
