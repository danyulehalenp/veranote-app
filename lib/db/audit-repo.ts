import { getSupabaseAdminClient } from '@/lib/db/supabase-client';
import { sanitizeForLogging } from '@/lib/security/phi-sanitizer';
import { logEvent } from '@/lib/security/safe-logger';

type AuditEventRow = {
  timestamp: string;
  user_id: string;
  action: string;
  route?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

function sanitizeMetadata(metadata?: AuditEventRow['metadata']) {
  if (!metadata) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (typeof value === 'string') {
        return [key, sanitizeForLogging(value)];
      }
      return [key, value];
    }),
  );
}

export async function saveAuditEvent(event: AuditEventRow) {
  try {
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return;
    }

    const { error } = await supabaseAdmin.from('audit_logs').insert({
      timestamp: event.timestamp,
      user_id: event.user_id,
      action: event.action,
      route: event.route ?? null,
      metadata: sanitizeMetadata(event.metadata) ?? null,
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    logEvent({
      route: 'db/audit',
      action: 'persist_failed',
      outcome: 'error',
      metadata: {
        reason: error instanceof Error ? error.message : 'Unknown audit persistence error',
      },
    });
  }
}
