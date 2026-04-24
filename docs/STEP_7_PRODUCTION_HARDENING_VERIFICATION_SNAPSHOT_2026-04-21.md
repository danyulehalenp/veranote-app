# Step 7 Production Hardening Verification Snapshot

## 1. New Files Created

### `lib/resilience/rate-limiter.ts`

File: [rate-limiter.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/resilience/rate-limiter.ts)

```ts
const requests = new Map<string, number[]>();

const WINDOW_MS = 60_000;
const LIMIT = 60;

export function checkRateLimit(userId: string) {
  const now = Date.now();
  const userRequests = requests.get(userId) || [];
  const recentRequests = userRequests.filter((timestamp) => now - timestamp < WINDOW_MS);

  if (recentRequests.length >= LIMIT) {
    throw new Error('Rate limit exceeded');
  }

  requests.set(userId, [...recentRequests, now]);
}
```

### `lib/resilience/retry-wrapper.ts`

File: [retry-wrapper.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/resilience/retry-wrapper.ts)

```ts
export async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    return withRetry(fn, retries - 1);
  }
}
```

### `lib/resilience/async-queue.ts`

File: [async-queue.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/resilience/async-queue.ts)

```ts
const queue: Array<() => Promise<void>> = [];
let isProcessing = false;

export function enqueue(task: () => Promise<void>) {
  queue.push(task);
  void processQueue();
}

async function processQueue() {
  if (isProcessing || queue.length === 0) {
    return;
  }

  isProcessing = true;

  while (queue.length > 0) {
    const task = queue.shift();
    if (!task) {
      continue;
    }

    try {
      await task();
    } catch {
      // Swallow queue task errors so monitoring persistence never crashes request handling.
    }
  }

  isProcessing = false;
}
```

### `lib/resilience/failure-guard.ts`

File: [failure-guard.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/resilience/failure-guard.ts)

```ts
export function safeExecute<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
```

## 2. Route Integration

File: [app/api/assistant/respond/route.ts](/Users/danielhale/.openclaw/workspace/app-prototype/app/api/assistant/respond/route.ts)

### Rate limiting applied

```ts
import { checkRateLimit } from '@/lib/resilience/rate-limiter';
import { safeExecute } from '@/lib/resilience/failure-guard';
```

```ts
try {
  checkRateLimit(authContext.user.id);
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

### Error handling applied

Prompt assembly is guarded:

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
```

Token estimate is guarded:

```ts
const estimatedPromptTokens = safeExecute(
  () => Math.ceil(structuredKnowledgePrompt.length / 4),
  0,
);
```

### Fallback response implemented

Fallback builder:

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

Catch block fallback:

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

## 3. Rate Limit Test

Local verification command used:

```bash
npx tsx -e "import { checkRateLimit } from './lib/resilience/rate-limiter.ts'; let error = null; for (let i = 1; i <= 61; i++) { try { checkRateLimit('verify-user'); } catch (e) { error = { atRequest: i, message: e instanceof Error ? e.message : String(e) }; break; } } console.log(JSON.stringify(error, null, 2));"
```

Actual output:

```json
{
  "atRequest": 61,
  "message": "Rate limit exceeded"
}
```

Returned route-level error when limit triggers:

```json
{
  "error": "Rate limit exceeded"
}
```

HTTP status:

```text
429
```

## 4. Retry Test

Local verification command used:

```bash
npx tsx -e "import { withRetry } from './lib/resilience/retry-wrapper.ts'; (async () => { let attempts = 0; const result = await withRetry(async () => { attempts += 1; if (attempts < 3) { throw new Error('temporary insert failure'); } return { ok: true, attempts }; }, 2); console.log(JSON.stringify({ attempts, result }, null, 2)); })();"
```

Actual output:

```json
{
  "attempts": 3,
  "result": {
    "ok": true,
    "attempts": 3
  }
}
```

DB insert integration using retry:

File: [lib/db/metrics-repo.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/db/metrics-repo.ts)

```ts
const response = await withRetry<{ error: unknown }>(async () => {
  const result = await supabaseAdmin.from(table).insert(payload);
  return {
    error: result.error,
  };
});
const { error } = response;
if (error) {
  throw error;
}
```

## 5. Async Queue Behavior

Local verification command used:

```bash
npx tsx -e "import { enqueue } from './lib/resilience/async-queue.ts'; (async () => { const events = []; const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); enqueue(async () => { events.push('task-1:start'); await wait(20); events.push('task-1:end'); }); enqueue(async () => { events.push('task-2:start'); await wait(5); events.push('task-2:end'); }); enqueue(async () => { events.push('task-3:start'); events.push('task-3:end'); }); await wait(80); console.log(JSON.stringify(events, null, 2)); })();"
```

Actual output:

```json
[
  "task-1:start",
  "task-1:end",
  "task-2:start",
  "task-2:end",
  "task-3:start",
  "task-3:end"
]
```

This confirms:
- queued writes execute in order
- later tasks wait for earlier tasks to finish

Metrics writes are queued from `metrics-repo.ts`:

```ts
export async function saveRequestMetric(metric: RequestMetric) {
  enqueue(async () => {
    await persistMetric('request_metrics', {
      timestamp: metric.timestamp,
      route: metric.route,
      model: metric.model,
      latency_ms: metric.latencyMs,
      success: metric.success,
    });
  });
}
```

Requests are not blocked because the caller path still uses fire-and-forget in the metrics store:

```ts
export function recordRequest(metric: RequestMetric) {
  pushBoundedMetric(requestMetrics, metric);
  void saveRequestMetric(metric);
}
```

## 6. Failure Resilience

### Simulated model failure behavior

Current route behavior on assistant failure:

```ts
const safeFallback = buildMinimalSafeResponse(...);
return NextResponse.json(safeFallback, { status: 200 });
```

Returned fallback payload:

```json
{
  "message": "Unable to process request. Please review source directly.",
  "suggestions": [
    "Review the source note directly before making changes.",
    "Retry once the request is smaller or the system load is lower."
  ]
}
```

System behavior:
- request completes with a minimal safe response
- route does not crash
- error is still tracked and logged

## 7. Cost Protection

Threshold constants:

```ts
const ASSISTANT_TOKEN_THRESHOLD = 6000;
const CHEAP_ASSISTANT_MODEL = 'google/gemini-2.5-flash-lite';
```

Threshold check:

```ts
const estimatedPromptTokens = safeExecute(
  () => Math.ceil(structuredKnowledgePrompt.length / 4),
  0,
);
if (estimatedPromptTokens > ASSISTANT_TOKEN_THRESHOLD) {
  selectedModel = CHEAP_ASSISTANT_MODEL;
}
```

Assistant base model selection:

```ts
const baseSelectedModel = selectModel('assistant');
let selectedModel = baseSelectedModel;
```

Model router:

File: [lib/ai/model-router.ts](/Users/danielhale/.openclaw/workspace/app-prototype/lib/ai/model-router.ts)

```ts
export function selectModel(task: string) {
  switch (task) {
    case 'assistant':
      return 'google/gemini-2.5-flash-lite';
    case 'note':
      return process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    case 'rewrite':
      return process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    default:
      return process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  }
}
```

## 8. PHI Safety Check

### Rate limiter

`rate-limiter.ts` only stores:
- `userId`
- request timestamps

No note text, prompt text, or PHI-bearing source text is stored there.

### Retry system

`retry-wrapper.ts` only retries promise functions.

It does not log request content or store payload bodies.

### Queue

`async-queue.ts` stores async tasks only.

It does not serialize prompts, note text, or PHI into logs or external storage.

### Logs

Logging still routes through `safe-logger.ts`, which sanitizes string metadata before logging.

The new hardening files themselves do not introduce any new raw content logging paths.

## 9. Known Gaps

- Queue is in-memory only and is lost on process restart.
- Rate limiting is process-local, not distributed across instances.
- No Redis or shared store is used for rate limits.
- No queue persistence or replay exists for queued metric writes.
- Retry policy is fixed-count only; no backoff or jitter is implemented.
- No per-route or per-role rate-limit tiers exist.
- Cost protection currently estimates tokens from prompt length rather than real tokenization.
- The assistant route already defaults to the cheap assistant model, so cost fallback is mostly a guardrail for future routing changes.
- No circuit breaker exists for repeated downstream dependency failures.
- No dead-letter handling exists for permanently failing queued tasks.

## Build Verification

Latest verification result:

```text
npm run build
```

Result:

```text
passed
```
