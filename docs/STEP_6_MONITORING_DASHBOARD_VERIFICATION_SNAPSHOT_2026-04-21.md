# Step 6 Monitoring Dashboard Verification Snapshot

## 1. New UI Files

Created files:
- [app/(dashboard)/monitoring/page.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/app/(dashboard)/monitoring/page.tsx)
- [components/monitoring/monitoring-dashboard.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/monitoring/monitoring-dashboard.tsx)
- [components/monitoring/summary-panel.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/monitoring/summary-panel.tsx)
- [components/monitoring/request-chart.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/monitoring/request-chart.tsx)
- [components/monitoring/error-list.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/monitoring/error-list.tsx)
- [components/monitoring/eval-panel.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/monitoring/eval-panel.tsx)
- [components/monitoring/model-usage-panel.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/monitoring/model-usage-panel.tsx)
- [lib/monitoring/dashboard-hooks.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/monitoring/dashboard-hooks.ts)

Files in `components/monitoring/*`:

```text
/Users/danielhale/.openclaw/workspace/app-prototype/components/monitoring/error-list.tsx
/Users/danielhale/.openclaw/workspace/app-prototype/components/monitoring/eval-panel.tsx
/Users/danielhale/.openclaw/workspace/app-prototype/components/monitoring/model-usage-panel.tsx
/Users/danielhale/.openclaw/workspace/app-prototype/components/monitoring/monitoring-dashboard.tsx
/Users/danielhale/.openclaw/workspace/app-prototype/components/monitoring/request-chart.tsx
/Users/danielhale/.openclaw/workspace/app-prototype/components/monitoring/summary-panel.tsx
```

## 2. EXACT Code

### Dashboard page `page.tsx`

File: [app/(dashboard)/monitoring/page.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/app/(dashboard)/monitoring/page.tsx)

```ts
import { AppShell } from '@/components/layout/app-shell';
import { MonitoringDashboard } from '@/components/monitoring/monitoring-dashboard';

export default function MonitoringPage() {
  return (
    <AppShell
      title="Monitoring"
      subtitle="Keep request health, regression performance, backend usage, and recent failures in one sanitized operational view."
      fullWidth
      showFeedback={false}
    >
      <MonitoringDashboard />
    </AppShell>
  );
}
```

### One component: `SummaryPanel`

File: [summary-panel.tsx](/Users/danielhale/.openclaw/workspace/app-prototype/components/monitoring/summary-panel.tsx)

```ts
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
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <SummaryMetric label="Model usage events" value={summary.modelUsageCount} />
        <SummaryMetric
          label="Success rate"
          value={summary.requestCount ? `${Math.round((summary.successCount / summary.requestCount) * 100)}%` : '0%'}
          tone={summary.failureCount > 0 ? 'danger' : 'success'}
        />
      </div>
    </section>
  );
}
```

### One data hook: `useMonitoringSummary`

File: [dashboard-hooks.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/monitoring/dashboard-hooks.ts)

```ts
'use client';

import { useEffect, useState } from 'react';

export type MonitoringErrorItem = {
  timestamp: string;
  route: string;
  errorType: string;
  message: string;
};

export type MonitoringSummary = {
  requestCount: number;
  successCount: number;
  failureCount: number;
  errorCount: number;
  modelUsageCount: number;
  requestsByModel: Record<string, number>;
  modelUsageByModel: Record<string, number>;
  recentErrors: MonitoringErrorItem[];
};

export type EvalMetric = {
  timestamp: string;
  passed: number;
  failed: number;
};

export type EvalMetricsResponse = {
  evalHistory: EvalMetric[];
  latest: EvalMetric | null;
};

type HookState<T> = {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
  });

  const data = await response.json() as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed for ${url}`);
  }

  return data;
}

function useMonitoringResource<T>(url: string): HookState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const next = await fetchJson<T>(url);
      setData(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load monitoring data.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isCancelled = false;

    async function loadWithGuard() {
      try {
        const next = await fetchJson<T>(url);
        if (!isCancelled) {
          setData(next);
          setError(null);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load monitoring data.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadWithGuard();
    const intervalId = window.setInterval(() => {
      void loadWithGuard();
    }, 30000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [url]);

  return {
    data,
    isLoading,
    error,
    refresh: load,
  };
}

export function useMonitoringSummary() {
  return useMonitoringResource<MonitoringSummary>('/api/monitoring/summary');
}

export function useEvalMetrics() {
  return useMonitoringResource<EvalMetricsResponse>('/api/monitoring/evals');
}
```

## 3. API Usage

Calls used by the dashboard hooks:

```ts
export function useMonitoringSummary() {
  return useMonitoringResource<MonitoringSummary>('/api/monitoring/summary');
}

export function useEvalMetrics() {
  return useMonitoringResource<EvalMetricsResponse>('/api/monitoring/evals');
}
```

Underlying fetch behavior:

```ts
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
  });

  const data = await response.json() as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed for ${url}`);
  }

  return data;
}
```

Monitoring API route shapes:

### `GET /api/monitoring/summary`

File: [summary route](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/monitoring/summary/route.ts)

```ts
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/auth-middleware';
import { requireRole } from '@/lib/auth/role-check';
import { getMetrics } from '@/lib/monitoring/metrics-store';

function countByModel(items: Array<{ model: string }>) {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item.model] = (counts[item.model] || 0) + 1;
    return counts;
  }, {});
}

export async function GET(request: Request) {
  void request;

  try {
    const authContext = await requireAuth(request);
    requireRole(authContext.user, 'admin');
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const metrics = getMetrics();
  const successCount = metrics.requests.filter((item) => item.success).length;
  const failureCount = metrics.requests.length - successCount;

  return NextResponse.json({
    requestCount: metrics.requests.length,
    successCount,
    failureCount,
    errorCount: metrics.errors.length,
    modelUsageCount: metrics.modelUsage.length,
    requestsByModel: countByModel(metrics.requests),
    modelUsageByModel: countByModel(metrics.modelUsage),
    recentErrors: metrics.errors.slice(-10),
  });
}
```

### `GET /api/monitoring/evals`

File: [evals route](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/monitoring/evals/route.ts)

```ts
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/auth-middleware';
import { requireRole } from '@/lib/auth/role-check';
import { getMetrics } from '@/lib/monitoring/metrics-store';

export async function GET(request: Request) {
  void request;

  try {
    const authContext = await requireAuth(request);
    requireRole(authContext.user, 'admin');
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const metrics = getMetrics();

  return NextResponse.json({
    evalHistory: metrics.evals,
    latest: metrics.evals[metrics.evals.length - 1] || null,
  });
}
```

## 4. Example Dashboard Data

### Example JSON from `GET /api/monitoring/summary`

```json
{
  "requestCount": 19,
  "successCount": 19,
  "failureCount": 0,
  "errorCount": 1,
  "modelUsageCount": 19,
  "requestsByModel": {
    "google/gemini-2.5-flash-lite": 19
  },
  "modelUsageByModel": {
    "google/gemini-2.5-flash-lite": 19
  },
  "recentErrors": [
    {
      "timestamp": "2026-04-22T01:09:33.052Z",
      "route": "assistant/respond",
      "errorType": "Error",
      "message": "[NAME_1] DOB [DOB_1] invalid request payload"
    }
  ]
}
```

### Example JSON from `GET /api/monitoring/evals`

```json
{
  "evalHistory": [
    {
      "timestamp": "2026-04-22T01:24:38.277Z",
      "passed": 19,
      "failed": 0
    }
  ],
  "latest": {
    "timestamp": "2026-04-22T01:24:38.277Z",
    "passed": 19,
    "failed": 0
  }
}
```

## 5. Rendered Output

### What the dashboard displays

Based on the example data above, the dashboard renders:

- `SummaryPanel`
  - Total requests: `19`
  - Successes: `19`
  - Failures: `0`
  - Errors logged: `1`
  - Model usage events: `19`
  - Success rate: `100%`

- `RequestChart`
  - `google/gemini-2.5-flash-lite` → `19`
  - Success: `19`
  - Failure: `0`

- `ErrorList`
  - Route: `assistant/respond`
  - Timestamp: `2026-04-22T01:09:33.052Z`
  - Error type: `Error`
  - Message: `[NAME_1] DOB [DOB_1] invalid request payload`

- `EvalPanel`
  - Passed: `19`
  - Failed: `0`
  - Pass rate: `100%`
  - Status badge: `Healthy`

- `ModelUsagePanel`
  - `google/gemini-2.5-flash-lite`
  - `19 usage events`
  - `Tokens: not exposed`

## 6. PHI Safety Verification

### Confirmation

- No PHI is rendered anywhere in the monitoring UI.
- No raw note text is shown.
- Only aggregated metric counts and sanitized error messages are displayed.

UI text that explicitly enforces this:

```ts
<div className="text-sm text-cyan-50/74">
  Aggregated counts only. No note text, prompt text, or raw patient details are shown here.
</div>
```

Displayed sanitized example:

```json
{
  "route": "assistant/respond",
  "errorType": "Error",
  "message": "[NAME_1] DOB [DOB_1] invalid request payload"
}
```

That is placeholder-based sanitized data, not raw patient text.

## 7. Performance

### How data is fetched

The dashboard uses client-side `fetch`, not SWR.

```ts
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
  });
  ...
}
```

### Whether requests are cached

No response caching is requested in the client fetch path:

```ts
const response = await fetch(url, {
  cache: 'no-store',
});
```

### Refresh behavior

Auto-refresh every 30 seconds:

```ts
const intervalId = window.setInterval(() => {
  void loadWithGuard();
}, 30000);
```

Manual refresh is also available:

```ts
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
```

### Expected load time

- One request to `/api/monitoring/summary`
- One request to `/api/monitoring/evals`
- Render path is lightweight and text/UI only
- Expected load time is dominated by those two small JSON endpoints and should generally be low on the current in-memory monitoring backend

## 8. Known Gaps

- No pagination for long error histories or eval histories.
- No real charting library; request visualization is a lightweight bar list.
- No real-time streaming or websocket updates.
- No persisted dashboard reads yet; endpoints currently read from in-memory metrics state.
- No filtering by route, model, time range, or outcome.
- No drill-down into individual requests.
- Token usage is not exposed in the current summary API shape, so `ModelUsagePanel` shows `Tokens: not exposed`.
- No export/download actions.
- No loading skeletons beyond a simple loading card.
- No dedicated empty-state variants per panel beyond basic fallback messaging.
