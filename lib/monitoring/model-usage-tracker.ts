import { recordModelUsage as recordModelUsageMetric } from '@/lib/monitoring/metrics-store';

export function trackModelUsage(model: string, tokens?: number) {
  recordModelUsageMetric({
    timestamp: new Date().toISOString(),
    model,
    ...(typeof tokens === 'number' ? { tokens } : {}),
  });
}
