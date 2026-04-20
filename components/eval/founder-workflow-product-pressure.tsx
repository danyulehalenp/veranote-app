'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { founderWorkflowEvalCases } from '@/lib/eval/founder-workflow-cases';
import { getRubricTotal, loadEvalResults, type EvalResultRecord } from '@/lib/eval/results-history';
import { VERANOTE_BUILD_TASKS_KEY } from '@/lib/constants/storage';
import type { VeranoteBuildTask, VeranoteBuildTaskStatus, VeranoteTaskProvenance } from '@/types/task';

type PressureSeverity = 'high' | 'medium' | 'low' | 'unscored';

export function FounderWorkflowProductPressure() {
  const [results, setResults] = useState<EvalResultRecord[]>([]);
  const [tasks, setTasks] = useState<VeranoteBuildTask[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function hydrate() {
      setResults(loadEvalResults());

      let persistedTasks: VeranoteBuildTask[] = [];

      try {
        const response = await fetch('/api/build-tasks', { cache: 'no-store' });
        const data = await response.json() as { tasks?: VeranoteBuildTask[] };
        persistedTasks = Array.isArray(data?.tasks) ? data.tasks : [];
      } catch {
        persistedTasks = [];
      }

      if (persistedTasks.length) {
        setTasks(persistedTasks);
        window.localStorage.setItem(VERANOTE_BUILD_TASKS_KEY, JSON.stringify(persistedTasks));
        return;
      }

      const rawTasks = window.localStorage.getItem(VERANOTE_BUILD_TASKS_KEY);
      if (!rawTasks) {
        return;
      }

      try {
        const parsed = JSON.parse(rawTasks) as VeranoteBuildTask[];
        const nextTasks = Array.isArray(parsed) ? parsed : [];
        setTasks(nextTasks);

        if (nextTasks.length) {
          await fetch('/api/build-tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks: nextTasks }),
          });
        }
      } catch {
        window.localStorage.removeItem(VERANOTE_BUILD_TASKS_KEY);
      }
    }

    void hydrate();
  }, []);

  const workflowPressure = useMemo(() => {
    return founderWorkflowEvalCases
      .map((workflow) => {
        const result = results.find((item) => item.id === workflow.id) || null;
        const severity: PressureSeverity = result
          ? result.scorecard.stoplight === 'Red' || result.scorecard.overallRating === 'Fail'
            ? 'high'
            : result.scorecard.stoplight === 'Yellow' || result.scorecard.overallRating === 'Needs revision'
              ? 'medium'
              : 'low'
          : 'unscored';

        return {
          workflow,
          result,
          severity,
          rubricTotal: result ? getRubricTotal(result.scorecard) : null,
          pressureNote: result
            ? result.scorecard.failuresFound || result.scorecard.recommendedFix || 'Scored, but no explicit pressure note saved yet.'
            : 'No saved scorecard yet for this founder workflow.',
        };
      })
      .sort((a, b) => {
        const rank: Record<PressureSeverity, number> = { high: 0, medium: 1, unscored: 2, low: 3 };
        return rank[a.severity] - rank[b.severity];
      });
  }, [results]);

  const coverage = workflowPressure.filter((item) => item.result).length;
  const topPressure = workflowPressure[0] || null;
  const orderedTasks = useMemo(
    () => [...tasks].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [tasks],
  );

  async function persistTasks(nextTasks: VeranoteBuildTask[]) {
    setTasks(nextTasks);
    window.localStorage.setItem(VERANOTE_BUILD_TASKS_KEY, JSON.stringify(nextTasks));
    try {
      await fetch('/api/build-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: nextTasks }),
      });
    } catch {
      // Keep local persistence as fallback if the prototype backend write fails.
    }
  }

  function flash(value: string) {
    setMessage(value);
    window.setTimeout(() => setMessage(''), 2200);
  }

  function promoteWorkflowToTask(params: {
    workflowId: string;
    workflowTitle: string;
    productSurface: string;
    severity: PressureSeverity;
    focus: string;
    pressureNote: string;
    provenance: VeranoteTaskProvenance;
  }) {
    const now = new Date().toISOString();
    const existing = tasks.find((task) => task.workflowId === params.workflowId);

    if (existing) {
      const nextTasks = tasks.map((task) => (
        task.workflowId === params.workflowId
          ? {
              ...task,
              severity: params.severity,
              focus: params.focus,
              pressureNote: params.pressureNote,
              provenance: params.provenance,
              updatedAt: now,
            }
          : task
      ));
      void persistTasks(nextTasks);
      flash('Updated the existing Veranote build task for this founder workflow.');
      return;
    }

    const nextTask: VeranoteBuildTask = {
      id: `veranote-task-${params.workflowId}`,
      workflowId: params.workflowId,
      workflowTitle: params.workflowTitle,
      productSurface: params.productSurface,
      severity: params.severity,
      focus: params.focus,
      pressureNote: params.pressureNote,
      status: 'proposed',
      createdAt: now,
      updatedAt: now,
      provenance: params.provenance,
    };

    void persistTasks([nextTask, ...tasks]);
    flash('Promoted founder workflow pressure into a Veranote build task.');
  }

  function updateTaskStatus(taskId: string, status: VeranoteBuildTaskStatus) {
    const nextTasks = tasks.map((task) => (
      task.id === taskId
        ? { ...task, status, updatedAt: new Date().toISOString() }
        : task
    ));
    void persistTasks(nextTasks);
  }

  function removeTask(taskId: string) {
    const nextTasks = tasks.filter((task) => task.id !== taskId);
    void persistTasks(nextTasks);
  }

  return (
    <section className="mt-8 rounded-xl border border-violet-200 bg-violet-50 p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-violet-950">Founder Workflow Product Pressure</h2>
          <p className="mt-2 text-sm text-violet-900">
            This reads your local founder-workflow eval history and turns it into a compact product-pressure view. It is meant to keep the psych-first core honest while we keep building.
          </p>
        </div>
        <div className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-medium text-violet-900">
          Founder dataset only
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <SummaryStat label="Workflows scored" value={`${coverage} / ${founderWorkflowEvalCases.length}`} />
        <SummaryStat
          label="Top pressure"
          value={topPressure ? (topPressure.workflow.productSurface || topPressure.workflow.title) : 'None yet'}
        />
        <SummaryStat
          label="Immediate read"
          value={topPressure ? (topPressure.severity === 'unscored' ? 'Needs eval coverage' : `${topPressure.severity} pressure`) : 'No founder workflow data'}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {workflowPressure.map(({ workflow, result, severity, rubricTotal, pressureNote }) => (
          <div key={workflow.id} className="rounded-xl border border-violet-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-semibold text-violet-950">{workflow.productSurface || workflow.title}</div>
                <div className="mt-1 text-xs text-violet-800">{workflow.title}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <SeverityBadge severity={severity} />
                {rubricTotal !== null ? <span className="rounded-full bg-paper px-3 py-1 text-xs font-medium text-muted">{rubricTotal}/16 rubric</span> : null}
              </div>
            </div>

            <div className="mt-4 text-sm text-slate-800">
              <span className="font-medium text-violet-950">Next build focus:</span> {workflow.nextBuildFocus || 'No next build focus recorded yet.'}
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Latest pressure</div>
              <div className="mt-2">{pressureNote}</div>
            </div>
            {result?.scorecard.reviewedAt ? (
              <div className="mt-3 text-xs text-muted">Last scored {new Date(result.scorecard.reviewedAt).toLocaleString()}</div>
            ) : (
              <div className="mt-3 text-xs text-muted">Run this in Eval to turn founder fit into measurable pressure.</div>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => promoteWorkflowToTask({
                  workflowId: workflow.id,
                  workflowTitle: workflow.title,
                  productSurface: workflow.productSurface || workflow.title,
                  severity,
                  focus: workflow.nextBuildFocus || 'Translate this founder workflow pressure into a concrete Veranote improvement.',
                  pressureNote,
                  provenance: {
                    sourceType: 'founder_workflow_eval',
                    evalCaseId: workflow.id,
                    evalCaseTitle: workflow.title,
                    reviewedAt: result?.scorecard.reviewedAt || null,
                    stoplight: result?.scorecard.stoplight || null,
                    overallRating: result?.scorecard.overallRating || null,
                    rubricTotal,
                    regressionRunLabel: result?.scorecard.regressionRunLabel || '',
                    sourcePressure: pressureNote,
                  },
                })}
                className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-950"
              >
                Promote to task
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-violet-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-violet-950">Veranote build task queue</h3>
            <p className="mt-1 text-sm text-violet-900">
              Lightweight product-task queue built from founder workflow pressure. It stays anchored in Veranote, but now persists beyond the browser so roadmap pressure does not disappear between sessions.
            </p>
          </div>
          <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-900">
            Persisted + shared
          </div>
        </div>

        {!orderedTasks.length ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-muted">
            No promoted Veranote build tasks yet. Promote a founder workflow pressure item when you want to turn it into a tracked product follow-up.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {orderedTasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-violet-950">{task.productSurface}</div>
                    <div className="mt-1 text-xs text-violet-800">{task.workflowTitle}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SeverityBadge severity={task.severity} />
                    <TaskStatusBadge status={task.status} />
                  </div>
                </div>
                <div className="mt-3 text-sm text-slate-800">
                  <span className="font-medium text-violet-950">Focus:</span> {task.focus}
                </div>
                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Pressure note</div>
                  <div className="mt-2">{task.pressureNote}</div>
                </div>
                {task.provenance ? (
                  <div className="mt-3 rounded-lg border border-violet-200 bg-white p-3 text-sm text-slate-800">
                    <div className="text-xs font-semibold uppercase tracking-wide text-violet-800">Task provenance</div>
                    <div className="mt-2">
                      Created from <span className="font-medium text-violet-950">{task.provenance.evalCaseTitle}</span>
                      {task.provenance.overallRating ? ` • ${task.provenance.overallRating}` : ''}
                      {task.provenance.stoplight ? ` • ${task.provenance.stoplight}` : ''}
                      {typeof task.provenance.rubricTotal === 'number' ? ` • ${task.provenance.rubricTotal}/16 rubric` : ''}
                    </div>
                    <div className="mt-2 text-xs text-muted">
                      {task.provenance.reviewedAt
                        ? `Scored ${new Date(task.provenance.reviewedAt).toLocaleString()}`
                        : 'Promoted before this workflow had a saved scorecard.'}
                      {task.provenance.regressionRunLabel ? ` • ${task.provenance.regressionRunLabel}` : ''}
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 text-xs text-muted">
                  Created {new Date(task.createdAt).toLocaleString()} • Updated {new Date(task.updatedAt).toLocaleString()}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => updateTaskStatus(task.id, 'proposed')} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-medium text-violet-950">Mark proposed</button>
                  <button onClick={() => updateTaskStatus(task.id, 'active')} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-medium text-violet-950">Mark active</button>
                  <button onClick={() => updateTaskStatus(task.id, 'done')} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-medium text-violet-950">Mark done</button>
                  <button onClick={() => removeTask(task.id)} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-900">Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/dashboard/eval-results" className="rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white">
          Open Eval Results
        </Link>
        <Link href="/dashboard/eval" className="rounded-lg border border-violet-200 bg-white px-4 py-3 text-sm font-medium text-violet-950">
          Run Founder Workflow Eval
        </Link>
      </div>
      {message ? <div className="mt-3 text-sm text-muted">{message}</div> : null}
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-violet-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-violet-800">{label}</div>
      <div className="mt-2 text-lg font-semibold text-ink">{value}</div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: PressureSeverity }) {
  const styles: Record<PressureSeverity, string> = {
    high: 'bg-rose-100 text-rose-900',
    medium: 'bg-amber-100 text-amber-900',
    low: 'bg-emerald-100 text-emerald-900',
    unscored: 'bg-slate-100 text-slate-900',
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles[severity]}`}>
      {severity === 'unscored' ? 'unscored' : `${severity} pressure`}
    </span>
  );
}

function TaskStatusBadge({ status }: { status: VeranoteBuildTaskStatus }) {
  const styles: Record<VeranoteBuildTaskStatus, string> = {
    proposed: 'bg-slate-100 text-slate-900',
    active: 'bg-sky-100 text-sky-900',
    done: 'bg-emerald-100 text-emerald-900',
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}
