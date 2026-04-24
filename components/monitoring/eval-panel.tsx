import type { EvalMetricsResponse } from '@/lib/monitoring/dashboard-hooks';

function getEvalTone(passRate: number) {
  if (passRate > 0.9) {
    return {
      ring: 'border-emerald-200/18 bg-emerald-500/10',
      text: 'text-emerald-100',
      label: 'Healthy',
    };
  }
  if (passRate >= 0.7) {
    return {
      ring: 'border-amber-200/18 bg-amber-500/10',
      text: 'text-amber-100',
      label: 'Watch',
    };
  }
  return {
    ring: 'border-rose-200/18 bg-rose-500/10',
    text: 'text-rose-100',
    label: 'At risk',
  };
}

export function EvalPanel({ evals }: { evals: EvalMetricsResponse }) {
  const latest = evals.latest;
  const total = latest ? latest.passed + latest.failed : 0;
  const passRate = total ? latest!.passed / total : 0;
  const tone = getEvalTone(passRate);

  return (
    <section className="aurora-panel rounded-[28px] p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Eval health</div>
          <h2 className="mt-1 text-2xl font-semibold text-white">Latest regression snapshot</h2>
        </div>
        {latest ? (
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${tone.ring} ${tone.text}`}>
            {tone.label}
          </span>
        ) : null}
      </div>

      {latest ? (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-[22px] border border-cyan-200/10 bg-[rgba(8,22,36,0.78)] px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">Passed</div>
              <div className="mt-2 text-3xl font-semibold text-emerald-200">{latest.passed}</div>
            </div>
            <div className="rounded-[22px] border border-cyan-200/10 bg-[rgba(8,22,36,0.78)] px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">Failed</div>
              <div className="mt-2 text-3xl font-semibold text-rose-200">{latest.failed}</div>
            </div>
            <div className="rounded-[22px] border border-cyan-200/10 bg-[rgba(8,22,36,0.78)] px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">Pass rate</div>
              <div className={`mt-2 text-3xl font-semibold ${tone.text}`}>{Math.round(passRate * 100)}%</div>
            </div>
          </div>
          <div className="mt-4 text-sm text-cyan-50/74">
            Latest eval run: {new Date(latest.timestamp).toLocaleString()}
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-[22px] border border-cyan-200/10 bg-[rgba(8,22,36,0.78)] px-4 py-4 text-sm text-cyan-50/72">
          No eval history available yet.
        </div>
      )}
    </section>
  );
}
