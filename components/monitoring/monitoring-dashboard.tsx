'use client';

import { ErrorList } from '@/components/monitoring/error-list';
import { EvalPanel } from '@/components/monitoring/eval-panel';
import { ModelUsagePanel } from '@/components/monitoring/model-usage-panel';
import { RequestChart } from '@/components/monitoring/request-chart';
import { SummaryPanel } from '@/components/monitoring/summary-panel';
import { useEvalMetrics, useMonitoringSummary } from '@/lib/monitoring/dashboard-hooks';

function LoadingCard() {
  return (
    <div className="rounded-[28px] border border-cyan-200/10 bg-[rgba(8,22,36,0.78)] px-5 py-10 text-center text-sm text-cyan-50/72">
      Loading monitoring data...
    </div>
  );
}

function ErrorCard({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-rose-200/12 bg-[rgba(47,13,23,0.48)] px-5 py-6">
      <div className="text-lg font-semibold text-white">{title}</div>
      <p className="mt-2 text-sm leading-6 text-rose-50/82">{body}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-xl border border-rose-200/18 bg-white/8 px-4 py-2 text-sm font-semibold text-rose-50 transition hover:bg-white/12"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function MonitoringDashboard() {
  const summaryState = useMonitoringSummary();
  const evalState = useEvalMetrics();

  const isLoading = summaryState.isLoading || evalState.isLoading;
  const hasError = summaryState.error || evalState.error;

  return (
    <>
      <section className="aurora-panel mb-6 rounded-[28px] p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Observability</div>
            <h2 className="mt-1 text-2xl font-semibold text-white">Operational telemetry only</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-50/82">
              This dashboard renders only aggregated monitoring data and sanitized error messages. No patient-note text, no prompts, and no PHI-bearing content are exposed here.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                void summaryState.refresh();
                void evalState.refresh();
              }}
              className="aurora-secondary-button inline-flex rounded-xl px-4 py-2 text-sm font-semibold"
            >
              Refresh metrics
            </button>
          </div>
        </div>
      </section>

      {isLoading && !summaryState.data && !evalState.data ? <LoadingCard /> : null}

      {hasError && !summaryState.data ? (
        <ErrorCard
          title="Monitoring summary unavailable"
          body={summaryState.error || 'The summary endpoint could not be loaded.'}
          onRetry={() => {
            void summaryState.refresh();
          }}
        />
      ) : null}

      {hasError && !evalState.data ? (
        <div className="mt-6">
          <ErrorCard
            title="Eval history unavailable"
            body={evalState.error || 'The eval endpoint could not be loaded.'}
            onRetry={() => {
              void evalState.refresh();
            }}
          />
        </div>
      ) : null}

      {summaryState.data ? (
        <div className="grid gap-6">
          <SummaryPanel summary={summaryState.data} />
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <RequestChart summary={summaryState.data} />
            <ModelUsagePanel summary={summaryState.data} />
          </div>
          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <EvalPanel evals={evalState.data || { evalHistory: [], latest: null }} />
            <ErrorList errors={summaryState.data.recentErrors} failedTasks={summaryState.data.recentFailedTasks} />
          </div>
        </div>
      ) : null}
    </>
  );
}
