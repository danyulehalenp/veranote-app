export type BackoffRetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

const DEFAULT_RETRIES = 3;

export function isRetryableTransientError(error: unknown) {
  const errorLike = error as {
    code?: unknown;
    cause?: unknown;
    message?: unknown;
    name?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  const cause = errorLike?.cause as { code?: unknown; message?: unknown; name?: unknown } | undefined;
  const status = typeof errorLike?.status === 'number'
    ? errorLike.status
    : typeof errorLike?.statusCode === 'number'
      ? errorLike.statusCode
      : null;
  const code = [
    errorLike?.code,
    cause?.code,
  ].filter(Boolean).join(' ').toUpperCase();
  const message = [
    errorLike?.name,
    errorLike?.message,
    cause?.name,
    cause?.message,
    error instanceof Error ? error.message : '',
    JSON.stringify(error),
  ].filter(Boolean).join(' ').toLowerCase();

  if (status && [408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524].includes(status)) {
    return true;
  }

  return [
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'ENETUNREACH',
  ].some((marker) => code.includes(marker))
    || [
      'fetch failed',
      'network error',
      'networkerror',
      'connection timeout',
      'connect timeout',
      'headers timeout',
      'socket hang up',
      'temporarily unavailable',
      'the operation was aborted',
    ].some((marker) => message.includes(marker));
}

export async function withBackoffRetry<T>(
  fn: () => Promise<T>,
  retriesOrOptions: number | BackoffRetryOptions = DEFAULT_RETRIES,
): Promise<T> {
  const options = typeof retriesOrOptions === 'number'
    ? { retries: retriesOrOptions }
    : retriesOrOptions;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 1000;
  const shouldRetry = options.shouldRetry ?? (() => true);
  let attempt = 0;

  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error, attempt + 1)) {
        throw error;
      }

      const delay = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
}
