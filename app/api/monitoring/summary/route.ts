import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/auth-middleware';
import { requireRole } from '@/lib/auth/role-check';
import { getSupabaseAdminClient } from '@/lib/db/supabase-client';
import { applyLimit } from '@/lib/db/query-utils';
import { getMetrics } from '@/lib/monitoring/metrics-store';

function countByModel(items: Array<{ model: string }>) {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item.model] = (counts[item.model] || 0) + 1;
    return counts;
  }, {});
}

const MODEL_BREAKDOWN_BATCH_SIZE = 1000;

async function fetchModelBreakdown(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  table: 'request_metrics' | 'model_usage',
) {
  const counts: Record<string, number> = {};
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('model')
      .order('id', { ascending: true })
      .range(from, from + MODEL_BREAKDOWN_BATCH_SIZE - 1);

    if (error) {
      throw error;
    }

    const rows = data || [];
    for (const row of rows) {
      if (!row.model) {
        continue;
      }

      counts[row.model] = (counts[row.model] || 0) + 1;
    }

    if (rows.length < MODEL_BREAKDOWN_BATCH_SIZE) {
      break;
    }

    from += MODEL_BREAKDOWN_BATCH_SIZE;
  }

  return counts;
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
      pendingTaskCount: 0,
      processingTaskCount: 0,
      failedTaskCount: 0,
      oldestPendingTaskAgeMs: null,
      requestsByModel: countByModel(metrics.requests),
      modelUsageByModel: countByModel(metrics.modelUsage),
      recentErrors: metrics.errors.slice(-10),
      recentFailedTasks: [],
    });
  }

  try {
    const [
      { count: requestCount, error: requestCountError },
      { count: successCount, error: successCountError },
      { count: errorCount, error: errorCountError },
      { count: modelUsageCount, error: modelUsageCountError },
      { count: pendingTaskCount, error: pendingTaskCountError },
      { count: processingTaskCount, error: processingTaskCountError },
      { count: failedTaskCount, error: failedTaskCountError },
      requestsByModel,
      { data: errors, error: errorsError },
      modelUsageByModel,
      { data: failedTasks, error: failedTasksError },
      { data: oldestPendingTaskRows, error: oldestPendingTaskError },
    ] = await Promise.all([
      supabase.from('request_metrics').select('id', { count: 'exact', head: true }),
      supabase.from('request_metrics').select('id', { count: 'exact', head: true }).eq('success', true),
      supabase.from('error_metrics').select('id', { count: 'exact', head: true }),
      supabase.from('model_usage').select('id', { count: 'exact', head: true }),
      supabase.from('async_tasks').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('async_tasks').select('id', { count: 'exact', head: true }).eq('status', 'processing'),
      supabase.from('async_tasks').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      fetchModelBreakdown(supabase, 'request_metrics'),
      applyLimit(supabase.from('error_metrics').select('*').order('timestamp', { ascending: false }), 10),
      fetchModelBreakdown(supabase, 'model_usage'),
      applyLimit(
        supabase
          .from('async_tasks')
          .select('id, type, status, created_at, updated_at, attempts, last_error')
          .eq('status', 'failed')
          .order('updated_at', { ascending: false }),
        5,
      ),
      applyLimit(
        supabase
          .from('async_tasks')
          .select('created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: true }),
        1,
      ),
    ]);

    if (
      requestCountError
      || successCountError
      || errorCountError
      || modelUsageCountError
      || pendingTaskCountError
      || processingTaskCountError
      || failedTaskCountError
      || errorsError
      || failedTasksError
      || oldestPendingTaskError
    ) {
      throw requestCountError || successCountError || errorCountError || modelUsageCountError || pendingTaskCountError || processingTaskCountError || failedTaskCountError || errorsError || failedTasksError || oldestPendingTaskError;
    }

    const errorRows = errors || [];
    const failedTaskRows = (failedTasks || []).map((task) => ({
      id: task.id,
      type: task.type || 'unknown',
      status: task.status || 'failed',
      createdAt: task.created_at || new Date(0).toISOString(),
      updatedAt: task.updated_at || task.created_at || new Date(0).toISOString(),
      attempts: typeof task.attempts === 'number' ? task.attempts : 0,
      lastError: task.last_error || undefined,
    }));
    const totalRequestCount = requestCount || 0;
    const totalSuccessCount = successCount || 0;
    const failureCount = totalRequestCount - totalSuccessCount;
    const oldestPendingTaskCreatedAt = oldestPendingTaskRows?.[0]?.created_at || null;
    const oldestPendingTaskAgeMs = oldestPendingTaskCreatedAt
      ? Math.max(0, Date.now() - new Date(oldestPendingTaskCreatedAt).getTime())
      : null;

    return NextResponse.json({
      requestCount: totalRequestCount,
      successCount: totalSuccessCount,
      failureCount,
      errorCount: errorCount || 0,
      modelUsageCount: modelUsageCount || 0,
      pendingTaskCount: pendingTaskCount || 0,
      processingTaskCount: processingTaskCount || 0,
      failedTaskCount: failedTaskCount || 0,
      oldestPendingTaskAgeMs,
      requestsByModel,
      modelUsageByModel,
      recentErrors: errorRows,
      recentFailedTasks: failedTaskRows,
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
      pendingTaskCount: 0,
      processingTaskCount: 0,
      failedTaskCount: 0,
      oldestPendingTaskAgeMs: null,
      requestsByModel: countByModel(metrics.requests),
      modelUsageByModel: countByModel(metrics.modelUsage),
      recentErrors: metrics.errors.slice(-10),
      recentFailedTasks: [],
    });
  }
}
