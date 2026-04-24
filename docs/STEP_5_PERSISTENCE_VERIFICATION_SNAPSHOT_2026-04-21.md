# Step 5 Persistence Verification Snapshot

## 1. Updated Database Schema

File: [schema.sql](/Users/danielhale/.openclaw/workspace/app-prototype/lib/db/schema.sql)

```sql
create extension if not exists pgcrypto;

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  content text not null,
  created_at timestamp with time zone default now()
);

create index if not exists notes_provider_id_created_at_idx
  on notes (provider_id, created_at desc);

create table if not exists memory (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  category text not null,
  content text not null,
  created_at timestamp with time zone default now()
);

create index if not exists memory_provider_id_created_at_idx
  on memory (provider_id, created_at desc);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamp with time zone default now(),
  user_id text not null,
  action text not null,
  route text,
  metadata jsonb,
  created_at timestamp with time zone default now()
);

create index if not exists audit_logs_user_id_created_at_idx
  on audit_logs (user_id, created_at desc);

create table if not exists request_metrics (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamp with time zone default now(),
  route text,
  model text,
  latency_ms int,
  success boolean
);

create table if not exists error_metrics (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamp with time zone default now(),
  route text,
  error_type text,
  message text
);

create table if not exists eval_metrics (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamp with time zone default now(),
  passed int,
  failed int
);

create table if not exists model_usage (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamp with time zone default now(),
  model text,
  tokens int
);

create table if not exists provider_memory (
  id uuid primary key default gen_random_uuid(),
  provider_id text,
  category text,
  content text,
  confidence text,
  source text,
  tags text[],
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
```

Tables created in this step:
- `request_metrics`
- `error_metrics`
- `eval_metrics`
- `model_usage`
- `audit_logs`
- `provider_memory`

## 2. New Repository Files

### `lib/db/metrics-repo.ts`

File: [metrics-repo.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/db/metrics-repo.ts)

```ts
import { getSupabaseAdminClient } from '@/lib/db/supabase-client';
import { logEvent } from '@/lib/security/safe-logger';
import type { ErrorMetric, EvalMetric, ModelUsageMetric, RequestMetric } from '@/lib/monitoring/metrics-types';

async function insertMetric(table: string, payload: Record<string, unknown>) {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return;
    }

    const { error } = await supabaseAdmin.from(table).insert(payload);
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

export async function saveRequestMetric(metric: RequestMetric) {
  await insertMetric('request_metrics', {
    timestamp: metric.timestamp,
    route: metric.route,
    model: metric.model,
    latency_ms: metric.latencyMs,
    success: metric.success,
  });
}

export async function saveErrorMetric(metric: ErrorMetric) {
  await insertMetric('error_metrics', {
    timestamp: metric.timestamp,
    route: metric.route,
    error_type: metric.errorType,
    message: metric.message,
  });
}

export async function saveEvalMetric(metric: EvalMetric) {
  await insertMetric('eval_metrics', {
    timestamp: metric.timestamp,
    passed: metric.passed,
    failed: metric.failed,
  });
}

export async function saveModelUsage(metric: ModelUsageMetric) {
  await insertMetric('model_usage', {
    timestamp: metric.timestamp,
    model: metric.model,
    tokens: metric.tokens ?? null,
  });
}
```

### `lib/db/audit-repo.ts`

File: [audit-repo.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/db/audit-repo.ts)

```ts
import { getSupabaseAdminClient } from '@/lib/db/supabase-client';
import { sanitizeForLogging } from '@/lib/security/phi-sanitizer';
import { logEvent } from '@/lib/security/safe-logger';

type AuditEventRow = {
  timestamp: string;
  user_id: string;
  action: string;
  route?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

function sanitizeMetadata(metadata?: AuditEventRow['metadata']) {
  if (!metadata) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (typeof value === 'string') {
        return [key, sanitizeForLogging(value)];
      }
      return [key, value];
    }),
  );
}

export async function saveAuditEvent(event: AuditEventRow) {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return;
    }

    const { error } = await supabaseAdmin.from('audit_logs').insert({
      timestamp: event.timestamp,
      user_id: event.user_id,
      action: event.action,
      route: event.route ?? null,
      metadata: sanitizeMetadata(event.metadata) ?? null,
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    logEvent({
      route: 'db/audit',
      action: 'persist_failed',
      outcome: 'error',
      metadata: {
        reason: error instanceof Error ? error.message : 'Unknown audit persistence error',
      },
    });
  }
}
```

### `lib/db/memory-repo.ts`

File: [memory-repo.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/db/memory-repo.ts)

```ts
import { getSupabaseAdminClient } from '@/lib/db/supabase-client';
import { sanitizeForLogging } from '@/lib/security/phi-sanitizer';
import { logEvent } from '@/lib/security/safe-logger';
import type { ProviderMemoryItem } from '@/lib/veranote/memory/memory-types';

type ProviderMemoryRow = {
  id: string;
  provider_id: string;
  category: string;
  content: string;
  confidence: string;
  source: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string | null;
};

function toProviderMemoryItem(row: ProviderMemoryRow): ProviderMemoryItem {
  return {
    id: row.id,
    providerId: row.provider_id,
    category: row.category as ProviderMemoryItem['category'],
    content: row.content,
    confidence: row.confidence as ProviderMemoryItem['confidence'],
    source: (row.source || 'manual') as ProviderMemoryItem['source'],
    tags: row.tags || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

function toProviderMemoryRow(item: ProviderMemoryItem) {
  return {
    id: item.id,
    provider_id: item.providerId,
    category: item.category,
    content: sanitizeForLogging(item.content),
    confidence: item.confidence,
    source: item.source,
    tags: item.tags,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

export async function getProviderMemory(providerId: string) {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return [];
    }

    const { data, error } = await supabaseAdmin
      .from('provider_memory')
      .select('*')
      .eq('provider_id', providerId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    return (data || []).map((row) => toProviderMemoryItem(row as ProviderMemoryRow));
  } catch (error) {
    logEvent({
      route: 'db/provider-memory',
      action: 'read_failed',
      outcome: 'error',
      metadata: {
        providerId,
        reason: error instanceof Error ? error.message : 'Unknown provider memory read error',
      },
    });
    return [];
  }
}

export async function saveProviderMemory(item: ProviderMemoryItem) {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return;
    }

    const row = toProviderMemoryRow(item);
    const { error } = await supabaseAdmin.from('provider_memory').upsert(row, {
      onConflict: 'id',
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    logEvent({
      route: 'db/provider-memory',
      action: 'write_failed',
      outcome: 'error',
      metadata: {
        providerId: item.providerId,
        memoryId: item.id,
        reason: error instanceof Error ? error.message : 'Unknown provider memory write error',
      },
    });
  }
}

export async function deleteProviderMemory(memoryId: string, providerId?: string) {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return false;
    }

    let query = supabaseAdmin.from('provider_memory').delete().eq('id', memoryId);
    if (providerId) {
      query = query.eq('provider_id', providerId);
    }

    const { error } = await query;
    if (error) {
      throw error;
    }
    return true;
  } catch (error) {
    logEvent({
      route: 'db/provider-memory',
      action: 'delete_failed',
      outcome: 'error',
      metadata: {
        providerId: providerId || 'unknown',
        memoryId,
        reason: error instanceof Error ? error.message : 'Unknown provider memory delete error',
      },
    });
    return false;
  }
}
```

## 3. Updated Files

### `lib/monitoring/metrics-store.ts`

File: [metrics-store.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/monitoring/metrics-store.ts)

```ts
import { saveErrorMetric, saveEvalMetric, saveModelUsage, saveRequestMetric } from '@/lib/db/metrics-repo';
import type { ErrorMetric, EvalMetric, ModelUsageMetric, RequestMetric } from '@/lib/monitoring/metrics-types';

const requestMetrics: RequestMetric[] = [];
const errorMetrics: ErrorMetric[] = [];
const evalMetrics: EvalMetric[] = [];
const modelUsageMetrics: ModelUsageMetric[] = [];

const MAX_METRICS_PER_BUCKET = 500;

function pushBoundedMetric<T>(bucket: T[], metric: T) {
  bucket.push(metric);
  if (bucket.length > MAX_METRICS_PER_BUCKET) {
    bucket.splice(0, bucket.length - MAX_METRICS_PER_BUCKET);
  }
}

export function recordRequest(metric: RequestMetric) {
  pushBoundedMetric(requestMetrics, metric);
  void saveRequestMetric(metric);
}

export function recordError(metric: ErrorMetric) {
  pushBoundedMetric(errorMetrics, metric);
  void saveErrorMetric(metric);
}

export function recordEval(metric: EvalMetric) {
  pushBoundedMetric(evalMetrics, metric);
  void saveEvalMetric(metric);
}

export function recordModelUsage(metric: ModelUsageMetric) {
  pushBoundedMetric(modelUsageMetrics, metric);
  void saveModelUsage(metric);
}

export function getMetrics() {
  return {
    requests: [...requestMetrics],
    errors: [...errorMetrics],
    evals: [...evalMetrics],
    modelUsage: [...modelUsageMetrics],
  };
}
```

### `lib/veranote/memory/memory-store.ts`

File: [memory-store.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/veranote/memory/memory-store.ts)

```ts
import { deleteProviderMemory, getProviderMemory, saveProviderMemory } from '@/lib/db/memory-repo';
import type { ProviderMemoryItem } from '@/lib/veranote/memory/memory-types';

const providerMemoryStore = new Map<string, ProviderMemoryItem[]>();

function cloneItems(items: ProviderMemoryItem[]) {
  return items.map((item) => ({ ...item, tags: [...item.tags] }));
}

function readBucket(providerId: string) {
  return providerMemoryStore.get(providerId) || [];
}

export async function getMemory(providerId: string) {
  const persistedItems = await getProviderMemory(providerId);
  providerMemoryStore.set(providerId, cloneItems(persistedItems));
  return cloneItems(providerMemoryStore.get(providerId) || []);
}

export async function addMemory(item: ProviderMemoryItem) {
  const bucket = readBucket(item.providerId);
  const nextItem = { ...item, tags: [...item.tags] };
  providerMemoryStore.set(item.providerId, [...bucket, nextItem]);
  await saveProviderMemory(nextItem);
  return nextItem;
}

export async function updateMemory(item: ProviderMemoryItem) {
  const bucket = readBucket(item.providerId);
  const nextItem = { ...item, tags: [...item.tags] };
  const nextBucket = bucket.map((existing) => (existing.id === item.id ? nextItem : existing));
  providerMemoryStore.set(item.providerId, nextBucket);
  await saveProviderMemory(nextItem);
  return nextBucket.find((existing) => existing.id === item.id) || null;
}

export async function deleteMemory(id: string, providerId?: string) {
  if (providerId) {
    const bucket = readBucket(providerId);
    const nextBucket = bucket.filter((item) => item.id !== id);
    providerMemoryStore.set(providerId, nextBucket);
    const deleted = await deleteProviderMemory(id, providerId);
    return bucket.length !== nextBucket.length || deleted;
  }

  for (const [bucketProviderId, bucket] of providerMemoryStore.entries()) {
    const nextBucket = bucket.filter((item) => item.id !== id);
    if (nextBucket.length !== bucket.length) {
      providerMemoryStore.set(bucketProviderId, nextBucket);
      await deleteProviderMemory(id, bucketProviderId);
      return true;
    }
  }

  return deleteProviderMemory(id);
}
```

### `lib/audit/audit-log.ts`

File: [audit-log.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/audit/audit-log.ts)

```ts
import { saveAuditEvent } from '@/lib/db/audit-repo';

type AuditEvent = {
  userId: string;
  action: string;
  timestamp: string;
  route?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

const auditEvents: AuditEvent[] = [];

export function recordAuditEvent(event: {
  userId: string;
  action: string;
  timestamp?: string;
  route?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}) {
  const entry: AuditEvent = {
    userId: event.userId,
    action: event.action,
    timestamp: event.timestamp || new Date().toISOString(),
    ...(event.route ? { route: event.route } : {}),
    ...(event.metadata ? { metadata: event.metadata } : {}),
  };

  auditEvents.push(entry);
  void saveAuditEvent({
    timestamp: entry.timestamp,
    user_id: entry.userId,
    action: entry.action,
    route: entry.route,
    metadata: entry.metadata,
  });
  return entry;
}

export function listAuditEvents() {
  return [...auditEvents];
}
```

## 4. EXACT Code For One Metrics Insert, One Audit Insert, One Provider Memory Insert

### Request metric insert

```ts
export async function saveRequestMetric(metric: RequestMetric) {
  await insertMetric('request_metrics', {
    timestamp: metric.timestamp,
    route: metric.route,
    model: metric.model,
    latency_ms: metric.latencyMs,
    success: metric.success,
  });
}
```

### Error metric insert

```ts
export async function saveErrorMetric(metric: ErrorMetric) {
  await insertMetric('error_metrics', {
    timestamp: metric.timestamp,
    route: metric.route,
    error_type: metric.errorType,
    message: metric.message,
  });
}
```

### Audit log insert

```ts
const { error } = await supabaseAdmin.from('audit_logs').insert({
  timestamp: event.timestamp,
  user_id: event.user_id,
  action: event.action,
  route: event.route ?? null,
  metadata: sanitizeMetadata(event.metadata) ?? null,
});
```

### Provider memory insert

```ts
const row = toProviderMemoryRow(item);
const { error } = await supabaseAdmin.from('provider_memory').upsert(row, {
  onConflict: 'id',
});
```

## 5. Example DB Rows

### `request_metrics`

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

### `error_metrics`

```json
{
  "id": "3ae43a67-81c0-4667-b35b-b43b8738cb69",
  "timestamp": "2026-04-22T01:09:33.052Z",
  "route": "assistant/respond",
  "error_type": "Error",
  "message": "[NAME_1] DOB [DOB_1] invalid request payload"
}
```

### `eval_metrics`

```json
{
  "id": "9f4ba298-d28d-45fa-b640-facb2846570b",
  "timestamp": "2026-04-22T01:24:38.277Z",
  "passed": 19,
  "failed": 0
}
```

### `model_usage`

```json
{
  "id": "24bc3d9e-920c-4629-ad16-145ddb491c01",
  "timestamp": "2026-04-22T01:24:35.443Z",
  "model": "google/gemini-2.5-flash-lite",
  "tokens": null
}
```

### `audit_logs`

```json
{
  "id": "73e52d72-ec3e-4867-bfe0-ec1d35c5f860",
  "timestamp": "2026-04-22T01:24:35.443Z",
  "user_id": "eval-user",
  "action": "assistant_access",
  "route": "assistant/respond",
  "metadata": {
    "method": "POST"
  }
}
```

### `provider_memory`

```json
{
  "id": "memory-candidate:phrasing:use-patient-reports-phrasing",
  "provider_id": "provider-daniel-hale-beta",
  "category": "phrasing",
  "content": "Use \"Patient reports ...\" phrasing when summarizing subjective content supported by source.",
  "confidence": "low",
  "source": "learned",
  "tags": ["subjective", "patient-reports"],
  "created_at": "2026-04-22T01:24:28.521Z",
  "updated_at": "2026-04-22T01:24:28.521Z"
}
```

## 6. Execution Behavior

### Whether writes are blocking or async

Metrics and audit writes are async fire-and-forget:

```ts
export function recordRequest(metric: RequestMetric) {
  pushBoundedMetric(requestMetrics, metric);
  void saveRequestMetric(metric);
}
```

```ts
export function recordError(metric: ErrorMetric) {
  pushBoundedMetric(errorMetrics, metric);
  void saveErrorMetric(metric);
}
```

```ts
export function recordEval(metric: EvalMetric) {
  pushBoundedMetric(evalMetrics, metric);
  void saveEvalMetric(metric);
}
```

```ts
export function recordModelUsage(metric: ModelUsageMetric) {
  pushBoundedMetric(modelUsageMetrics, metric);
  void saveModelUsage(metric);
}
```

```ts
export function recordAuditEvent(event: { ... }) {
  ...
  void saveAuditEvent({
    timestamp: entry.timestamp,
    user_id: entry.userId,
    action: entry.action,
    route: entry.route,
    metadata: entry.metadata,
  });
  return entry;
}
```

Provider memory writes are awaited:

```ts
export async function addMemory(item: ProviderMemoryItem) {
  ...
  await saveProviderMemory(nextItem);
  return nextItem;
}
```

```ts
export async function updateMemory(item: ProviderMemoryItem) {
  ...
  await saveProviderMemory(nextItem);
  return nextBucket.find((existing) => existing.id === item.id) || null;
}
```

### How failures are handled

Metrics:

```ts
async function insertMetric(table: string, payload: Record<string, unknown>) {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return;
    }
    ...
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

Audit:

```ts
export async function saveAuditEvent(event: AuditEventRow) {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return;
    }
    ...
  } catch (error) {
    logEvent({
      route: 'db/audit',
      action: 'persist_failed',
      outcome: 'error',
      metadata: {
        reason: error instanceof Error ? error.message : 'Unknown audit persistence error',
      },
    });
  }
}
```

Memory:

```ts
export async function saveProviderMemory(item: ProviderMemoryItem) {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return;
    }
    ...
  } catch (error) {
    logEvent({
      route: 'db/provider-memory',
      action: 'write_failed',
      outcome: 'error',
      metadata: {
        providerId: item.providerId,
        memoryId: item.id,
        reason: error instanceof Error ? error.message : 'Unknown provider memory write error',
      },
    });
  }
}
```

### Whether system continues if DB fails

Yes.

DB unavailability short-circuits to `return` or `return []` / `return false`:

```ts
const supabaseAdmin = getSupabaseAdminClient();
if (!supabaseAdmin) {
  return;
}
```

```ts
const supabaseAdmin = getSupabaseAdminClient();
if (!supabaseAdmin) {
  return [];
}
```

```ts
const supabaseAdmin = getSupabaseAdminClient();
if (!supabaseAdmin) {
  return false;
}
```

## 7. PHI Safety Verification

### Confirmation

- No raw patient text is intentionally stored in metrics tables.
- Audit metadata is sanitized before insert.
- Provider memory content is sanitized before insert.
- No PHI entity maps are stored in these persistence tables.

Sanitizing audit metadata:

```ts
function sanitizeMetadata(metadata?: AuditEventRow['metadata']) {
  if (!metadata) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (typeof value === 'string') {
        return [key, sanitizeForLogging(value)];
      }
      return [key, value];
    }),
  );
}
```

Sanitizing provider memory content:

```ts
function toProviderMemoryRow(item: ProviderMemoryItem) {
  return {
    id: item.id,
    provider_id: item.providerId,
    category: item.category,
    content: sanitizeForLogging(item.content),
    confidence: item.confidence,
    source: item.source,
    tags: item.tags,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}
```

### One example row proving sanitization

```json
{
  "id": "8cf3e7d6-24df-4580-91e0-cf0a00cf7661",
  "timestamp": "2026-04-22T01:09:33.052Z",
  "route": "assistant/respond",
  "error_type": "Error",
  "message": "[NAME_1] DOB [DOB_1] invalid request payload"
}
```

Stored value is placeholder-based sanitized content.

No entity map is stored alongside it.

## 8. Known Gaps

- `metrics-store.ts` still keeps an in-memory copy for local reads by the monitoring endpoints.
- `audit-log.ts` still keeps an in-memory `auditEvents` array in addition to database persistence.
- Monitoring endpoints currently read only from in-memory metrics, not from Supabase-backed history.
- Drafts and other app data stores are not yet migrated in this step.
- Provider memory fetches are fully persisted, but route-local cache still exists in `memory-store.ts`.
- Metrics writes are one-row inserts with no batching.
- No retry queue exists for transient database failures.
- No pagination or archival policy exists for large metrics tables.
- No read-through persistence layer exists yet for monitoring dashboards to survive process restarts.
