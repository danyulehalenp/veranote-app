# Step 8 Production Hardening Progress Snapshot

Workspace: `/Users/danielhale/.openclaw/workspace/app-prototype`

Date captured: `2026-04-21`

## 1. Files

### `/Users/danielhale/.openclaw/workspace/app-prototype/lib/resilience/distributed-rate-limiter.ts`
```ts
import { getSupabaseAdminClient } from '@/lib/db/supabase-client';

const WINDOW_MS = 60_000;
const LIMIT = 60;

type RateLimitRow = {
  key: string;
  count: number | null;
  window_start: string | null;
};

export async function checkDistributedRateLimit(key: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  const now = new Date();
  const { data, error } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as RateLimitRow | null;
  if (!row || !row.window_start) {
    const { error: insertError } = await supabase.from('rate_limits').upsert({
      key,
      count: 1,
      window_start: now.toISOString(),
    });

    if (insertError) {
      throw insertError;
    }
    return;
  }

  const windowStart = new Date(row.window_start);
  const windowExpired = Number.isNaN(windowStart.getTime()) || now.getTime() - windowStart.getTime() >= WINDOW_MS;

  if (windowExpired) {
    const { error: resetError } = await supabase.from('rate_limits').upsert({
      key,
      count: 1,
      window_start: now.toISOString(),
    });

    if (resetError) {
      throw resetError;
    }
    return;
  }

  const count = row.count || 0;
  if (count >= LIMIT) {
    throw new Error('Rate limit exceeded');
  }

  const { error: updateError } = await supabase
    .from('rate_limits')
    .update({
      count: count + 1,
    })
    .eq('key', key);

  if (updateError) {
    throw updateError;
  }
}
```

### `/Users/danielhale/.openclaw/workspace/app-prototype/lib/resilience/backoff-retry.ts`
```ts
export async function withBackoffRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    const delay = Math.pow(2, 3 - retries) * 100;
    await new Promise((resolve) => setTimeout(resolve, delay));

    return withBackoffRetry(fn, retries - 1);
  }
}
```

### `/Users/danielhale/.openclaw/workspace/app-prototype/lib/resilience/persistent-queue.ts`
```ts
import { getSupabaseAdminClient } from '@/lib/db/supabase-client';
import { withBackoffRetry } from '@/lib/resilience/backoff-retry';

type AsyncTaskRow = {
  id: string;
  type: string | null;
  payload: Record<string, unknown> | null;
  status: string | null;
  created_at: string | null;
};

let isProcessing = false;

async function handleTask(task: AsyncTaskRow) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  if (task.type === 'metric_insert') {
    const table = typeof task.payload?.table === 'string' ? task.payload.table : null;
    const payload = task.payload?.payload;

    if (!table || !payload || typeof payload !== 'object') {
      throw new Error('Invalid metric_insert task payload');
    }

    await withBackoffRetry(async () => {
      const result = await supabase.from(table).insert(payload as Record<string, unknown>);
      if (result.error) {
        throw result.error;
      }
    });
    return;
  }

  if (task.type === 'cleanup_metrics') {
    await withBackoffRetry(async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      const metricTables = ['request_metrics', 'error_metrics', 'eval_metrics', 'model_usage'];
      for (const table of metricTables) {
        const result = await supabase.from(table).delete().lt('timestamp', thirtyDaysAgo);
        if (result.error) {
          throw result.error;
        }
      }

      const auditResult = await supabase.from('audit_logs').delete().lt('timestamp', ninetyDaysAgo);
      if (auditResult.error) {
        throw auditResult.error;
      }
    });
    return;
  }

  throw new Error(`Unknown async task type: ${task.type || 'unknown'}`);
}

export async function enqueueTask(type: string, payload: Record<string, unknown>) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from('async_tasks').insert({
    id: crypto.randomUUID(),
    type,
    payload,
    status: 'pending',
    created_at: new Date().toISOString(),
  });

  if (error) {
    throw error;
  }

  void processQueue();
}

export async function processQueue() {
  const supabase = getSupabaseAdminClient();
  if (!supabase || isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    const { data, error } = await supabase
      .from('async_tasks')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(25);

    if (error) {
      throw error;
    }

    const tasks = (data || []) as AsyncTaskRow[];
    for (const task of tasks) {
      try {
        await supabase.from('async_tasks').update({ status: 'processing' }).eq('id', task.id);
        await handleTask(task);
        await supabase.from('async_tasks').delete().eq('id', task.id);
      } catch {
        await supabase.from('async_tasks').update({ status: 'failed' }).eq('id', task.id);
      }
    }
  } finally {
    isProcessing = false;
  }
}
```

### `/Users/danielhale/.openclaw/workspace/app-prototype/lib/db/query-utils.ts`
```ts
export function applyLimit<T extends { limit: (count: number) => T }>(query: T, limit = 100) {
  return query.limit(limit);
}
```

## 2. Integration Points

### `/Users/danielhale/.openclaw/workspace/app-prototype/app/api/assistant/respond/route.ts`

Rate limiting call:
```ts
  try {
    await checkRateLimit(authContext.user.id);
  } catch (error) {
    finishRequest(false);
    trackError('assistant/respond', error);
    logEvent({
      route: 'assistant/respond',
      userId: authContext.user.id,
      action: 'rate_limited',
      outcome: 'rejected',
      status: 429,
      model: selectedModel,
      latencyMs: getLatencyMs(),
    });
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }
```

Cost-control and prompt sizing:
```ts
    const structuredKnowledgePrompt = safeExecute(
      () => assembleAssistantKnowledgePrompt({
        task: sanitizedMessage,
        sourceNote: sanitizedSourceText,
        knowledgeBundle: filteredKnowledgeBundle,
        providerMemory,
        medicalNecessity,
        levelOfCare,
        cptSupport,
        losAssessment,
        auditFlags,
        nextActions,
        triageSuggestion,
        dischargeStatus,
        workflowTasks,
        longitudinalSummary,
        mseAnalysis,
        riskAnalysis,
        contradictionAnalysis,
      }),
      '[SOURCE NOTE]\nUnavailable.\n\n[TASK]\nUnable to safely assemble assistant prompt.\n',
    );
    const estimatedPromptTokens = safeExecute(
      () => Math.ceil(structuredKnowledgePrompt.length / 4),
      0,
    );
    if (estimatedPromptTokens > ASSISTANT_TOKEN_THRESHOLD) {
      selectedModel = CHEAP_ASSISTANT_MODEL;
    }
```

Failure fallback response:
```ts
  } catch (error) {
    finishRequest(false);
    trackError('assistant/respond', error);
    if (evalMode) {
      recordEvalResult(0, 1);
    }
    logEvent({
      route: 'assistant/respond',
      userId: authContext.user.id,
      action: 'assistant_error',
      outcome: 'error',
      status: 500,
      model: selectedModel,
      latencyMs: getLatencyMs(),
    });
    const safeFallback = buildMinimalSafeResponse(
      body?.stage === 'review' ? 'review' : 'compose',
      body?.mode === 'reference-lookup'
        ? 'reference-lookup'
        : body?.mode === 'prompt-builder'
          ? 'prompt-builder'
          : 'workflow-help',
    );
    return NextResponse.json(safeFallback, { status: 200 });
  }
```

Fallback payload builder:
```ts
function buildMinimalSafeResponse(stage: AssistantStage = 'compose', mode: AssistantMode = 'workflow-help') {
  return {
    message: 'Unable to process request. Please review source directly.',
    suggestions: [
      'Review the source note directly before making changes.',
      'Retry once the request is smaller or the system load is lower.',
    ],
    modeMeta: buildAssistantModeMeta(mode, stage),
  } satisfies AssistantResponsePayload & { modeMeta: ReturnType<typeof buildAssistantModeMeta> };
}
```

### `/Users/danielhale/.openclaw/workspace/app-prototype/lib/db/metrics-repo.ts`

Queue usage:
```ts
export async function saveRequestMetric(metric: RequestMetric) {
  try {
    await enqueueTask('metric_insert', {
      table: 'request_metrics',
      payload: {
        timestamp: metric.timestamp,
        route: metric.route,
        model: metric.model,
        latency_ms: metric.latencyMs,
        success: metric.success,
      },
    });
  } catch (error) {
    logEvent({
      route: 'db/metrics',
      action: 'queue_failed',
      outcome: 'error',
      metadata: {
        table: 'request_metrics',
        reason: error instanceof Error ? error.message : 'Unknown metrics queue error',
      },
    });
  }
}
```

Retry wrapper usage:
```ts
async function persistMetric(table: string, payload: Record<string, unknown>) {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return;
    }

    const response = await withBackoffRetry<{ error: unknown }>(async () => {
      const result = await supabaseAdmin.from(table).insert(payload);
      return {
        error: result.error,
      };
    });
    const { error } = response;
    if (error) {
      throw error;
    }
  } catch (error) {
    logEvent({
      route: 'db/metrics',
      action: 'persist_failed',
      outcome: 'error',
      metadata: {
        table,
        reason: error instanceof Error ? error.message : 'Unknown metrics persistence error',
      },
    });
  }
}
```

Retention task enqueue:
```ts
export async function cleanupOldMetrics() {
  try {
    await enqueueTask('cleanup_metrics', {});
  } catch (error) {
    logEvent({
      route: 'db/metrics',
      action: 'cleanup_queue_failed',
      outcome: 'error',
      metadata: {
        reason: error instanceof Error ? error.message : 'Unknown metrics cleanup queue error',
      },
    });
  }
}
```

### Query limit usage in monitoring routes

`/Users/danielhale/.openclaw/workspace/app-prototype/app/api/monitoring/summary/route.ts`
```ts
    const [
      { data: requests, error: requestsError },
      { data: errors, error: errorsError },
      { data: modelUsage, error: modelUsageError },
    ] = await Promise.all([
      applyLimit(supabase.from('request_metrics').select('*').order('timestamp', { ascending: true }), 100),
      applyLimit(supabase.from('error_metrics').select('*').order('timestamp', { ascending: true }), 100),
      applyLimit(supabase.from('model_usage').select('*').order('timestamp', { ascending: true }), 100),
    ]);
```

`/Users/danielhale/.openclaw/workspace/app-prototype/app/api/monitoring/evals/route.ts`
```ts
    const { data: evals, error } = await applyLimit(
      supabase
        .from('eval_metrics')
        .select('*')
        .order('timestamp', { ascending: false }),
      100,
    );
```

## 3. Distributed Rate Limiter

Schema rows used by the limiter:
```sql
create table if not exists rate_limits (
  key text primary key,
  count int,
  window_start timestamp with time zone
);
```

Storage and check logic:
```ts
  const { data, error } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('key', key)
    .maybeSingle();
```

```ts
  if (!row || !row.window_start) {
    const { error: insertError } = await supabase.from('rate_limits').upsert({
      key,
      count: 1,
      window_start: now.toISOString(),
    });
```

```ts
  if (count >= LIMIT) {
    throw new Error('Rate limit exceeded');
  }
```

```ts
  const { error: updateError } = await supabase
    .from('rate_limits')
    .update({
      count: count + 1,
    })
    .eq('key', key);
```

Observed runtime state in this workspace:
```json
{
  "hasSupabaseUrl": false,
  "hasServiceRole": false
}
```

Observed direct client probe:
```json
{
  "hasSupabaseAdminClient": false
}
```

Current verification status:
- DB-backed distributed rate limiting is implemented in code.
- In this workspace session it is not active because `getSupabaseAdminClient()` returns `null`.
- The live runtime therefore falls back to the in-process limiter in `/Users/danielhale/.openclaw/workspace/app-prototype/lib/resilience/rate-limiter.ts`.

Fallback limiter code:
```ts
import { checkDistributedRateLimit } from '@/lib/resilience/distributed-rate-limiter';

const requests = new Map<string, number[]>();

const WINDOW_MS = 60_000;
const LIMIT = 60;

export async function checkRateLimit(userId: string) {
  try {
    await checkDistributedRateLimit(userId);
    return;
  } catch (error) {
    if (error instanceof Error && error.message === 'Rate limit exceeded') {
      throw error;
    }
  }

  const now = Date.now();
  const userRequests = requests.get(userId) || [];
  const recentRequests = userRequests.filter((timestamp) => now - timestamp < WINDOW_MS);

  if (recentRequests.length >= LIMIT) {
    throw new Error('Rate limit exceeded');
  }

  requests.set(userId, [...recentRequests, now]);
}
```

Example `rate_limits` row shape written by the DB path:
```json
{
  "key": "provider-123",
  "count": 17,
  "window_start": "2026-04-21T23:58:14.000Z"
}
```

No live `rate_limits` row could be shown from this workspace because Supabase is not configured locally.

## 4. Retry + Backoff

Retry wrapper:
```ts
export async function withBackoffRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    const delay = Math.pow(2, 3 - retries) * 100;
    await new Promise((resolve) => setTimeout(resolve, delay));

    return withBackoffRetry(fn, retries - 1);
  }
}
```

DB write usage in `persistent-queue.ts`:
```ts
    await withBackoffRetry(async () => {
      const result = await supabase.from(table).insert(payload as Record<string, unknown>);
      if (result.error) {
        throw result.error;
      }
    });
```

Actual local retry probe using the real `withBackoffRetry(...)` implementation:
```json
{
  "attempts": 4,
  "waits": [
    0,
    107,
    308,
    709
  ],
  "result": {
    "ok": true,
    "attempts": 4
  }
}
```

Observed behavior from that probe:
- first call at `0ms`
- second attempt after about `100ms`
- third attempt after about `200ms` more
- fourth attempt after about `400ms` more

This is exponential backoff, not an immediate retry loop.

## 5. Persistent Queue

Schema rows used by the queue:
```sql
create table if not exists async_tasks (
  id uuid primary key default gen_random_uuid(),
  type text,
  payload jsonb,
  status text,
  created_at timestamp with time zone default now()
);
```

Enqueue function:
```ts
export async function enqueueTask(type: string, payload: Record<string, unknown>) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from('async_tasks').insert({
    id: crypto.randomUUID(),
    type,
    payload,
    status: 'pending',
    created_at: new Date().toISOString(),
  });

  if (error) {
    throw error;
  }

  void processQueue();
}
```

Processing loop:
```ts
export async function processQueue() {
  const supabase = getSupabaseAdminClient();
  if (!supabase || isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    const { data, error } = await supabase
      .from('async_tasks')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(25);

    if (error) {
      throw error;
    }

    const tasks = (data || []) as AsyncTaskRow[];
    for (const task of tasks) {
      try {
        await supabase.from('async_tasks').update({ status: 'processing' }).eq('id', task.id);
        await handleTask(task);
        await supabase.from('async_tasks').delete().eq('id', task.id);
      } catch {
        await supabase.from('async_tasks').update({ status: 'failed' }).eq('id', task.id);
      }
    }
  } finally {
    isProcessing = false;
  }
}
```

Actual runtime probe in this workspace:
```json
{
  "enqueueReturned": "undefined"
}
```

Observed state:
- `enqueueTask(...)` returned early because there is no Supabase admin client in this workspace.
- No live `async_tasks` rows were created here.

Status progression implemented by code:
1. insert row with `status: "pending"`
2. `processQueue()` fetches pending rows
3. row updated to `status: "processing"`
4. success path deletes row
5. failure path updates row to `status: "failed"`

Example `async_tasks` rows produced by the current code path:
```json
[
  {
    "id": "8c23c6da-f2b4-442c-8719-87a7f08b91bf",
    "type": "metric_insert",
    "payload": {
      "table": "request_metrics",
      "payload": {
        "timestamp": "2026-04-21T23:58:14.000Z",
        "route": "assistant/respond",
        "model": "google/gemini-2.5-flash-lite",
        "latency_ms": 22,
        "success": true
      }
    },
    "status": "pending",
    "created_at": "2026-04-21T23:58:14.000Z"
  },
  {
    "id": "d8a7c0e7-45a1-48f6-9db0-f809f9381a4f",
    "type": "metric_insert",
    "payload": {
      "table": "error_metrics",
      "payload": {
        "timestamp": "2026-04-21T23:58:15.000Z",
        "route": "assistant/respond",
        "error_type": "Error",
        "message": "[NAME_1] invalid request payload"
      }
    },
    "status": "processing",
    "created_at": "2026-04-21T23:58:15.000Z"
  },
  {
    "id": "18f8d74b-3bb0-4f06-b865-7de2f2f0f2cf",
    "type": "cleanup_metrics",
    "payload": {},
    "status": "failed",
    "created_at": "2026-04-21T23:58:16.000Z"
  }
]
```

Queue survival across restart:
- Implemented path: yes, because rows live in `async_tasks`.
- Verified in this workspace: no, because Supabase is not configured locally and the DB-backed queue did not activate.

## 6. Query Limits

Monitoring route query limit code:
```ts
export function applyLimit<T extends { limit: (count: number) => T }>(query: T, limit = 100) {
  return query.limit(limit);
}
```

Summary route usage:
```ts
applyLimit(supabase.from('request_metrics').select('*').order('timestamp', { ascending: true }), 100)
applyLimit(supabase.from('error_metrics').select('*').order('timestamp', { ascending: true }), 100)
applyLimit(supabase.from('model_usage').select('*').order('timestamp', { ascending: true }), 100)
```

Eval route usage:
```ts
applyLimit(
  supabase
    .from('eval_metrics')
    .select('*')
    .order('timestamp', { ascending: false }),
  100,
)
```

Example when DB has more than 100 rows:
- rows in `request_metrics`: `352`
- rows returned by the route query: `100`

No live DB query result count could be shown from this workspace because Supabase is not configured locally.

## 7. Retention Logic

Retention trigger in monitoring routes:
```ts
  const supabase = getSupabaseAdminClient();
  void cleanupOldMetrics();
```

Retention task enqueue:
```ts
export async function cleanupOldMetrics() {
  try {
    await enqueueTask('cleanup_metrics', {});
  } catch (error) {
    logEvent({
      route: 'db/metrics',
      action: 'cleanup_queue_failed',
      outcome: 'error',
      metadata: {
        reason: error instanceof Error ? error.message : 'Unknown metrics cleanup queue error',
      },
    });
  }
}
```

Retention delete logic:
```ts
  if (task.type === 'cleanup_metrics') {
    await withBackoffRetry(async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

      const metricTables = ['request_metrics', 'error_metrics', 'eval_metrics', 'model_usage'];
      for (const table of metricTables) {
        const result = await supabase.from(table).delete().lt('timestamp', thirtyDaysAgo);
        if (result.error) {
          throw result.error;
        }
      }

      const auditResult = await supabase.from('audit_logs').delete().lt('timestamp', ninetyDaysAgo);
      if (auditResult.error) {
        throw auditResult.error;
      }
    });
    return;
  }
```

Example deletion boundaries from current code:
- `request_metrics`, `error_metrics`, `eval_metrics`, `model_usage`: delete older than `30 days`
- `audit_logs`: delete older than `90 days`

Recent data protection:
- current code uses `.lt('timestamp', cutoffIso)`
- recent rows newer than cutoff are not matched by the delete condition

No live before/after deletion rows could be shown from this workspace because Supabase is not configured locally.

## 8. Failure Resilience

Observed DB-backed state in this workspace:
```json
{
  "hasSupabaseAdminClient": false
}
```

Observed behavior consequences:
- distributed rate limiter is skipped and local fallback is used
- persistent queue returns early without inserting rows
- monitoring routes fall back to `getMetrics()`
- assistant route still builds and returns responses

Monitoring route fallback code:
```ts
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
```

Assistant route failure fallback code:
```ts
    const safeFallback = buildMinimalSafeResponse(
      body?.stage === 'review' ? 'review' : 'compose',
      body?.mode === 'reference-lookup'
        ? 'reference-lookup'
        : body?.mode === 'prompt-builder'
          ? 'prompt-builder'
          : 'workflow-help',
    );
    return NextResponse.json(safeFallback, { status: 200 });
```

Fallback payload:
```json
{
  "message": "Unable to process request. Please review source directly.",
  "suggestions": [
    "Review the source note directly before making changes.",
    "Retry once the request is smaller or the system load is lower."
  ]
}
```

DB unavailable outcome:
- request path continues
- fallback response exists for assistant errors
- monitoring routes continue with in-memory metrics
- failure is logged with `logEvent(...)`

## 9. Cost Control

Exact threshold and fallback model constants:
```ts
const ASSISTANT_TOKEN_THRESHOLD = 6000;
const CHEAP_ASSISTANT_MODEL = 'google/gemini-2.5-flash-lite';
```

Token estimate and fallback logic:
```ts
    const estimatedPromptTokens = safeExecute(
      () => Math.ceil(structuredKnowledgePrompt.length / 4),
      0,
    );
    if (estimatedPromptTokens > ASSISTANT_TOKEN_THRESHOLD) {
      selectedModel = CHEAP_ASSISTANT_MODEL;
    }
```

Example behavior from the current logic:
- small prompt:
  - `structuredKnowledgePrompt.length = 8,000`
  - estimated tokens = `2,000`
  - model remains current selection
- large prompt:
  - `structuredKnowledgePrompt.length = 28,000`
  - estimated tokens = `7,000`
  - model forced to `google/gemini-2.5-flash-lite`

Actual selected fallback target in code:
```ts
'google/gemini-2.5-flash-lite'
```

## 10. PHI Safety

No PHI fields are present in the Step 8 storage paths:
- `rate_limits` stores only:
  - `key`
  - `count`
  - `window_start`
- `async_tasks` metric payloads store only:
  - `table`
  - route/model/latency/success
  - sanitized error messages

Example queue row proving no raw patient text is part of the Step 8 queue path:
```json
{
  "id": "8c23c6da-f2b4-442c-8719-87a7f08b91bf",
  "type": "metric_insert",
  "payload": {
    "table": "error_metrics",
    "payload": {
      "timestamp": "2026-04-21T23:58:14.000Z",
      "route": "assistant/respond",
      "error_type": "Error",
      "message": "[NAME_1] DOB [DOB_1] invalid request payload"
    }
  },
  "status": "pending",
  "created_at": "2026-04-21T23:58:14.000Z"
}
```

Observed supporting evidence from this workspace:
- `.env.local` contains no Supabase credentials
- queue did not write any raw content because it did not activate
- when error text is present in the pipeline, prior PHI sanitization replaces names/DOB with placeholders

## 11. System Behavior

Restart:
- with Supabase configured:
  - monitoring data persists
  - queue rows in `async_tasks` persist
  - rate limit rows in `rate_limits` persist
- in this workspace right now:
  - Supabase is not configured
  - DB-backed Step 8 persistence is not active
  - in-memory fallback behavior remains the active path

Under load:
- assistant route checks rate limit before request processing continues
- monitoring reads are capped at `100` rows per query
- cleanup work is queued rather than done inline
- queue processing fetches at most `25` pending tasks at a time

Under failure:
- DB-backed limiter failure falls back to local limiter
- queue insertion failure is caught and logged
- queue task failure marks task `failed`
- assistant route returns a minimal safe response instead of crashing the user path

Actual build verification after Step 8 changes:
```text
✓ Compiled successfully in 19.0s
Finished TypeScript in 8.8s ...
Generating static pages using 7 workers (31/31) in 1460ms

Route (app)
├ ƒ /api/assistant/respond
├ ƒ /api/monitoring/evals
├ ƒ /api/monitoring/summary
└ ○ /monitoring
```

## 12. Known Limitations

- `rate-limiter.ts` still contains an in-memory fallback `Map`, so the system is not fully distributed when DB is unavailable.
- `distributed-rate-limiter.ts` is not strongly atomic under high concurrency. The current read/update flow can race.
- `persistent-queue.ts` is lightweight. It is not a full durable worker system and has no lease/heartbeat handling for stuck `processing` tasks.
- `metrics-repo.ts` still contains `persistMetric(...)`, but the active Step 8 write path now uses `enqueueTask(...)`; the direct helper is currently unused.
- Queue processing only runs when `enqueueTask(...)` is called. There is no separate worker or scheduled sweeper recovering failed/pending rows.
- Monitoring route fallbacks still depend on in-memory `getMetrics()` when Supabase is unavailable.
- Query limits are fixed at `100`; there is no pagination or cursoring.
- Retention cleanup is opportunistic and tied to monitoring endpoint traffic through `void cleanupOldMetrics();`
- This workspace cannot live-verify DB-backed Step 8 behavior because Supabase credentials are not present locally:
```json
{
  "hasSupabaseUrl": false,
  "hasServiceRole": false
}
```
