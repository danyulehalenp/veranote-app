import type { MonitoringSummary } from '@/lib/monitoring/dashboard-hooks';

function RequestBar({
  label,
  value,
  maxValue,
}: {
  label: string;
  value: number;
  maxValue: number;
}) {
  const width = maxValue > 0 ? Math.max((value / maxValue) * 100, 8) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm text-cyan-50/84">
        <span className="truncate font-medium text-white">{label}</span>
        <span className="shrink-0 text-cyan-100/76">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-[rgba(9,25,42,0.84)]">
        <div
          className="h-2 rounded-full bg-[linear-gradient(90deg,rgba(18,181,208,0.88),rgba(103,232,249,0.88))]"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export function RequestChart({ summary }: { summary: MonitoringSummary }) {
  const requestEntries = Object.entries(summary.requestsByModel);
  const maxRequestValue = Math.max(...requestEntries.map(([, value]) => value), 0);

  return (
    <section className="aurora-panel rounded-[28px] p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Request traffic</div>
          <h2 className="mt-1 text-2xl font-semibold text-white">Requests per model</h2>
        </div>
        <div className="flex gap-3 text-xs text-cyan-50/76">
          <span className="rounded-full border border-emerald-200/15 bg-emerald-500/10 px-3 py-1">
            Success: {summary.successCount}
          </span>
          <span className="rounded-full border border-rose-200/15 bg-rose-500/10 px-3 py-1">
            Failure: {summary.failureCount}
          </span>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {requestEntries.length ? (
          requestEntries.map(([model, count]) => (
            <RequestBar key={model} label={model} value={count} maxValue={maxRequestValue} />
          ))
        ) : (
          <div className="rounded-[22px] border border-cyan-200/10 bg-[rgba(8,22,36,0.78)] px-4 py-4 text-sm text-cyan-50/72">
            No request metrics recorded yet.
          </div>
        )}
      </div>
    </section>
  );
}
