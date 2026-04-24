import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

function loadEnvFile(path: string) {
  const content = fs.readFileSync(path, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(new URL('../.env.local', import.meta.url).pathname);

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function authHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

async function pollTask(taskId: string, tries = 12) {
  for (let index = 0; index < tries; index += 1) {
    const { data } = await supabase.from('async_tasks').select('*').eq('id', taskId).maybeSingle();
    if (!data) {
      return { state: 'deleted', row: null };
    }
    if (data.status !== 'pending' && data.status !== 'processing') {
      return { state: data.status, row: data };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const { data } = await supabase.from('async_tasks').select('*').eq('id', taskId).maybeSingle();
  return { state: data?.status || 'missing', row: data || null };
}

function unwrapModule<T>(module: Record<string, unknown>): T {
  const defaultExport = module.default;
  if (defaultExport && typeof defaultExport === 'object') {
    return defaultExport as T;
  }

  return module as T;
}

async function main() {
  const [
    assistantRouteModuleImport,
    monitoringSummaryModuleImport,
    monitoringEvalsModuleImport,
    distributedRateLimiterModuleImport,
    persistentQueueModuleImport,
  ] = await Promise.all([
    import('../app/api/assistant/respond/route.ts'),
    import('../app/api/monitoring/summary/route.ts'),
    import('../app/api/monitoring/evals/route.ts'),
    import('../lib/resilience/distributed-rate-limiter.ts'),
    import('../lib/resilience/persistent-queue.ts'),
  ]);

  const assistantRouteModule = unwrapModule<{ POST: (request: Request) => Promise<Response> }>(assistantRouteModuleImport);
  const monitoringSummaryModule = unwrapModule<{ GET: (request: Request) => Promise<Response> }>(monitoringSummaryModuleImport);
  const monitoringEvalsModule = unwrapModule<{ GET: (request: Request) => Promise<Response> }>(monitoringEvalsModuleImport);
  const distributedRateLimiterModule = unwrapModule<{ checkDistributedRateLimit: (key: string) => Promise<boolean> }>(distributedRateLimiterModuleImport);
  const persistentQueueModule = unwrapModule<{ enqueueTask: (type: string, payload: Record<string, unknown>) => Promise<void> }>(persistentQueueModuleImport);

  const { POST: postAssistant } = assistantRouteModule;
  const { GET: getMonitoringSummary } = monitoringSummaryModule;
  const { GET: getMonitoringEvals } = monitoringEvalsModule;
  const { checkDistributedRateLimit } = distributedRateLimiterModule;
  const { enqueueTask } = persistentQueueModule;
  const providerToken = process.env.VERANOTE_PROVIDER_TOKEN || 'veranote-provider-token';
  const adminToken = process.env.VERANOTE_ADMIN_TOKEN || 'veranote-admin-token';
  const verificationKey = `verify-step8-${Date.now()}`;

  await supabase.from('rate_limits').delete().eq('key', verificationKey);

  const successResponse = await postAssistant(new Request('http://localhost/api/assistant/respond?eval=true', {
    method: 'POST',
    headers: authHeaders(providerToken),
    body: JSON.stringify({
      stage: 'review',
      mode: 'workflow-help',
      message: 'What is today?',
    }),
  }));
  const successPayload = await successResponse.json();

  const errorResponse = await postAssistant(new Request('http://localhost/api/assistant/respond?eval=true', {
    method: 'POST',
    headers: authHeaders(providerToken),
    body: JSON.stringify({
      stage: 'review',
      mode: 'workflow-help',
      model: 'forbidden-model-field',
      message: 'hello',
    }),
  }));
  const errorPayload = await errorResponse.json();

  await checkDistributedRateLimit(verificationKey);
  await checkDistributedRateLimit(verificationKey);
  const { data: incrementedRateLimit } = await supabase.from('rate_limits').select('*').eq('key', verificationKey).maybeSingle();

  await supabase.from('rate_limits').upsert({
    key: verificationKey,
    count: 60,
    window_start: new Date().toISOString(),
  });

  let rateLimitBlockError: string | null = null;
  try {
    await checkDistributedRateLimit(verificationKey);
  } catch (error) {
    rateLimitBlockError = error instanceof Error ? error.message : String(error);
  }

  const queueMarker = crypto.randomUUID();
  await enqueueTask('metric_insert', {
    table: null,
    payload: {
      bad: true,
      marker: queueMarker,
    },
  } as unknown as Record<string, unknown>);

  const { data: queueBefore } = await supabase
    .from('async_tasks')
    .select('*')
    .eq('payload->payload->>marker', queueMarker)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const queueAfter = queueBefore ? await pollTask(queueBefore.id) : { state: 'missing', row: null };

  const monitoringSummaryResponse = await getMonitoringSummary(new Request('http://localhost/api/monitoring/summary', {
    headers: {
      authorization: `Bearer ${adminToken}`,
    },
  }));
  const monitoringSummary = await monitoringSummaryResponse.json();

  const monitoringEvalsResponse = await getMonitoringEvals(new Request('http://localhost/api/monitoring/evals', {
    headers: {
      authorization: `Bearer ${adminToken}`,
    },
  }));
  const monitoringEvals = await monitoringEvalsResponse.json();

  const [requestMetrics, errorMetrics, evalMetrics, modelUsage, asyncTasks] = await Promise.all([
    supabase.from('request_metrics').select('*').order('timestamp', { ascending: false }).limit(3),
    supabase.from('error_metrics').select('*').order('timestamp', { ascending: false }).limit(3),
    supabase.from('eval_metrics').select('*').order('timestamp', { ascending: false }).limit(3),
    supabase.from('model_usage').select('*').order('timestamp', { ascending: false }).limit(3),
    supabase.from('async_tasks').select('*').order('created_at', { ascending: false }).limit(5),
  ]);

  console.log(JSON.stringify({
    successRequest: {
      status: successResponse.status,
      payload: successPayload,
    },
    validationError: {
      status: errorResponse.status,
      payload: errorPayload,
    },
    rateLimit: {
      incrementedRateLimit,
      blockError: rateLimitBlockError,
    },
    queue: {
      before: queueBefore,
      after: queueAfter,
    },
    monitoring: {
      summary: monitoringSummary,
      evals: monitoringEvals,
    },
    rows: {
      request_metrics: requestMetrics.data,
      error_metrics: errorMetrics.data,
      eval_metrics: evalMetrics.data,
      model_usage: modelUsage.data,
      async_tasks: asyncTasks.data,
    },
  }, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
