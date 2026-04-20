'use client';

import { useEffect, useMemo, useState } from 'react';
import { calculateAggregateStats, exportEvalResults, exportEvalResultsCsv, getRubricTotal, loadEvalResults, rubricCategoryLabels, type EvalResultRecord } from '@/lib/eval/results-history';
import { EVAL_CASE_KEY } from '@/lib/constants/storage';
import type { EvalCaseSelection } from '@/types/eval';
import { fidelityCases } from '@/lib/eval/fidelity-cases';
import { founderWorkflowEvalCases } from '@/lib/eval/founder-workflow-cases';
import { encounterSupportEvalCases } from '@/lib/eval/encounter-support-cases';
import { outpatientPsychEvalCases } from '@/lib/eval/outpatient-psych-cases';
import { phaseTwoTrustEvalCases } from '@/lib/eval/phase-two-trust-cases';

type ProductPressureSeverity = 'high' | 'medium' | 'low' | 'unscored';

export function EvalResultsHistory() {
  const [results, setResults] = useState<EvalResultRecord[]>([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState('All specialties');
  const [exportMessage, setExportMessage] = useState('');
  const allEvalCases = useMemo(
    () => [...fidelityCases, ...founderWorkflowEvalCases, ...outpatientPsychEvalCases, ...encounterSupportEvalCases, ...phaseTwoTrustEvalCases],
    [],
  );

  useEffect(() => {
    setResults(loadEvalResults());
  }, []);

  const specialtyOptions = useMemo(() => {
    const values = Array.from(new Set([...allEvalCases.map((item) => item.specialty), ...results.map((item) => item.specialty)])).filter(Boolean);
    return ['All specialties', ...values];
  }, [allEvalCases, results]);

  const filteredResults = useMemo(() => selectedSpecialty === 'All specialties' ? results : results.filter((item) => item.specialty === selectedSpecialty), [results, selectedSpecialty]);
  const aggregateStats = useMemo(() => calculateAggregateStats(filteredResults), [filteredResults]);
  const founderWorkflowResults = useMemo(
    () => results.filter((item) => founderWorkflowEvalCases.some((workflow) => workflow.id === item.id)),
    [results],
  );
  const founderWorkflowStats = useMemo(
    () => calculateAggregateStats(founderWorkflowResults),
    [founderWorkflowResults],
  );
  const founderWorkflowLane = useMemo(
    () => founderWorkflowEvalCases.map((workflow) => ({
      workflow,
      result: founderWorkflowResults.find((item) => item.id === workflow.id) || null,
    })),
    [founderWorkflowResults],
  );
  const founderWorkflowProductProgress = useMemo(
    () => founderWorkflowLane
      .map(({ workflow, result }) => {
        const rubricTotal = result ? getRubricTotal(result.scorecard) : null;
        const severity: ProductPressureSeverity = result
          ? result.scorecard.stoplight === 'Red' || result.scorecard.overallRating === 'Fail'
            ? 'high'
            : result.scorecard.stoplight === 'Yellow' || result.scorecard.overallRating === 'Needs revision'
              ? 'medium'
              : 'low'
          : 'unscored';

        const latestPressure = result
          ? result.scorecard.failuresFound || result.scorecard.recommendedFix || 'Scored, but no explicit pressure note saved.'
          : 'Not scored yet. This workflow still needs an eval run before product pressure can be read honestly.';

        return {
          id: workflow.id,
          title: workflow.title,
          productSurface: workflow.productSurface || 'Workflow-specific trust layer',
          nextBuildFocus: workflow.nextBuildFocus || 'Translate this workflow pressure into a concrete review or generation improvement.',
          severity,
          rubricTotal,
          criticalFailures: result?.scorecard.criticalFailures.length || 0,
          latestPressure,
        };
      })
      .sort((a, b) => {
        const weight = { high: 0, medium: 1, unscored: 2, low: 3 } as const;
        return weight[a.severity] - weight[b.severity];
      }),
    [founderWorkflowLane],
  );
  const outpatientPsychResults = useMemo(
    () => results.filter((item) => outpatientPsychEvalCases.some((workflow) => workflow.id === item.id)),
    [results],
  );
  const outpatientPsychStats = useMemo(
    () => calculateAggregateStats(outpatientPsychResults),
    [outpatientPsychResults],
  );
  const outpatientPsychLane = useMemo(
    () => outpatientPsychEvalCases.map((workflow) => ({
      workflow,
      result: outpatientPsychResults.find((item) => item.id === workflow.id) || null,
    })),
    [outpatientPsychResults],
  );
  const outpatientPsychProductProgress = useMemo(
    () => outpatientPsychLane
      .map(({ workflow, result }) => {
        const rubricTotal = result ? getRubricTotal(result.scorecard) : null;
        const severity: ProductPressureSeverity = result
          ? result.scorecard.stoplight === 'Red' || result.scorecard.overallRating === 'Fail'
            ? 'high'
            : result.scorecard.stoplight === 'Yellow' || result.scorecard.overallRating === 'Needs revision'
              ? 'medium'
              : 'low'
          : 'unscored';

        const latestPressure = result
          ? result.scorecard.failuresFound || result.scorecard.recommendedFix || 'Scored, but no explicit outpatient pressure note saved.'
          : 'Not scored yet. This outpatient psych workflow still needs eval coverage before readiness can be read honestly.';

        return {
          id: workflow.id,
          title: workflow.title,
          productSurface: workflow.productSurface || 'Outpatient psych trust layer',
          nextBuildFocus: workflow.nextBuildFocus || 'Translate this outpatient pressure into a concrete product improvement.',
          severity,
          rubricTotal,
          criticalFailures: result?.scorecard.criticalFailures.length || 0,
          latestPressure,
        };
      })
      .sort((a, b) => {
        const weight = { high: 0, medium: 1, unscored: 2, low: 3 } as const;
        return weight[a.severity] - weight[b.severity];
      }),
    [outpatientPsychLane],
  );
  const encounterSupportResults = useMemo(
    () => results.filter((item) => encounterSupportEvalCases.some((workflow) => workflow.id === item.id)),
    [results],
  );
  const encounterSupportStats = useMemo(
    () => calculateAggregateStats(encounterSupportResults),
    [encounterSupportResults],
  );
  const encounterSupportLane = useMemo(
    () => encounterSupportEvalCases.map((workflow) => ({
      workflow,
      result: encounterSupportResults.find((item) => item.id === workflow.id) || null,
    })),
    [encounterSupportResults],
  );
  const encounterSupportProductProgress = useMemo(
    () => encounterSupportLane
      .map(({ workflow, result }) => {
        const rubricTotal = result ? getRubricTotal(result.scorecard) : null;
        const severity: ProductPressureSeverity = result
          ? result.scorecard.stoplight === 'Red' || result.scorecard.overallRating === 'Fail'
            ? 'high'
            : result.scorecard.stoplight === 'Yellow' || result.scorecard.overallRating === 'Needs revision'
              ? 'medium'
              : 'low'
          : 'unscored';

        const latestPressure = result
          ? result.scorecard.failuresFound || result.scorecard.recommendedFix || 'Scored, but no explicit encounter-support pressure note saved.'
          : 'Not scored yet. This encounter-support workflow still needs eval coverage before it can shape product pressure honestly.';

        return {
          id: workflow.id,
          title: workflow.title,
          productSurface: workflow.productSurface || 'Encounter support layer',
          nextBuildFocus: workflow.nextBuildFocus || 'Translate this encounter-support pressure into a concrete product improvement.',
          severity,
          rubricTotal,
          criticalFailures: result?.scorecard.criticalFailures.length || 0,
          latestPressure,
        };
      })
      .sort((a, b) => {
        const weight = { high: 0, medium: 1, unscored: 2, low: 3 } as const;
        return weight[a.severity] - weight[b.severity];
      }),
    [encounterSupportLane],
  );
  const phaseTwoTrustResults = useMemo(
    () => results.filter((item) => phaseTwoTrustEvalCases.some((workflow) => workflow.id === item.id)),
    [results],
  );
  const phaseTwoTrustStats = useMemo(
    () => calculateAggregateStats(phaseTwoTrustResults),
    [phaseTwoTrustResults],
  );
  const phaseTwoTrustLane = useMemo(
    () => phaseTwoTrustEvalCases.map((workflow) => ({
      workflow,
      result: phaseTwoTrustResults.find((item) => item.id === workflow.id) || null,
    })),
    [phaseTwoTrustResults],
  );
  const phaseTwoTrustProductProgress = useMemo(
    () => phaseTwoTrustLane
      .map(({ workflow, result }) => {
        const rubricTotal = result ? getRubricTotal(result.scorecard) : null;
        const severity: ProductPressureSeverity = result
          ? result.scorecard.stoplight === 'Red' || result.scorecard.overallRating === 'Fail'
            ? 'high'
            : result.scorecard.stoplight === 'Yellow' || result.scorecard.overallRating === 'Needs revision'
              ? 'medium'
              : 'low'
          : 'unscored';

        const latestPressure = result
          ? result.scorecard.failuresFound || result.scorecard.recommendedFix || 'Scored, but no explicit Phase 2 trust pressure note saved.'
          : 'Not scored yet. This Phase 2 trust workflow still needs eval coverage before progress can be read honestly.';

        return {
          id: workflow.id,
          title: workflow.title,
          productSurface: workflow.productSurface || 'Phase 2 trust layer',
          nextBuildFocus: workflow.nextBuildFocus || 'Translate this trust pressure into a concrete review or generation improvement.',
          severity,
          rubricTotal,
          criticalFailures: result?.scorecard.criticalFailures.length || 0,
          latestPressure,
        };
      })
      .sort((a, b) => {
        const weight = { high: 0, medium: 1, unscored: 2, low: 3 } as const;
        return weight[a.severity] - weight[b.severity];
      }),
    [phaseTwoTrustLane],
  );
  const phaseTwoCloseoutStatus = useMemo(() => {
    const scoredIds = new Set(phaseTwoTrustResults.map((item) => item.id));
    const missingIds = phaseTwoTrustEvalCases.map((item) => item.id).filter((id) => !scoredIds.has(id));
    const status = missingIds.length === 0 ? 'complete' : phaseTwoTrustResults.length === 0 ? 'not-started' : 'in-progress';

    return {
      status,
      scoredCount: phaseTwoTrustResults.length,
      totalCount: phaseTwoTrustEvalCases.length,
      missingIds,
    };
  }, [phaseTwoTrustResults]);

  async function copyContent(content: string, success: string, failure: string) {
    try {
      await navigator.clipboard.writeText(content);
      setExportMessage(success);
      window.setTimeout(() => setExportMessage(''), 2200);
    } catch {
      setExportMessage(failure);
      window.setTimeout(() => setExportMessage(''), 2200);
    }
  }

  function handleReopenCase(result: EvalResultRecord) {
    const selectedCase = allEvalCases.find((item) => item.id === result.id);
    if (!selectedCase) {
      setExportMessage(`Unable to reopen ${result.id}; source case definition not found.`);
      window.setTimeout(() => setExportMessage(''), 2200);
      return;
    }

    const payload: EvalCaseSelection = {
      id: selectedCase.id,
      specialty: selectedCase.specialty,
      noteType: selectedCase.noteType,
      title: selectedCase.title,
      sourceInput: selectedCase.sourceInput,
    };

    localStorage.setItem(EVAL_CASE_KEY, JSON.stringify(payload));
    window.location.href = '/dashboard/new-note';
  }

  function handleOpenCaseById(caseId: string) {
    const selectedCase = allEvalCases.find((item) => item.id === caseId);
    if (!selectedCase) {
      setExportMessage(`Unable to open ${caseId}; source case definition not found.`);
      window.setTimeout(() => setExportMessage(''), 2200);
      return;
    }

    const payload: EvalCaseSelection = {
      id: selectedCase.id,
      specialty: selectedCase.specialty,
      noteType: selectedCase.noteType,
      title: selectedCase.title,
      sourceInput: selectedCase.sourceInput,
    };

    localStorage.setItem(EVAL_CASE_KEY, JSON.stringify(payload));
    window.location.href = '/dashboard/new-note';
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Results history</h2>
          <p className="mt-1 text-sm text-muted">Saved regression runs, exportable summaries, and a less embarrassing sense of whether changes actually helped.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-2 text-sm font-medium text-ink">
            <span>Filter by specialty</span>
            <select value={selectedSpecialty} onChange={(event) => setSelectedSpecialty(event.target.value)} className="rounded-lg border border-border bg-white p-3">
              {specialtyOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <button onClick={() => copyContent(exportEvalResults(filteredResults), 'Copied filtered eval results JSON to clipboard.', 'Unable to copy export JSON automatically on this browser.')} className="self-end rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium">Copy Export JSON</button>
          <button onClick={() => copyContent(exportEvalResultsCsv(filteredResults), 'Copied filtered eval results CSV to clipboard.', 'Unable to copy export CSV automatically on this browser.')} className="self-end rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium">Copy Export CSV</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Cases reviewed" value={String(aggregateStats.totalCases)} />
        <StatCard label="Pass / Revise / Fail" value={`${aggregateStats.passCount} / ${aggregateStats.needsRevisionCount} / ${aggregateStats.failCount}`} />
        <StatCard label="Green / Yellow / Red" value={`${aggregateStats.greenCount} / ${aggregateStats.yellowCount} / ${aggregateStats.redCount}`} />
        <StatCard label="Average rubric total" value={`${aggregateStats.averageRubricScore} / 16`} />
        <StatCard label="Mismatch totals" value={`${aggregateStats.missingExpectedTruthsCount} missing truths • ${aggregateStats.forbiddenAdditionsCount} forbidden adds • ${aggregateStats.missingExplicitDatesCount} missing dates • ${aggregateStats.criticalFailuresCount} critical failures`} />
      </div>

      <div className={`rounded-xl border p-6 shadow-sm ${
        phaseTwoCloseoutStatus.status === 'complete'
          ? 'border-emerald-200 bg-emerald-50'
          : phaseTwoCloseoutStatus.status === 'in-progress'
            ? 'border-amber-200 bg-amber-50'
            : 'border-sky-200 bg-sky-50'
      }`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className={`text-lg font-semibold ${
              phaseTwoCloseoutStatus.status === 'complete'
                ? 'text-emerald-950'
                : phaseTwoCloseoutStatus.status === 'in-progress'
                  ? 'text-amber-950'
                  : 'text-sky-950'
            }`}>
              Phase 2 trust closeout status
            </h3>
            <p className={`mt-1 text-sm ${
              phaseTwoCloseoutStatus.status === 'complete'
                ? 'text-emerald-900'
                : phaseTwoCloseoutStatus.status === 'in-progress'
                  ? 'text-amber-900'
                  : 'text-sky-900'
            }`}>
              Code-side Phase 2 work is in place. This status tracks the remaining manual closeout work: running and saving scorecards for the dedicated Phase 2 trust cases.
            </p>
          </div>
          <div className={`rounded-full border bg-white px-3 py-1 text-xs font-medium ${
            phaseTwoCloseoutStatus.status === 'complete'
              ? 'border-emerald-200 text-emerald-900'
              : phaseTwoCloseoutStatus.status === 'in-progress'
                ? 'border-amber-200 text-amber-900'
                : 'border-sky-200 text-sky-900'
          }`}>
            {phaseTwoCloseoutStatus.scoredCount} / {phaseTwoCloseoutStatus.totalCount} scored
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-white/70 bg-white/80 p-4 text-sm text-slate-900">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Status</div>
            <div className="mt-2 font-medium">
              {phaseTwoCloseoutStatus.status === 'complete'
                ? 'Phase 2 trust closeout cases are fully scored.'
                : phaseTwoCloseoutStatus.status === 'in-progress'
                  ? 'Phase 2 trust closeout is in progress.'
                  : 'Phase 2 trust closeout has not started yet.'}
            </div>
            <div className="mt-2 text-sm text-slate-700">
              {phaseTwoCloseoutStatus.status === 'complete'
                ? 'This is the point where Phase 2 can be treated as fully closed rather than merely code-complete.'
                : 'The remaining step is to run the dedicated trust cases in Eval and save scorecards so this lane reflects real product pressure.'}
            </div>
          </div>
          <div className="rounded-lg border border-white/70 bg-white/80 p-4 text-sm text-slate-900">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Remaining case IDs</div>
            <div className="mt-2 font-medium">
              {phaseTwoCloseoutStatus.missingIds.length ? phaseTwoCloseoutStatus.missingIds.join(', ') : 'None'}
            </div>
            <div className="mt-2 text-sm text-slate-700">
              Recommended path: open `Eval`, choose `Phase 2 trust set`, work through cases `39-42`, save scorecards, then return here to read the lane and pressure summary.
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-violet-950">Founder workflow regression lane</h3>
            <p className="mt-1 text-sm text-violet-900">
              This is the focused view for the four strongest founder workflow families. It helps you see whether Veranote is holding the psych-first founder fit together while the broader eval suite keeps expanding.
            </p>
          </div>
          <div className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-medium text-violet-900">
            Founder dataset only
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Lane coverage" value={`${founderWorkflowResults.length} / ${founderWorkflowEvalCases.length} scored`} />
          <StatCard label="Pass / Revise / Fail" value={`${founderWorkflowStats.passCount} / ${founderWorkflowStats.needsRevisionCount} / ${founderWorkflowStats.failCount}`} />
          <StatCard label="Green / Yellow / Red" value={`${founderWorkflowStats.greenCount} / ${founderWorkflowStats.yellowCount} / ${founderWorkflowStats.redCount}`} />
          <StatCard label="Lane pressure" value={`${founderWorkflowStats.criticalFailuresCount} critical failures • ${founderWorkflowStats.forbiddenAdditionsCount} forbidden adds`} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {founderWorkflowLane.map(({ workflow, result }) => (
            <div key={workflow.id} className="rounded-xl border border-violet-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-violet-950">{workflow.title}</div>
                  <div className="mt-1 text-xs text-violet-800">{workflow.noteType}</div>
                  <div className="mt-2 text-sm text-slate-700">{workflow.riskFocus}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {result ? (
                    <>
                      <Badge>{result.scorecard.stoplight}</Badge>
                      <Badge>{result.scorecard.overallRating}</Badge>
                      <Badge>{getRubricTotal(result.scorecard)}/16 rubric</Badge>
                    </>
                  ) : (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
                      Not scored yet
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-slate-800">
                <div>
                  <span className="font-medium text-violet-950">Expected focus:</span> {workflow.rubricEmphasis?.map((key) => rubricCategoryLabels[key]).join(' • ') || 'Standard fidelity scoring'}
                </div>
                <div>
                  <span className="font-medium text-violet-950">Latest pressure:</span>{' '}
                  {result
                    ? `${result.scorecard.criticalFailures.length} critical failures, ${result.scorecard.failuresFound || 'no saved failure note'}`
                    : 'No saved scorecard yet.'}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {result ? (
                  <button onClick={() => handleReopenCase(result)} className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-950">
                    Reopen workflow case
                  </button>
                ) : (
                  <button onClick={() => handleOpenCaseById(workflow.id)} className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-950">
                    Open workflow case
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-emerald-950">Outpatient psych readiness lane</h3>
            <p className="mt-1 text-sm text-emerald-900">
              This is the focused view for the new outpatient psych cases. It shows whether Veranote can handle outpatient med-management, telehealth risk nuance, and intake uncertainty without slipping back into inpatient-shaped shortcuts.
            </p>
          </div>
          <div className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-900">
            Outpatient readiness set
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Lane coverage" value={`${outpatientPsychResults.length} / ${outpatientPsychEvalCases.length} scored`} />
          <StatCard label="Pass / Revise / Fail" value={`${outpatientPsychStats.passCount} / ${outpatientPsychStats.needsRevisionCount} / ${outpatientPsychStats.failCount}`} />
          <StatCard label="Green / Yellow / Red" value={`${outpatientPsychStats.greenCount} / ${outpatientPsychStats.yellowCount} / ${outpatientPsychStats.redCount}`} />
          <StatCard label="Lane pressure" value={`${outpatientPsychStats.criticalFailuresCount} critical failures • ${outpatientPsychStats.forbiddenAdditionsCount} forbidden adds`} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {outpatientPsychLane.map(({ workflow, result }) => (
            <div key={workflow.id} className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-emerald-950">{workflow.title}</div>
                  <div className="mt-1 text-xs text-emerald-800">{workflow.noteType}</div>
                  <div className="mt-2 text-sm text-slate-700">{workflow.riskFocus}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {result ? (
                    <>
                      <Badge>{result.scorecard.stoplight}</Badge>
                      <Badge>{result.scorecard.overallRating}</Badge>
                      <Badge>{getRubricTotal(result.scorecard)}/16 rubric</Badge>
                    </>
                  ) : (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
                      Not scored yet
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-slate-800">
                <div>
                  <span className="font-medium text-emerald-950">Expected focus:</span> {workflow.rubricEmphasis?.map((key) => rubricCategoryLabels[key]).join(' • ') || 'Standard fidelity scoring'}
                </div>
                <div>
                  <span className="font-medium text-emerald-950">Latest pressure:</span>{' '}
                  {result
                    ? `${result.scorecard.criticalFailures.length} critical failures, ${result.scorecard.failuresFound || 'no saved failure note'}`
                    : 'No saved scorecard yet.'}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {result ? (
                  <button onClick={() => handleReopenCase(result)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-950">
                    Reopen outpatient case
                  </button>
                ) : (
                  <button onClick={() => handleOpenCaseById(workflow.id)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-950">
                    Open outpatient case
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-amber-950">Encounter support lane</h3>
            <p className="mt-1 text-sm text-amber-900">
              This lane watches the new structured encounter-support layer: telehealth facts, psychotherapy minutes, interactive complexity, and crisis-note structure. It is meant to catch when Veranote starts sounding coding-aware without actually staying source-faithful.
            </p>
          </div>
          <div className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-900">
            Encounter support set
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Lane coverage" value={`${encounterSupportResults.length} / ${encounterSupportEvalCases.length} scored`} />
          <StatCard label="Pass / Revise / Fail" value={`${encounterSupportStats.passCount} / ${encounterSupportStats.needsRevisionCount} / ${encounterSupportStats.failCount}`} />
          <StatCard label="Green / Yellow / Red" value={`${encounterSupportStats.greenCount} / ${encounterSupportStats.yellowCount} / ${encounterSupportStats.redCount}`} />
          <StatCard label="Lane pressure" value={`${encounterSupportStats.criticalFailuresCount} critical failures • ${encounterSupportStats.forbiddenAdditionsCount} forbidden adds`} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {encounterSupportLane.map(({ workflow, result }) => (
            <div key={workflow.id} className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-amber-950">{workflow.title}</div>
                  <div className="mt-1 text-xs text-amber-800">{workflow.noteType}</div>
                  <div className="mt-2 text-sm text-slate-700">{workflow.riskFocus}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {result ? (
                    <>
                      <Badge>{result.scorecard.stoplight}</Badge>
                      <Badge>{result.scorecard.overallRating}</Badge>
                      <Badge>{getRubricTotal(result.scorecard)}/16 rubric</Badge>
                    </>
                  ) : (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
                      Not scored yet
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-slate-800">
                <div>
                  <span className="font-medium text-amber-950">Expected focus:</span> {workflow.rubricEmphasis?.map((key) => rubricCategoryLabels[key]).join(' • ') || 'Standard fidelity scoring'}
                </div>
                <div>
                  <span className="font-medium text-amber-950">Latest pressure:</span>{' '}
                  {result
                    ? `${result.scorecard.criticalFailures.length} critical failures, ${result.scorecard.failuresFound || 'no saved failure note'}`
                    : 'No saved scorecard yet.'}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {result ? (
                  <button onClick={() => handleReopenCase(result)} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">
                    Reopen encounter case
                  </button>
                ) : (
                  <button onClick={() => handleOpenCaseById(workflow.id)} className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950">
                    Open encounter case
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-sky-950">Phase 2 trust lane</h3>
            <p className="mt-1 text-sm text-sky-900">
              This lane pressure-tests the exact visible trust work from Phase 2: objective conflict handling, medication truth, diagnosis caution, and passive-versus-acute risk wording.
            </p>
          </div>
          <div className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-900">
            Phase 2 trust set
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Lane coverage" value={`${phaseTwoTrustResults.length} / ${phaseTwoTrustEvalCases.length} scored`} />
          <StatCard label="Pass / Revise / Fail" value={`${phaseTwoTrustStats.passCount} / ${phaseTwoTrustStats.needsRevisionCount} / ${phaseTwoTrustStats.failCount}`} />
          <StatCard label="Green / Yellow / Red" value={`${phaseTwoTrustStats.greenCount} / ${phaseTwoTrustStats.yellowCount} / ${phaseTwoTrustStats.redCount}`} />
          <StatCard label="Lane pressure" value={`${phaseTwoTrustStats.criticalFailuresCount} critical failures • ${phaseTwoTrustStats.forbiddenAdditionsCount} forbidden adds`} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {phaseTwoTrustLane.map(({ workflow, result }) => (
            <div key={workflow.id} className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-sky-950">{workflow.title}</div>
                  <div className="mt-1 text-xs text-sky-800">{workflow.noteType}</div>
                  <div className="mt-2 text-sm text-slate-700">{workflow.riskFocus}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {result ? (
                    <>
                      <Badge>{result.scorecard.stoplight}</Badge>
                      <Badge>{result.scorecard.overallRating}</Badge>
                      <Badge>{getRubricTotal(result.scorecard)}/16 rubric</Badge>
                    </>
                  ) : (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
                      Not scored yet
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-slate-800">
                <div>
                  <span className="font-medium text-sky-950">Expected focus:</span> {workflow.rubricEmphasis?.map((key) => rubricCategoryLabels[key]).join(' • ') || 'Standard fidelity scoring'}
                </div>
                <div>
                  <span className="font-medium text-sky-950">Latest pressure:</span>{' '}
                  {result
                    ? `${result.scorecard.criticalFailures.length} critical failures, ${result.scorecard.failuresFound || 'no saved failure note'}`
                    : 'No saved scorecard yet.'}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {result ? (
                  <button onClick={() => handleReopenCase(result)} className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-950">
                    Reopen Phase 2 case
                  </button>
                ) : (
                  <button onClick={() => handleOpenCaseById(workflow.id)} className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-950">
                    Open Phase 2 case
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-emerald-950">Veranote product progress from founder workflows</h3>
            <p className="mt-1 text-sm text-emerald-900">
              This translates founder workflow regression pressure into concrete product areas. It is not the whole roadmap, but it is a very direct read on what the app should improve next for your real psych-first use.
            </p>
          </div>
          <div className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-900">
            Product pressure view
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {founderWorkflowProductProgress.map((item) => (
            <div key={item.id} className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-emerald-950">{item.productSurface}</div>
                  <div className="mt-1 text-xs text-emerald-800">{item.title}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    item.severity === 'high'
                      ? 'bg-rose-100 text-rose-900'
                      : item.severity === 'medium'
                        ? 'bg-amber-100 text-amber-900'
                        : item.severity === 'low'
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-slate-100 text-slate-900'
                  }`}>
                    {item.severity === 'unscored' ? 'unscored' : `${item.severity} pressure`}
                  </span>
                  {item.rubricTotal !== null ? <Badge>{item.rubricTotal}/16 rubric</Badge> : null}
                  {item.criticalFailures ? <Badge>{item.criticalFailures} critical</Badge> : null}
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 text-sm text-slate-800">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-900">What this pressure means</div>
                <div className="mt-2">{item.latestPressure}</div>
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Recommended next build focus</div>
                <div className="mt-2">{item.nextBuildFocus}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-amber-950">Veranote product progress from encounter support</h3>
            <p className="mt-1 text-sm text-amber-900">
              This translates telehealth, psychotherapy-time, interactive-complexity, and crisis-note eval pressure into concrete product work instead of leaving it buried inside the full regression history.
            </p>
          </div>
          <div className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-900">
            Product pressure view
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {encounterSupportProductProgress.map((item) => (
            <div key={item.id} className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-amber-950">{item.productSurface}</div>
                  <div className="mt-1 text-xs text-amber-800">{item.title}</div>
                </div>
                <PressureBadge severity={item.severity} />
              </div>
              <div className="mt-4 text-sm text-slate-800">
                <span className="font-medium text-amber-950">Latest pressure:</span> {item.latestPressure}
              </div>
              <div className="mt-3 text-sm text-slate-800">
                <span className="font-medium text-amber-950">Next build focus:</span> {item.nextBuildFocus}
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
                <span>Rubric: {item.rubricTotal ?? 'Unscored'}</span>
                <span>Critical failures: {item.criticalFailures}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-sky-950">Veranote product progress from Phase 2 trust work</h3>
            <p className="mt-1 text-sm text-sky-900">
              This translates the visible trust improvements from Phase 2 into concrete product pressure. It is the closest read on whether the core note workflow is getting safer instead of merely getting more elaborate.
            </p>
          </div>
          <div className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-900">
            Product pressure view
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {phaseTwoTrustProductProgress.map((item) => (
            <div key={item.id} className="rounded-xl border border-sky-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-sky-950">{item.productSurface}</div>
                  <div className="mt-1 text-xs text-sky-800">{item.title}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    item.severity === 'high'
                      ? 'bg-rose-100 text-rose-900'
                      : item.severity === 'medium'
                        ? 'bg-amber-100 text-amber-900'
                        : item.severity === 'low'
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-slate-100 text-slate-900'
                  }`}>
                    {item.severity === 'unscored' ? 'unscored' : `${item.severity} pressure`}
                  </span>
                  {item.rubricTotal !== null ? <Badge>{item.rubricTotal}/16 rubric</Badge> : null}
                  {item.criticalFailures ? <Badge>{item.criticalFailures} critical</Badge> : null}
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-sky-100 bg-sky-50/40 p-3 text-sm text-slate-800">
                <div className="text-xs font-semibold uppercase tracking-wide text-sky-900">What this pressure means</div>
                <div className="mt-2">{item.latestPressure}</div>
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Recommended next build focus</div>
                <div className="mt-2">{item.nextBuildFocus}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-cyan-950">Veranote product progress from outpatient psych cases</h3>
            <p className="mt-1 text-sm text-cyan-900">
              This turns the outpatient readiness set into product pressure, so you can see which outpatient surfaces still need hardening instead of treating outpatient support as merely present because note types exist.
            </p>
          </div>
          <div className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-medium text-cyan-900">
            Outpatient product pressure
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {outpatientPsychProductProgress.map((item) => (
            <div key={item.id} className="rounded-xl border border-cyan-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-cyan-950">{item.productSurface}</div>
                  <div className="mt-1 text-xs text-cyan-800">{item.title}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    item.severity === 'high'
                      ? 'bg-rose-100 text-rose-900'
                      : item.severity === 'medium'
                        ? 'bg-amber-100 text-amber-900'
                        : item.severity === 'low'
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-slate-100 text-slate-900'
                  }`}>
                    {item.severity === 'unscored' ? 'unscored' : `${item.severity} pressure`}
                  </span>
                  {item.rubricTotal !== null ? <Badge>{item.rubricTotal}/16 rubric</Badge> : null}
                  {item.criticalFailures ? <Badge>{item.criticalFailures} critical</Badge> : null}
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-cyan-100 bg-cyan-50/40 p-3 text-sm text-slate-800">
                <div className="text-xs font-semibold uppercase tracking-wide text-cyan-900">What this pressure means</div>
                <div className="mt-2">{item.latestPressure}</div>
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Recommended next build focus</div>
                <div className="mt-2">{item.nextBuildFocus}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {!filteredResults.length ? (
        <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">No saved eval results yet</h3>
          <p className="mt-2 text-sm text-muted">Run a few cases, save scorecards, then this page turns into a real regression history instead of just a decorative promise.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredResults.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-lg font-semibold text-ink">{item.id} — {item.title}</div>
                  <div className="mt-1 text-sm text-muted">{item.specialty} • {item.noteType}</div>
                  <div className="mt-1 text-xs text-muted">Risk focus: {item.riskFocus}</div>
                  {item.scorecard.regressionRunLabel ? <div className="mt-1 text-xs text-muted">Run: {item.scorecard.regressionRunLabel}</div> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{item.scorecard.stoplight}</Badge>
                  <Badge>{item.scorecard.overallRating}</Badge>
                  <Badge>{getRubricTotal(item.scorecard)}/16 rubric</Badge>
                  {item.scorecard.reviewedAt ? <Badge>{new Date(item.scorecard.reviewedAt).toLocaleString()}</Badge> : null}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={() => handleReopenCase(item)} className="rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium">Reopen Case in New Note</button>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <Panel title="Failures found" content={item.scorecard.failuresFound || 'No failures saved.'} />
                <Panel title="Recommended fix" content={item.scorecard.recommendedFix || 'No recommended fix saved.'} />
                <Panel title="Reviewer notes" content={item.scorecard.notes || 'No notes saved.'} />
                <Panel title="Critical failures" content={item.scorecard.criticalFailures.length ? item.scorecard.criticalFailures.join('\n') : 'No critical failures marked.'} />
              </div>

              <div className="mt-4 rounded-lg bg-paper p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Rubric breakdown</div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {Object.entries(rubricCategoryLabels).map(([key, label]) => (
                    <div key={key} className="rounded-lg bg-white p-3 text-sm text-ink">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
                      <div className="mt-1 text-lg font-semibold">{item.scorecard.rubricScores[key as keyof typeof item.scorecard.rubricScores]}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <Panel title="Flags snapshot" content={item.scorecard.outputFlagsSnapshot || 'No flags snapshot saved.'} pre />
                <Panel title="Unsupported text example" content={item.scorecard.unsupportedTextExample || 'No unsupported-text example saved.'} pre />
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Output snapshot</div>
                <pre className="mt-2 max-h-[280px] overflow-auto whitespace-pre-wrap rounded-lg bg-paper p-4 text-sm text-ink">{item.scorecard.outputSnapshot || 'No output snapshot saved.'}</pre>
              </div>
            </div>
          ))}
        </div>
      )}

      {exportMessage ? <div className="text-sm text-muted">{exportMessage}</div> : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-white p-5 shadow-sm"><div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div><div className="mt-2 text-lg font-semibold text-ink whitespace-pre-wrap">{value}</div></div>;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-paper px-3 py-1 text-xs font-medium text-muted">{children}</span>;
}

function PressureBadge({ severity }: { severity: ProductPressureSeverity }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
      severity === 'high'
        ? 'bg-rose-100 text-rose-900'
        : severity === 'medium'
          ? 'bg-amber-100 text-amber-900'
          : severity === 'low'
            ? 'bg-emerald-100 text-emerald-900'
            : 'bg-slate-100 text-slate-900'
    }`}>
      {severity === 'unscored' ? 'unscored' : `${severity} pressure`}
    </span>
  );
}

function Panel({ title, content, pre = false }: { title: string; content: string; pre?: boolean }) {
  const Tag = pre ? 'pre' : 'p';
  return <div><div className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</div><Tag className="mt-2 whitespace-pre-wrap rounded-lg bg-paper p-4 text-sm text-ink">{content}</Tag></div>;
}
