'use client';

import { useRouter } from 'next/navigation';
import { EVAL_CASE_KEY } from '@/lib/constants/storage';
import type { EvalCaseSelection } from '@/types/eval';

type Props = {
  title: string;
  specialty: string;
  noteType: string;
  summary: string;
  sourceInput?: string;
  founderWorkflow?: boolean;
  careSetting?: 'Inpatient' | 'Outpatient' | 'Telehealth' | 'Mixed';
  outpatientReady?: boolean;
  betaSupported?: boolean;
};

export function ExampleCard({ title, specialty, noteType, summary, sourceInput, founderWorkflow, careSetting, outpatientReady, betaSupported }: Props) {
  const router = useRouter();

  function handleLoadExample() {
    const payload: EvalCaseSelection = {
      id: `example-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      specialty,
      noteType,
      title,
      sourceInput: sourceInput || summary,
    };

    localStorage.setItem(EVAL_CASE_KEY, JSON.stringify(payload));
    router.push('/dashboard/new-note');
  }

  function handleUseInEval() {
    const payload: EvalCaseSelection = {
      id: `example-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      specialty,
      noteType,
      title,
      sourceInput: sourceInput || summary,
    };

    localStorage.setItem(EVAL_CASE_KEY, JSON.stringify(payload));
    router.push('/dashboard/eval');
  }

  return (
    <article className="aurora-panel rounded-[24px] p-5">
      <div className="flex items-center gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-accent">{specialty}</div>
        {careSetting ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-900">
            {careSetting}
          </span>
        ) : null}
        {founderWorkflow ? (
          <span className="rounded-full border border-violet-200 bg-violet-100 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-violet-900">
            Founder workflow
          </span>
        ) : null}
        {outpatientReady ? (
          <span className="rounded-full border border-cyan-200 bg-cyan-100 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-cyan-900">
            Outpatient-ready
          </span>
        ) : null}
        {betaSupported ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-900">
            Beta-supported
          </span>
        ) : null}
      </div>
      <h3 className="mt-2 text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{noteType}</p>
      <p className="mt-4 text-sm text-ink">{summary}</p>
      <div className="mt-4 flex gap-2">
        <button onClick={handleLoadExample} className="aurora-primary-button rounded-xl px-4 py-2 text-sm font-medium">Load Example</button>
        <button onClick={handleUseInEval} className="aurora-secondary-button rounded-xl px-4 py-2 text-sm">Use in Eval</button>
      </div>
    </article>
  );
}
