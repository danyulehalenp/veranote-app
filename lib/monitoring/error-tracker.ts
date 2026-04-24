import { recordError } from '@/lib/monitoring/metrics-store';
import { sanitizeForLogging } from '@/lib/security/phi-sanitizer';

export function trackError(route: string, error: unknown) {
  const normalizedError = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');

  recordError({
    timestamp: new Date().toISOString(),
    route,
    errorType: normalizedError.name || 'Error',
    message: sanitizeForLogging(normalizedError.message),
  });
}
