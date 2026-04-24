import type { MonitoringSummary } from '@/lib/monitoring/dashboard-hooks';

export function ModelUsagePanel({ summary }: { summary: MonitoringSummary }) {
  const modelRows = Object.entries(summary.modelUsageByModel)
    .sort((left, right) => right[1] - left[1]);

  return (
    <section className="aurora-panel rounded-[28px] p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Model usage</div>
          <h2 className="mt-1 text-2xl font-semibold text-white">Backend model activity</h2>
        </div>
        <div className="text-sm text-cyan-50/72">Token totals render only when the API exposes them. This panel stays aggregate-only.</div>
      </div>

      <div className="mt-6 space-y-3">
        {modelRows.length ? (
          modelRows.map(([model, count]) => (
            <div
              key={model}
              className="flex flex-col gap-2 rounded-[22px] border border-cyan-200/10 bg-[rgba(8,22,36,0.78)] px-4 py-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="text-sm font-semibold text-white">{model}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.16em] text-cyan-100/68">Tracked backend model</div>
              </div>
              <div className="flex items-center gap-5 text-sm text-cyan-50/80">
                <div>
                  <span className="font-semibold text-white">{count}</span> usage event{count === 1 ? '' : 's'}
                </div>
                <div className="text-cyan-100/58">Tokens: not exposed</div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[22px] border border-cyan-200/10 bg-[rgba(8,22,36,0.78)] px-4 py-4 text-sm text-cyan-50/72">
            No model usage metrics recorded yet.
          </div>
        )}
      </div>
    </section>
  );
}
