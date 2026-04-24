import type { MonitoringErrorItem, MonitoringQueueTaskItem } from '@/lib/monitoring/dashboard-hooks';

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString();
}

export function ErrorList({
  errors,
  failedTasks,
}: {
  errors: MonitoringErrorItem[];
  failedTasks: MonitoringQueueTaskItem[];
}) {
  const visibleErrors = errors.slice(-10).reverse();
  const visibleFailedTasks = failedTasks.slice(0, 5);

  return (
    <section className="aurora-panel rounded-[28px] p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">Recent errors</div>
          <h2 className="mt-1 text-2xl font-semibold text-white">Sanitized failures and queue issues</h2>
        </div>
        <div className="text-sm text-cyan-50/72">Only route-level metadata and sanitized messages are displayed.</div>
      </div>

      <div className="mt-6 space-y-3">
        {visibleFailedTasks.length ? (
          <div className="rounded-[22px] border border-amber-200/12 bg-[rgba(61,38,8,0.38)] px-4 py-4">
            <div className="text-sm font-semibold text-white">Recent failed async tasks</div>
            <div className="mt-3 space-y-3">
              {visibleFailedTasks.map((task) => (
                <article key={task.id} className="rounded-[18px] border border-amber-200/10 bg-[rgba(26,18,8,0.34)] px-3 py-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm font-semibold text-white">{task.type}</div>
                    <div className="text-xs uppercase tracking-[0.16em] text-amber-100/72">
                      {formatTimestamp(task.updatedAt || task.createdAt)}
                    </div>
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.14em] text-amber-100/72">
                    Status: {task.status} • Attempts: {task.attempts || 0}
                  </div>
                  {task.lastError ? (
                    <p className="mt-2 text-sm leading-6 text-amber-50/82">{task.lastError}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        ) : null}
        {visibleErrors.length ? (
          visibleErrors.map((item) => (
            <article
              key={`${item.timestamp}-${item.route}-${item.errorType}`}
              className="rounded-[22px] border border-rose-200/12 bg-[rgba(47,13,23,0.48)] px-4 py-4"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-sm font-semibold text-white">{item.route}</div>
                <div className="text-xs uppercase tracking-[0.16em] text-rose-100/72">{formatTimestamp(item.timestamp)}</div>
              </div>
              <div className="mt-2 text-sm font-medium text-rose-100">{item.errorType}</div>
              <p className="mt-2 text-sm leading-6 text-rose-50/82">{item.message}</p>
            </article>
          ))
        ) : (
          <div className="rounded-[22px] border border-cyan-200/10 bg-[rgba(8,22,36,0.78)] px-4 py-4 text-sm text-cyan-50/72">
            No recent errors recorded.
          </div>
        )}
      </div>
    </section>
  );
}
