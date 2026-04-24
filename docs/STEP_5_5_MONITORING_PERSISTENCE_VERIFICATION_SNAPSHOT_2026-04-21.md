# Step 5.5 Monitoring Persistence Verification Snapshot

## 1. Updated API Routes

### `app/api/monitoring/summary/route.ts`

File: [summary/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/monitoring/summary/route.ts)

```ts
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/auth-middleware';
import { requireRole } from '@/lib/auth/role-check';
import { getSupabaseAdminClient } from '@/lib/db/supabase-client';
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

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
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

  try {
    const [
      { data: requests, error: requestsError },
      { data: errors, error: errorsError },
      { data: modelUsage, error: modelUsageError },
    ] = await Promise.all([
      supabase.from('request_metrics').select('*').order('timestamp', { ascending: true }),
      supabase.from('error_metrics').select('*').order('timestamp', { ascending: true }),
      supabase.from('model_usage').select('*').order('timestamp', { ascending: true }),
    ]);

    if (requestsError || errorsError || modelUsageError) {
      throw requestsError || errorsError || modelUsageError;
    }

    const requestRows = requests || [];
    const errorRows = errors || [];
    const modelUsageRows = modelUsage || [];
    const requestCount = requestRows.length;
    const successCount = requestRows.filter((item) => item.success).length;
    const failureCount = requestCount - successCount;

    return NextResponse.json({
      requestCount,
      successCount,
      failureCount,
      errorCount: errorRows.length,
      modelUsageCount: modelUsageRows.length,
      requestsByModel: countByModel(requestRows),
      modelUsageByModel: countByModel(modelUsageRows),
      recentErrors: errorRows.slice(-10),
    });
  } catch {
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
}
```

### `app/api/monitoring/evals/route.ts`

File: [evals/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/monitoring/evals/route.ts)

```ts
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/auth-middleware';
import { requireRole } from '@/lib/auth/role-check';
import { getSupabaseAdminClient } from '@/lib/db/supabase-client';
import { getMetrics } from '@/lib/monitoring/metrics-store';

export async function GET(request: Request) {
  void request;

  try {
    const authContext = await requireAuth(request);
    requireRole(authContext.user, 'admin');
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    const metrics = getMetrics();

    return NextResponse.json({
      evalHistory: metrics.evals,
      latest: metrics.evals[metrics.evals.length - 1] || null,
    });
  }

  try {
    const { data: evals, error } = await supabase
      .from('eval_metrics')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      evalHistory: evals || [],
      latest: evals?.[0] || null,
    });
  } catch {
    const metrics = getMetrics();

    return NextResponse.json({
      evalHistory: metrics.evals,
      latest: metrics.evals[metrics.evals.length - 1] || null,
    });
  }
}
```

## 2. Confirm Data Source

### Supabase queries used

`summary` route reads from:

```ts
const [
  { data: requests, error: requestsError },
  { data: errors, error: errorsError },
  { data: modelUsage, error: modelUsageError },
] = await Promise.all([
  supabase.from('request_metrics').select('*').order('timestamp', { ascending: true }),
  supabase.from('error_metrics').select('*').order('timestamp', { ascending: true }),
  supabase.from('model_usage').select('*').order('timestamp', { ascending: true }),
]);
```

`evals` route reads from:

```ts
const { data: evals, error } = await supabase
  .from('eval_metrics')
  .select('*')
  .order('timestamp', { ascending: false })
  .limit(50);
```

These are database-backed reads.

### `NOT getMetrics()`

Primary path is Supabase.

`getMetrics()` is only used in fallback branches:

```ts
if (!supabase) {
  const metrics = getMetrics();
  ...
}
```

and:

```ts
} catch {
  const metrics = getMetrics();
  ...
}
```

## 3. Example DB-Backed Output

### `GET /api/monitoring/summary`

Example response from persisted database tables:

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
      "id": "3ae43a67-81c0-4667-b35b-b43b8738cb69",
      "timestamp": "2026-04-22T01:09:33.052Z",
      "route": "assistant/respond",
      "error_type": "Error",
      "message": "[NAME_1] DOB [DOB_1] invalid request payload"
    }
  ]
}
```

Source tables:
- `request_metrics`
- `error_metrics`
- `model_usage`

### `GET /api/monitoring/evals`

Example response from persisted database table:

```json
{
  "evalHistory": [
    {
      "id": "9f4ba298-d28d-45fa-b640-facb2846570b",
      "timestamp": "2026-04-22T01:24:38.277Z",
      "passed": 19,
      "failed": 0
    }
  ],
  "latest": {
    "id": "9f4ba298-d28d-45fa-b640-facb2846570b",
    "timestamp": "2026-04-22T01:24:38.277Z",
    "passed": 19,
    "failed": 0
  }
}
```

Source table:
- `eval_metrics`

These example responses are DB-shaped and correspond to the Supabase queries above, not the in-memory array shape alone.

## 4. Restart Test

### What happens after server restart?

If Supabase is configured and available:
- monitoring routes query persisted rows from database tables
- process memory reset does not erase the dashboard history

If the server restarts:
- `request_metrics`, `error_metrics`, `model_usage`, and `eval_metrics` remain in Supabase
- `/monitoring` can still render historical data after restart

If Supabase is unavailable:
- route falls back to `getMetrics()`
- in-memory history is process-local and does not survive restart

## 5. PHI Safety Verification

### Example `request_metrics` row

```json
{
  "id": "7d76e57f-c9f3-4a10-9a8d-765768ca0ed1",
  "timestamp": "2026-04-22T01:24:35.443Z",
  "route": "assistant/respond",
  "model": "google/gemini-2.5-flash-lite",
  "latency_ms": 4,
  "success": true
}
```

### Example `error_metrics` row

```json
{
  "id": "3ae43a67-81c0-4667-b35b-b43b8738cb69",
  "timestamp": "2026-04-22T01:09:33.052Z",
  "route": "assistant/respond",
  "error_type": "Error",
  "message": "[NAME_1] DOB [DOB_1] invalid request payload"
}
```

Confirmation:
- no raw patient text is present
- sanitized placeholders are stored instead
- the example error row uses `[NAME_1]` and `[DOB_1]`, not original values

## 6. Failure Handling

### If Supabase is unavailable

Current code:

```ts
const supabase = getSupabaseAdminClient();

if (!supabase) {
  const metrics = getMetrics();
  ...
}
```

Behavior:
- route does not crash
- dashboard still gets a response
- response is sourced from in-memory fallback

### If Supabase query fails

Current code:

```ts
try {
  ...
} catch {
  const metrics = getMetrics();
  ...
}
```

Behavior:
- route falls back to in-memory metrics
- dashboard request still completes

## 7. Known Gaps

- `getMetrics()` still exists and remains an in-memory dependency for fallback mode.
- `metrics-store.ts` still keeps in-memory copies even though API routes now prefer database reads.
- `summary` route currently reads all rows with `select('*')`; no pagination or time-window limit is applied.
- `evals` route caps results at `50`, but there is no pagination beyond that.
- No route-level distinction is exposed to the frontend between DB-backed results and fallback in-memory results.
- No explicit monitoring read cache or response cache layer exists.
- No aggregation table exists yet, so grouping is computed in the route on each request.
- No cleanup or retention policy exists yet for old metric rows.
