import { getSupabaseAdminClient } from '@/lib/db/supabase-client';
import { enqueueTask } from '@/lib/resilience/persistent-queue';
import { withBackoffRetry } from '@/lib/resilience/backoff-retry';
import { logEvent } from '@/lib/security/safe-logger';
import type { ErrorMetric, EvalMetric, ModelUsageMetric, RequestMetric } from '@/lib/monitoring/metrics-types';

const CLEANUP_INTERVAL_MS = 12 * 60 * 60 * 1000;

let lastCleanupQueuedAt = 0;

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

function scheduleMetricsCleanupIfNeeded() {
  const now = Date.now();
  if (now - lastCleanupQueuedAt < CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanupQueuedAt = now;
  void cleanupOldMetrics();
}

export async function saveRequestMetric(metric: RequestMetric) {
  scheduleMetricsCleanupIfNeeded();
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

export async function saveErrorMetric(metric: ErrorMetric) {
  scheduleMetricsCleanupIfNeeded();
  try {
    await enqueueTask('metric_insert', {
      table: 'error_metrics',
      payload: {
        timestamp: metric.timestamp,
        route: metric.route,
        error_type: metric.errorType,
        message: metric.message,
      },
    });
  } catch (error) {
    logEvent({
      route: 'db/metrics',
      action: 'queue_failed',
      outcome: 'error',
      metadata: {
        table: 'error_metrics',
        reason: error instanceof Error ? error.message : 'Unknown metrics queue error',
      },
    });
  }
}

export async function saveEvalMetric(metric: EvalMetric) {
  scheduleMetricsCleanupIfNeeded();
  try {
    await enqueueTask('metric_insert', {
      table: 'eval_metrics',
      payload: {
        timestamp: metric.timestamp,
        passed: metric.passed,
        failed: metric.failed,
      },
    });
  } catch (error) {
    logEvent({
      route: 'db/metrics',
      action: 'queue_failed',
      outcome: 'error',
      metadata: {
        table: 'eval_metrics',
        reason: error instanceof Error ? error.message : 'Unknown metrics queue error',
      },
    });
  }
}

export async function saveModelUsage(metric: ModelUsageMetric) {
  scheduleMetricsCleanupIfNeeded();
  try {
    await enqueueTask('metric_insert', {
      table: 'model_usage',
      payload: {
        timestamp: metric.timestamp,
        model: metric.model,
        tokens: metric.tokens ?? null,
      },
    });
  } catch (error) {
    logEvent({
      route: 'db/metrics',
      action: 'queue_failed',
      outcome: 'error',
      metadata: {
        table: 'model_usage',
        reason: error instanceof Error ? error.message : 'Unknown metrics queue error',
      },
    });
  }
}

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
