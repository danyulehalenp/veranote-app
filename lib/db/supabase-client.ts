import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isRetryableTransientError, withBackoffRetry } from '@/lib/resilience/backoff-retry';

type DatabaseClient = SupabaseClient;

let cachedSupabase: DatabaseClient | null | undefined;
let cachedSupabaseAdmin: DatabaseClient | null | undefined;

const RETRYABLE_READ_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);

class RetryableSupabaseStatusError extends Error {
  status: number;

  constructor(status: number) {
    super(`Supabase request returned retryable status ${status}.`);
    this.name = 'RetryableSupabaseStatusError';
    this.status = status;
  }
}

function getRequestMethod(init?: RequestInit) {
  return (init?.method || 'GET').toUpperCase();
}

function isReadLikeMethod(method: string) {
  return method === 'GET' || method === 'HEAD';
}

function buildRetryingSupabaseFetch() {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = getRequestMethod(init);

    return withBackoffRetry(async () => {
      const response = await fetch(input, init);
      if (isReadLikeMethod(method) && RETRYABLE_READ_STATUS.has(response.status)) {
        throw new RetryableSupabaseStatusError(response.status);
      }

      return response;
    }, {
      retries: 2,
      baseDelayMs: 150,
      maxDelayMs: 750,
      shouldRetry: isRetryableTransientError,
    });
  };
}

function buildClient(key: string | undefined) {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = key?.trim();

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: buildRetryingSupabaseFetch(),
    },
  });
}

export function getSupabaseClient() {
  if (cachedSupabase === undefined) {
    cachedSupabase = buildClient(process.env.SUPABASE_ANON_KEY);
  }

  return cachedSupabase;
}

export function getSupabaseAdminClient() {
  if (cachedSupabaseAdmin === undefined) {
    cachedSupabaseAdmin = buildClient(process.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  return cachedSupabaseAdmin;
}

export const supabase = new Proxy({} as DatabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error('Supabase client is unavailable because SUPABASE_URL or SUPABASE_ANON_KEY is missing.');
    }

    return Reflect.get(client, prop, receiver);
  },
});

export const supabaseAdmin = new Proxy({} as DatabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseAdminClient();
    if (!client) {
      throw new Error('Supabase admin client is unavailable because SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
    }

    return Reflect.get(client, prop, receiver);
  },
});
