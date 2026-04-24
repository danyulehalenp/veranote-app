import { withBackoffRetry } from '@/lib/resilience/backoff-retry';

export async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  return withBackoffRetry(fn, retries);
}
