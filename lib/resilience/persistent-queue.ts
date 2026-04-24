import { getSupabaseAdminClient } from '@/lib/db/supabase-client';
import { withBackoffRetry } from '@/lib/resilience/backoff-retry';
import { sanitizeForLogging } from '@/lib/security/phi-sanitizer';

type AsyncTaskRow = {
  id: string;
  type: string | null;
  payload: Record<string, unknown> | null;
  status: string | null;
  created_at: string | null;
  attempts?: number | null;
  last_error?: string | null;
  updated_at?: string | null;
};

export type QueueDrainResult = {
  processedCount: number;
  failedCount: number;
  retriedCount: number;
  remainingPendingCount: number;
  batchesRun: number;
};

let isProcessing = false;

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 25;
const DEFAULT_MAX_BATCHES = 10;
const STUCK_PROCESSING_MS = 5 * 60 * 1000;

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

function isStuckProcessingTask(task: AsyncTaskRow, nowMs: number) {
  if (task.status !== 'processing') {
    return false;
  }

  const updatedAtMs = task.updated_at ? new Date(task.updated_at).getTime() : NaN;
  if (Number.isNaN(updatedAtMs)) {
    return true;
  }

  return nowMs - updatedAtMs >= STUCK_PROCESSING_MS;
}

export async function countPendingTasks() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return 0;
  }

  const { count, error } = await supabase
    .from('async_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) {
    throw error;
  }

  return count || 0;
}

export async function recoverStuckProcessingTasks() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { retriedCount: 0, failedCount: 0 };
  }

  const { data, error } = await supabase
    .from('async_tasks')
    .select('*')
    .eq('status', 'processing')
    .order('updated_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    throw error;
  }

  const now = new Date();
  const nowMs = now.getTime();
  let retriedCount = 0;
  let failedCount = 0;

  for (const task of (data || []) as AsyncTaskRow[]) {
    if (!isStuckProcessingTask(task, nowMs)) {
      continue;
    }

    const attempts = task.attempts || 0;
    const nextAttempts = attempts + 1;

    if (nextAttempts >= MAX_ATTEMPTS) {
      const { error: updateError } = await supabase
        .from('async_tasks')
        .update({
          status: 'failed',
          attempts: nextAttempts,
          updated_at: now.toISOString(),
        })
        .eq('id', task.id);

      if (updateError) {
        throw updateError;
      }

      failedCount += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from('async_tasks')
      .update({
        status: 'pending',
        attempts: nextAttempts,
        updated_at: now.toISOString(),
      })
      .eq('id', task.id);

    if (updateError) {
      throw updateError;
    }

    retriedCount += 1;
  }

  return { retriedCount, failedCount };
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
    updated_at: new Date().toISOString(),
    attempts: 0,
    last_error: null,
  });

  if (error) {
    throw error;
  }

  void drainQueue();
}

export async function processQueue() {
  const supabase = getSupabaseAdminClient();
  if (!supabase || isProcessing) {
    return {
      processedCount: 0,
      failedCount: 0,
      retriedCount: 0,
      remainingPendingCount: 0,
      batchesRun: 0,
    } satisfies QueueDrainResult;
  }

  isProcessing = true;

  try {
    const recovery = await recoverStuckProcessingTasks();
    const { data, error } = await supabase
      .from('async_tasks')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      throw error;
    }

    const tasks = (data || []) as AsyncTaskRow[];
    let processedCount = 0;
    let failedCount = recovery.failedCount;
    for (const task of tasks) {
      const attempts = task.attempts || 0;

      if (attempts >= MAX_ATTEMPTS) {
        const { error: markFailedError } = await supabase.from('async_tasks').update({
          status: 'failed',
          updated_at: new Date().toISOString(),
          last_error: task.last_error || 'Max attempts reached before processing.',
        }).eq('id', task.id);

        if (markFailedError) {
          throw markFailedError;
        }

        failedCount += 1;
        continue;
      }

      try {
        const nextAttempts = attempts + 1;
        const { error: processingError } = await supabase.from('async_tasks').update({
          status: 'processing',
          attempts: nextAttempts,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq('id', task.id);

        if (processingError) {
          throw processingError;
        }

        await handleTask(task);
        const { error: deleteError } = await supabase.from('async_tasks').delete().eq('id', task.id);
        if (deleteError) {
          throw deleteError;
        }
        processedCount += 1;
      } catch (error) {
        const nextAttempts = attempts + 1;
        const shouldFail = nextAttempts >= MAX_ATTEMPTS;
        const { error: updateError } = await supabase.from('async_tasks').update({
          status: shouldFail ? 'failed' : 'pending',
          last_error: sanitizeForLogging(error instanceof Error ? error.message : 'Unknown async task error'),
          updated_at: new Date().toISOString(),
        }).eq('id', task.id);

        if (updateError) {
          throw updateError;
        }

        if (shouldFail) {
          failedCount += 1;
        }
      }
    }

    const remainingPendingCount = await countPendingTasks();

    return {
      processedCount,
      failedCount,
      retriedCount: recovery.retriedCount,
      remainingPendingCount,
      batchesRun: 1,
    } satisfies QueueDrainResult;
  } finally {
    isProcessing = false;
  }
}

export async function drainQueue(maxBatches = DEFAULT_MAX_BATCHES): Promise<QueueDrainResult> {
  let processedCount = 0;
  let failedCount = 0;
  let retriedCount = 0;
  let remainingPendingCount = 0;
  let batchesRun = 0;

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const batchResult = await processQueue();
    processedCount += batchResult.processedCount;
    failedCount += batchResult.failedCount;
    retriedCount += batchResult.retriedCount;
    remainingPendingCount = batchResult.remainingPendingCount;
    batchesRun += batchResult.batchesRun;

    if (remainingPendingCount === 0 || batchResult.batchesRun === 0) {
      break;
    }
  }

  return {
    processedCount,
    failedCount,
    retriedCount,
    remainingPendingCount,
    batchesRun,
  };
}
