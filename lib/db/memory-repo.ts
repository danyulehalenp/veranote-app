import { getSupabaseAdminClient } from '@/lib/db/supabase-client';
import { sanitizeForLogging } from '@/lib/security/phi-sanitizer';
import { logEvent } from '@/lib/security/safe-logger';
import type { ProviderMemoryItem } from '@/lib/veranote/memory/memory-types';

type ProviderMemoryRow = {
  id: string;
  provider_id: string;
  category: string;
  content: string;
  confidence: string;
  source: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string | null;
};

function toProviderMemoryItem(row: ProviderMemoryRow): ProviderMemoryItem {
  return {
    id: row.id,
    providerId: row.provider_id,
    category: row.category as ProviderMemoryItem['category'],
    content: row.content,
    confidence: row.confidence as ProviderMemoryItem['confidence'],
    source: (row.source || 'manual') as ProviderMemoryItem['source'],
    tags: row.tags || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

function toProviderMemoryRow(item: ProviderMemoryItem) {
  return {
    id: item.id,
    provider_id: item.providerId,
    category: item.category,
    content: sanitizeForLogging(item.content),
    confidence: item.confidence,
    source: item.source,
    tags: item.tags,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

export async function getProviderMemory(providerId: string) {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return [];
    }

    const { data, error } = await supabaseAdmin
      .from('provider_memory')
      .select('*')
      .eq('provider_id', providerId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    return (data || []).map((row) => toProviderMemoryItem(row as ProviderMemoryRow));
  } catch (error) {
    logEvent({
      route: 'db/provider-memory',
      action: 'read_failed',
      outcome: 'error',
      metadata: {
        providerId,
        reason: error instanceof Error ? error.message : 'Unknown provider memory read error',
      },
    });
    return [];
  }
}

export async function saveProviderMemory(item: ProviderMemoryItem) {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return;
    }

    const row = toProviderMemoryRow(item);
    const { error } = await supabaseAdmin.from('provider_memory').upsert(row, {
      onConflict: 'id',
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    logEvent({
      route: 'db/provider-memory',
      action: 'write_failed',
      outcome: 'error',
      metadata: {
        providerId: item.providerId,
        memoryId: item.id,
        reason: error instanceof Error ? error.message : 'Unknown provider memory write error',
      },
    });
  }
}

export async function deleteProviderMemory(memoryId: string, providerId?: string) {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return false;
    }

    let query = supabaseAdmin.from('provider_memory').delete().eq('id', memoryId);
    if (providerId) {
      query = query.eq('provider_id', providerId);
    }

    const { error } = await query;
    if (error) {
      throw error;
    }
    return true;
  } catch (error) {
    logEvent({
      route: 'db/provider-memory',
      action: 'delete_failed',
      outcome: 'error',
      metadata: {
        providerId: providerId || 'unknown',
        memoryId,
        reason: error instanceof Error ? error.message : 'Unknown provider memory delete error',
      },
    });
    return false;
  }
}
