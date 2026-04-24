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
