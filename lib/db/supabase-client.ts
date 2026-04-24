import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type DatabaseClient = SupabaseClient;

let cachedSupabase: DatabaseClient | null | undefined;
let cachedSupabaseAdmin: DatabaseClient | null | undefined;

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
