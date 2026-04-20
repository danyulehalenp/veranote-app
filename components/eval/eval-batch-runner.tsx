'use client';

import { useEffect, useMemo, useState } from 'react';
import { fidelityCases } from '@/lib/eval/fidelity-cases';
import { founderWorkflowEvalCases } from '@/lib/eval/founder-workflow-cases';
import { encounterSupportEvalCases } from '@/lib/eval/encounter-support-cases';
import { outpatientPsychEvalCases } from '@/lib/eval/outpatient-psych-cases';
import { phaseTwoTrustEvalCases } from '@/lib/eval/phase-two-trust-cases';
import { EVAL_BATCH_STATE_KEY, EVAL_CASE_KEY, EVAL_SCORECARD_KEY } from '@/lib/constants/storage';
import type { EvalCaseSelection } from '@/types/eval';

type BatchState = {
  selectedSpecialty: string;
  selectedCaseSet:
    | 'All cases'
    | 'Serious regression round 1'
    | 'Task #1 high-risk additions'
    | 'Founder workflow set'
    | 'Outpatient psych readiness set'
    | 'Encounter support set'
    | 'Phase 2 trust set';
  currentIndex: number;
  completedCaseIds: string[];
};

const defaultBatchState: BatchState = {
  selectedSpecialty: 'All specialties',
  selectedCaseSet: 'All cases',
  currentIndex: 0,
  completedCaseIds: [],
};

export function EvalBatchRunner() {
  const [batchState, setBatchState] = useState<BatchState>(defaultBatchState);
  const allEvalCases = useMemo(
    () => [...fidelityCases, ...founderWorkflowEvalCases, ...outpatientPsychEvalCases, ...encounterSupportEvalCases, ...phaseTwoTrustEvalCases],
    [],
  );

  useEffect(() => {
    const raw = localStorage.getItem(EVAL_BATCH_STATE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as BatchState;
      setBatchState({ ...defaultBatchState, ...parsed, completedCaseIds: Array.isArray(parsed.completedCaseIds) ? parsed.completedCaseIds : [] });
    } catch {
      localStorage.removeItem(EVAL_BATCH_STATE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(EVAL_BATCH_STATE_KEY, JSON.stringify(batchState));
  }, [batchState]);

  const specialtyOptions = useMemo(() => {
    const values = Array.from(new Set(allEvalCases.map((item) => item.specialty))).filter(Boolean);
    return ['All specialties', ...values];
  }, [allEvalCases]);

  const caseSetOptions: BatchState['selectedCaseSet'][] = [
    'All cases',
    'Serious regression round 1',
    'Task #1 high-risk additions',
    'Founder workflow set',
    'Outpatient psych readiness set',
    'Encounter support set',
    'Phase 2 trust set',
  ];

  const seriousRegressionRoundIds = useMemo(
    () => allEvalCases.filter((item) => item.regressionPriority === 'round-1').map((item) => item.id),
    [allEvalCases],
  );

  const task1HighRiskIds = useMemo(
    () => allEvalCases.filter((item) => item.regressionPriority === 'task-1-high-risk').map((item) => item.id),
    [allEvalCases],
  );

  const founderWorkflowIds = useMemo(
    () => founderWorkflowEvalCases.map((item) => item.id),
    [],
  );

  const outpatientPsychIds = useMemo(
    () => outpatientPsychEvalCases.map((item) => item.id),
    [],
  );

  const encounterSupportIds = useMemo(
    () => encounterSupportEvalCases.map((item) => item.id),
    [],
  );

  const phaseTwoTrustIds = useMemo(
    () => phaseTwoTrustEvalCases.map((item) => item.id),
    [],
  );

  const filteredCases = useMemo(() => {
    const byCaseSet = batchState.selectedCaseSet === 'Serious regression round 1'
      ? allEvalCases.filter((item) => item.regressionPriority === 'round-1')
      : batchState.selectedCaseSet === 'Task #1 high-risk additions'
        ? allEvalCases.filter((item) => item.regressionPriority === 'task-1-high-risk')
        : batchState.selectedCaseSet === 'Founder workflow set'
          ? founderWorkflowEvalCases
          : batchState.selectedCaseSet === 'Outpatient psych readiness set'
            ? outpatientPsychEvalCases
            : batchState.selectedCaseSet === 'Encounter support set'
              ? encounterSupportEvalCases
              : batchState.selectedCaseSet === 'Phase 2 trust set'
                ? phaseTwoTrustEvalCases
          : allEvalCases;

    if (batchState.selectedSpecialty === 'All specialties') {
      return byCaseSet;
    }

    return byCaseSet.filter((item) => item.specialty === batchState.selectedSpecialty);
  }, [allEvalCases, batchState.selectedCaseSet, batchState.selectedSpecialty]);

  const currentIndex = Math.min(batchState.currentIndex, Math.max(filteredCases.length - 1, 0));
  const currentCase = filteredCases[currentIndex] ?? null;
  const completedCount = filteredCases.filter((item) => batchState.completedCaseIds.includes(item.id)).length;

  function updateBatchState(patch: Partial<BatchState>) {
    setBatchState((current) => ({ ...current, ...patch }));
  }

  function handleSetSpecialty(value: string) {
    updateBatchState({ selectedSpecialty: value, currentIndex: 0 });
  }

  function handleSetCaseSet(value: BatchState['selectedCaseSet']) {
    updateBatchState({ selectedCaseSet: value, currentIndex: 0 });
  }

  function queueCaseForNewNote() {
    if (!currentCase) {
      return;
    }

    const payload: EvalCaseSelection = {
      id: currentCase.id,
      specialty: currentCase.specialty,
      noteType: currentCase.noteType,
      title: currentCase.title,
      sourceInput: currentCase.sourceInput,
    };

    localStorage.setItem(EVAL_CASE_KEY, JSON.stringify(payload));
    window.location.href = '/dashboard/new-note';
  }

  function handleMarkCompleteAndAdvance() {
    if (!currentCase) {
      return;
    }

    const hasScorecard = localStorage.getItem(`${EVAL_SCORECARD_KEY}:${currentCase.id}`);
    const completedCaseIds = batchState.completedCaseIds.includes(currentCase.id)
      ? batchState.completedCaseIds
      : [...batchState.completedCaseIds, currentCase.id];

    const nextIndex = Math.min(currentIndex + 1, Math.max(filteredCases.length - 1, 0));

    updateBatchState({
      completedCaseIds,
      currentIndex: hasScorecard ? nextIndex : batchState.currentIndex,
    });
  }

  function handleResetBatchProgress() {
    updateBatchState({ completedCaseIds: [], currentIndex: 0 });
  }

  return (
    <div className="rounded-xl border border-border bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Batch runner</h2>
          <p className="mt-1 text-sm text-muted">Step through the case set in order, queue one case at a time into New Note, then review and score it like a civilized semi-automated workflow.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-ink">
            <span>Regression subset</span>
            <select value={batchState.selectedCaseSet} onChange={(event) => handleSetCaseSet(event.target.value as BatchState['selectedCaseSet'])} className="rounded-lg border border-border bg-white p-3">
              {caseSetOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-ink">
            <span>Specialty filter</span>
            <select value={batchState.selectedSpecialty} onChange={(event) => handleSetSpecialty(event.target.value)} className="rounded-lg border border-border bg-white p-3">
              {specialtyOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg bg-paper p-4 text-sm text-ink">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Progress</div>
          <div className="mt-2 text-lg font-semibold">{completedCount} / {filteredCases.length}</div>
        </div>
        <div className="rounded-lg bg-paper p-4 text-sm text-ink">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Current position</div>
          <div className="mt-2 text-lg font-semibold">Case {filteredCases.length ? currentIndex + 1 : 0} of {filteredCases.length}</div>
        </div>
        <div className="rounded-lg bg-paper p-4 text-sm text-ink">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Completed IDs</div>
          <div className="mt-2 text-sm">{batchState.completedCaseIds.length ? batchState.completedCaseIds.join(', ') : 'None yet'}</div>
        </div>
      </div>

      {!currentCase ? (
        <div className="mt-5 rounded-lg bg-paper p-4 text-sm text-muted">No cases available for this filter.</div>
      ) : (
        <>
          <div className="mt-5 rounded-xl border border-border bg-paper p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Current batch case</div>
                <div className="mt-2 text-lg font-semibold text-ink">{currentCase.id} — {currentCase.title}</div>
                <div className="mt-1 text-sm text-muted">{currentCase.specialty} • {currentCase.noteType} • Case {currentIndex + 1} of {filteredCases.length}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {currentCase.regressionPriority === 'round-1' ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">Serious round 1</span> : null}
                {currentCase.regressionPriority === 'task-1-high-risk' ? <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-900">Task #1 high-risk</span> : null}
                {currentCase.id.startsWith('fw-') ? <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-900">Founder workflow</span> : null}
                {outpatientPsychIds.includes(currentCase.id) ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900">Outpatient psych</span> : null}
                {encounterSupportIds.includes(currentCase.id) ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">Encounter support</span> : null}
                {phaseTwoTrustIds.includes(currentCase.id) ? <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-900">Phase 2 trust</span> : null}
                {batchState.completedCaseIds.includes(currentCase.id) ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900">Marked complete</span> : null}
              </div>
            </div>
            <pre className="mt-4 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-lg bg-white p-4 text-sm text-ink">{currentCase.sourceInput}</pre>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={() => updateBatchState({ currentIndex: Math.max(0, currentIndex - 1) })} disabled={currentIndex === 0} className="rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium disabled:opacity-60">
              Previous Case
            </button>
            <button onClick={queueCaseForNewNote} className="rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white">
              Queue Case into New Note
            </button>
            <button onClick={handleMarkCompleteAndAdvance} className="rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium">
              Mark Complete + Advance
            </button>
            <button onClick={() => updateBatchState({ currentIndex: Math.min(filteredCases.length - 1, currentIndex + 1) })} disabled={currentIndex >= filteredCases.length - 1} className="rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium disabled:opacity-60">
              Next Case
            </button>
            <button onClick={handleResetBatchProgress} className="rounded-lg border border-border bg-white px-4 py-3 text-sm font-medium">
              Reset Batch Progress
            </button>
          </div>

          {batchState.selectedCaseSet === 'Phase 2 trust set' ? (
            <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm font-semibold">Phase 2 closeout checklist</div>
                  <p className="mt-1 text-sky-900">
                    This is the last honest Phase 2 pass: use the dedicated trust cases, capture the generated output, apply provisional triage if helpful, then save reviewer-confirmed scorecards.
                  </p>
                </div>
                <div className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-medium text-sky-900">
                  Cases 39-42
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-sky-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-800">Case sequence</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sky-950">
                    <li><span className="font-medium">39</span>: objective conflict truth</li>
                    <li><span className="font-medium">40</span>: medication truth and regimen gaps</li>
                    <li><span className="font-medium">41</span>: diagnosis caution and differential preservation</li>
                    <li><span className="font-medium">42</span>: passive-versus-acute risk wording</li>
                  </ul>
                </div>
                <div className="rounded-lg border border-sky-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-sky-800">How to close the set</div>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sky-950">
                    <li>Queue the case into `New Note` and generate the draft.</li>
                    <li>Review/edit if needed, then capture the latest output in `Eval`.</li>
                    <li>Use the provisional Phase 2 closeout helper if you want a fast triage starting point.</li>
                    <li>Save the final scorecard and mark the case complete.</li>
                    <li>Repeat until `39-42` are all scored, then inspect `Eval Results`.</li>
                  </ol>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Batch flow: queue case → generate note → review/edit if needed → capture output in Eval → save scorecard → mark complete and auto-advance. Semi-automated on purpose, because fake certainty is how bad tools get promoted.
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-white p-4 text-sm text-ink">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">Serious regression round 1</div>
              <div className="mt-2 text-sm text-muted">Use this subset first after meaningful prompt or review-workflow changes. It intentionally leans into the cases most likely to look polished while quietly being wrong.</div>
              <div className="mt-3 text-sm font-medium">Recommended IDs: {seriousRegressionRoundIds.join(', ')}</div>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
              <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">Task #1 high-risk additions</div>
              <div className="mt-2 text-sm">Use this focused subset when a change touches source conflict, self-harm/safety wording, psychosis denial handling, or medication/source reconciliation. Small on purpose, nasty on purpose.</div>
              <div className="mt-3 text-sm font-medium">Recommended IDs: {task1HighRiskIds.join(', ')}</div>
            </div>
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
              <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">Founder workflow set</div>
              <div className="mt-2 text-sm text-violet-900">Use this to regression-test the four strongest founder workflow families directly inside Eval before they get generalized into broader provider behavior.</div>
              <div className="mt-3 text-sm font-medium">Recommended IDs: {founderWorkflowIds.join(', ')}</div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Outpatient psych readiness set</div>
              <div className="mt-2 text-sm text-emerald-900">Use this to test whether the newer outpatient note shapes preserve chronic-risk nuance, diagnostic uncertainty, and med-management literalism instead of falling back into inpatient-style shortcuts.</div>
              <div className="mt-3 text-sm font-medium">Recommended IDs: {outpatientPsychIds.join(', ')}</div>
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">Phase 2 trust set</div>
              <div className="mt-2 text-sm text-sky-900">Use this after prompt, review, or source-support changes that touch objective conflict, medication truth, diagnosis overstatement, or passive-versus-acute risk wording. Small, visible, and directly tied to the Phase 2 trust work.</div>
              <div className="mt-3 text-sm font-medium">Recommended IDs: {phaseTwoTrustIds.join(', ')}</div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Encounter support set</div>
              <div className="mt-2 text-sm text-amber-900">Use this after changes to telehealth fields, psychotherapy minutes, interactive complexity, or crisis-note structure. It is meant to catch the fake-coding-engine failure mode before it spreads.</div>
              <div className="mt-3 text-sm font-medium">Recommended IDs: {encounterSupportIds.join(', ')}</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
