import type { MonitoringSummary } from '@/lib/monitoring/dashboard-hooks';

function SummaryMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'success' | 'danger';
}) {
  const toneClassName = tone === 'success'
    ? 'text-emerald-200'
    : tone === 'danger'
      ? 'text-rose-200'
      : 'text-white';

  return (
    <div className="rounded-[22px] border border-cyan-200/10 bg-[rgba(8,22,36,0.78)] px-4 py-4 shadow-[0_12px_28px_rgba(4,12,24,0.2)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tracking-[-0.03em] ${toneClassName}`}>{value}</div>
    </div>
  );
}

export function SummaryPanel({ summary }: { summary: MonitoringSummary }) {
  return (
    <section className="aurora-panel rounded-[28px] p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Monitoring summary</div>
          <h2 className="mt-1 text-2xl font-semibold text-white">Live system health at a glance</h2>
        </div>
        <div className="text-sm text-cyan-50/74">
          Aggregated counts only. No note text, prompt text, or raw patient details are shown here.
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Total requests" value={summary.requestCount} />
        <SummaryMetric label="Successes" value={summary.successCount} tone="success" />
        <SummaryMetric label="Failures" value={summary.failureCount} tone="danger" />
        <SummaryMetric label="Errors logged" value={summary.errorCount} tone={summary.errorCount > 0 ? 'danger' : 'default'} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <SummaryMetric label="Model usage events" value={summary.modelUsageCount} />
        <SummaryMetric label="Failed async tasks" value={summary.failedTaskCount} tone={summary.failedTaskCount > 0 ? 'danger' : 'default'} />
        <SummaryMetric
          label="Success rate"
          value={summary.requestCount ? `${Math.round((summary.successCount / summary.requestCount) * 100)}%` : '0%'}
          tone={summary.failureCount > 0 ? 'danger' : 'success'}
        />
      </div>
    </section>
  );
}
