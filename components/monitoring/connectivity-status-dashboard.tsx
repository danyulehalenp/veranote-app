'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ConnectivityCheck,
  ConnectivityHealthReport,
  ConnectivityStatus,
} from '@/lib/veranote/connectivity-health';

const statusStyles: Record<ConnectivityStatus, string> = {
  healthy: 'border-emerald-200/20 bg-emerald-400/10 text-emerald-50',
  warning: 'border-amber-200/24 bg-amber-400/12 text-amber-50',
  critical: 'border-rose-200/24 bg-rose-500/14 text-rose-50',
  unknown: 'border-slate-200/18 bg-white/8 text-cyan-50',
};

function StatusBadge({ status }: { status: ConnectivityStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusStyles[status]}`}>
      {status}
    </span>
  );
}

function ConnectivityCheckCard({ check }: { check: ConnectivityCheck }) {
  return (
    <article className="rounded-[22px] border border-cyan-200/10 bg-[rgba(7,18,32,0.72)] p-4 shadow-[0_18px_50px_rgba(3,10,20,0.20)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">{check.label}</h3>
          <p className="mt-1 text-sm leading-6 text-cyan-50/78">{check.summary}</p>
        </div>
        <StatusBadge status={check.status} />
      </div>
      {check.detail ? (
        <p className="mt-3 rounded-[16px] border border-cyan-200/8 bg-white/[0.04] px-3 py-2 text-xs leading-5 text-cyan-50/66">
          {check.detail}
        </p>
      ) : null}
    </article>
  );
}

function groupChecks(checks: ConnectivityCheck[]) {
  return {
    critical: checks.filter((check) => check.status === 'critical'),
    warning: checks.filter((check) => check.status === 'warning'),
    healthy: checks.filter((check) => check.status === 'healthy'),
    unknown: checks.filter((check) => check.status === 'unknown'),
  };
}

export function ConnectivityStatusDashboard() {
  const [report, setReport] = useState<ConnectivityHealthReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/connectivity/health', {
        cache: 'no-store',
      });
      const data = await response.json() as ConnectivityHealthReport;

      setReport(data);
      if (!response.ok && data.status !== 'critical') {
        setError('Connectivity endpoint returned an unexpected status.');
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load connectivity report.');
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const grouped = useMemo(() => groupChecks(report?.checks || []), [report]);
  const orderedChecks = [
    ...grouped.critical,
    ...grouped.warning,
    ...grouped.unknown,
    ...grouped.healthy,
  ];

  return (
    <div className="grid gap-6">
      <section className="aurora-panel rounded-[30px] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Connectivity status</div>
            <h2 className="mt-1 text-2xl font-semibold text-white">Production wiring and durable storage health</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-cyan-50/80">
              This internal view checks app configuration, auth readiness, AI configuration, and server-side Supabase table reachability. It only returns safe operational status, never keys, tokens, or patient content.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {report ? <StatusBadge status={report.status} /> : null}
            <button
              type="button"
              onClick={() => {
                void loadReport();
              }}
              className="aurora-secondary-button rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
              disabled={isLoading}
            >
              {isLoading ? 'Checking...' : 'Refresh checks'}
            </button>
          </div>
        </div>

        {report ? (
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-[20px] border border-cyan-200/10 bg-white/[0.04] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/62">Storage mode</div>
              <div className="mt-2 text-lg font-semibold text-white">{report.durableStorageMode}</div>
            </div>
            <div className="rounded-[20px] border border-rose-200/14 bg-rose-500/8 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-100/72">Critical</div>
              <div className="mt-2 text-lg font-semibold text-white">{grouped.critical.length}</div>
            </div>
            <div className="rounded-[20px] border border-amber-200/14 bg-amber-400/8 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100/72">Warnings</div>
              <div className="mt-2 text-lg font-semibold text-white">{grouped.warning.length}</div>
            </div>
            <div className="rounded-[20px] border border-emerald-200/14 bg-emerald-400/8 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/72">Healthy</div>
              <div className="mt-2 text-lg font-semibold text-white">{grouped.healthy.length}</div>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-[20px] border border-rose-200/16 bg-rose-500/10 p-4 text-sm leading-6 text-rose-50">
            {error}
          </div>
        ) : null}

        {report ? (
          <div className="mt-5 rounded-[22px] border border-cyan-200/10 bg-[rgba(7,18,32,0.58)] p-4">
            <div className="text-sm font-semibold text-white">Recommended actions</div>
            <ul className="mt-3 grid gap-2 text-sm leading-6 text-cyan-50/76">
              {report.recommendedActions.map((action) => (
                <li key={action} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-cyan-50/54">
              Last checked: {new Date(report.checkedAt).toLocaleString()}
            </p>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {isLoading && !report ? (
          <div className="rounded-[28px] border border-cyan-200/10 bg-[rgba(8,22,36,0.78)] px-5 py-10 text-center text-sm text-cyan-50/72">
            Loading connectivity checks...
          </div>
        ) : null}
        {orderedChecks.map((check) => (
          <ConnectivityCheckCard key={check.id} check={check} />
        ))}
      </section>
    </div>
  );
}
