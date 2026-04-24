import { recordRequest } from '@/lib/monitoring/metrics-store';

export function trackRequest(route: string, model: string, startTime: number) {
  return function finish(success: boolean) {
    recordRequest({
      timestamp: new Date().toISOString(),
      route,
      model,
      latencyMs: Math.max(Date.now() - startTime, 0),
      success,
    });
  };
}
