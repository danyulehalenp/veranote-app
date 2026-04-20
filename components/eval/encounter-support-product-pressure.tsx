'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { encounterSupportEvalCases } from '@/lib/eval/encounter-support-cases';
import { getRubricTotal, loadEvalResults, type EvalResultRecord } from '@/lib/eval/results-history';

type PressureSeverity = 'high' | 'medium' | 'low' | 'unscored';

export function EncounterSupportProductPressure() {
  const [results, setResults] = useState<EvalResultRecord[]>([]);

  useEffect(() => {
    setResults(loadEvalResults());
  }, []);

  const encounterPressure = useMemo(() => {
    return encounterSupportEvalCases
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
            ? result.scorecard.failuresFound || result.scorecard.recommendedFix || 'Scored, but no explicit encounter-support pressure note saved yet.'
            : 'No saved scorecard yet for this encounter-support workflow.',
        };
      })
      .sort((a, b) => {
        const rank: Record<PressureSeverity, number> = { high: 0, medium: 1, unscored: 2, low: 3 };
        return rank[a.severity] - rank[b.severity];
      });
  }, [results]);

  const coverage = encounterPressure.filter((item) => item.result).length;
  const topPressure = encounterPressure[0] || null;

  return (
    <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-amber-950">Encounter Support Pressure</h2>
          <p className="mt-2 text-sm text-amber-900">
            This keeps telehealth facts, psychotherapy minutes, interactive complexity, and crisis-note structure visible on the homepage so the new encounter-support layer does not quietly drift into fake coding confidence.
          </p>
        </div>
        <div className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-900">
          Encounter support set
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <SummaryStat label="Workflows scored" value={`${coverage} / ${encounterSupportEvalCases.length}`} />
        <SummaryStat
          label="Top pressure"
          value={topPressure ? (topPressure.workflow.productSurface || topPressure.workflow.title) : 'None yet'}
        />
        <SummaryStat
          label="Immediate read"
          value={topPressure ? (topPressure.severity === 'unscored' ? 'Needs eval coverage' : `${topPressure.severity} pressure`) : 'No encounter-support data'}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {encounterPressure.map(({ workflow, result, severity, rubricTotal, pressureNote }) => (
          <div key={workflow.id} className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-sm font-semibold text-amber-950">{workflow.productSurface || workflow.title}</div>
                <div className="mt-1 text-xs text-amber-800">{workflow.title}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <SeverityBadge severity={severity} />
                {rubricTotal !== null ? <span className="rounded-full bg-paper px-3 py-1 text-xs font-medium text-muted">{rubricTotal}/16 rubric</span> : null}
              </div>
            </div>

            <div className="mt-4 text-sm text-slate-800">
              <span className="font-medium text-amber-950">Next build focus:</span> {workflow.nextBuildFocus || 'No next build focus recorded yet.'}
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Latest pressure</div>
              <div className="mt-2">{pressureNote}</div>
            </div>
            {result?.scorecard.reviewedAt ? (
              <div className="mt-3 text-xs text-muted">Last scored {new Date(result.scorecard.reviewedAt).toLocaleString()}</div>
            ) : (
              <div className="mt-3 text-xs text-muted">Run this in Eval to turn encounter support into measurable product pressure.</div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/dashboard/eval-results" className="rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white">
          Open Eval Results
        </Link>
        <Link href="/dashboard/eval" className="rounded-lg border border-amber-200 bg-white px-4 py-3 text-sm font-medium text-amber-950">
          Run Encounter Eval
        </Link>
      </div>
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">{label}</div>
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
