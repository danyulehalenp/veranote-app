import { getSupabaseAdminClient } from '@/lib/db/supabase-client';

const WINDOW_MS = 60_000;
const LIMIT = 60;

type RateLimitRow = {
  key: string;
  count: number | null;
  window_start: string | null;
};

export async function checkDistributedRateLimit(key: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return false;
  }

  const now = new Date();
  const { data, error } = await supabase
    .from('rate_limits')
    .select('*')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as RateLimitRow | null;
  if (!row || !row.window_start) {
    const { error: insertError } = await supabase.from('rate_limits').upsert({
      key,
      count: 1,
      window_start: now.toISOString(),
    });

    if (insertError) {
      throw insertError;
    }
    return true;
  }

  const windowStart = new Date(row.window_start);
  const windowExpired = Number.isNaN(windowStart.getTime()) || now.getTime() - windowStart.getTime() >= WINDOW_MS;

  if (windowExpired) {
    const { error: resetError } = await supabase.from('rate_limits').upsert({
      key,
      count: 1,
      window_start: now.toISOString(),
    });

    if (resetError) {
      throw resetError;
    }
    return true;
  }

  const count = row.count || 0;
  if (count >= LIMIT) {
    throw new Error('Rate limit exceeded');
  }

  const { error: updateError } = await supabase
    .from('rate_limits')
    .update({
      count: count + 1,
    })
    .eq('key', key);

  if (updateError) {
    throw updateError;
  }

  return true;
}
