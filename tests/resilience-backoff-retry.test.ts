import { describe, expect, it, vi } from 'vitest';

import { isRetryableTransientError, withBackoffRetry } from '@/lib/resilience/backoff-retry';

describe('backoff retry resilience', () => {
  it('retries transient Supabase/Undici connection timeouts before returning success', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('fetch failed'), {
        cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
      }))
      .mockResolvedValueOnce('stored');

    await expect(withBackoffRetry(operation, {
      retries: 2,
      baseDelayMs: 0,
      shouldRetry: isRetryableTransientError,
    })).resolves.toBe('stored');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient durable storage validation failures', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('duplicate key violates unique constraint'));

    await expect(withBackoffRetry(operation, {
      retries: 3,
      baseDelayMs: 0,
      shouldRetry: isRetryableTransientError,
    })).rejects.toThrow('duplicate key');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('classifies retryable storage/network failures without treating normal client errors as transient', () => {
    expect(isRetryableTransientError(Object.assign(new Error('fetch failed'), {
      cause: { code: 'UND_ERR_SOCKET' },
    }))).toBe(true);
    expect(isRetryableTransientError({ status: 503, message: 'Service unavailable' })).toBe(true);
    expect(isRetryableTransientError({ status: 400, message: 'Invalid provider id' })).toBe(false);
  });
});
