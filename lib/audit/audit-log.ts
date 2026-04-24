import { saveAuditEvent } from '@/lib/db/audit-repo';

type AuditEvent = {
  userId: string;
  action: string;
  timestamp: string;
  route?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

const auditEvents: AuditEvent[] = [];

export function recordAuditEvent(event: {
  userId: string;
  action: string;
  timestamp?: string;
  route?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}) {
  const entry: AuditEvent = {
    userId: event.userId,
    action: event.action,
    timestamp: event.timestamp || new Date().toISOString(),
    ...(event.route ? { route: event.route } : {}),
    ...(event.metadata ? { metadata: event.metadata } : {}),
  };

  auditEvents.push(entry);
  void saveAuditEvent({
    timestamp: entry.timestamp,
    user_id: entry.userId,
    action: entry.action,
    route: entry.route,
    metadata: entry.metadata,
  });
  return entry;
}

export function listAuditEvents() {
  return [...auditEvents];
}
