import type { DictationAuditEvent, DictationEventDomain, DictationEventName } from '@/types/dictation';
import { saveDictationAuditEvent } from '@/lib/db/client';

const dictationEventLedger = new Map<string, DictationAuditEvent[]>();
const MAX_EVENTS_PER_SESSION = 40;

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function resetDictationEventLedger() {
  dictationEventLedger.clear();
}

export function recordDictationAuditEvent(input: {
  sessionId: string;
  encounterId: string;
  noteId?: string;
  actorUserId: string;
  sttProvider?: string;
  mode?: string;
  eventName: DictationEventName;
  eventDomain: DictationEventDomain;
  payload?: Record<string, unknown>;
  containsPhi?: boolean;
}) {
  const event: DictationAuditEvent = {
    id: createId('dictation-event'),
    eventName: input.eventName,
    eventDomain: input.eventDomain,
    occurredAt: new Date().toISOString(),
    encounterId: input.encounterId,
    noteId: input.noteId,
    dictationSessionId: input.sessionId,
    actorUserId: input.actorUserId,
    sttProvider: input.sttProvider,
    mode: input.mode as DictationAuditEvent['mode'],
    payload: input.payload || {},
    containsPhi: input.containsPhi || false,
    retentionClass: 'audit_only',
  };

  const existing = dictationEventLedger.get(input.sessionId) || [];
  dictationEventLedger.set(input.sessionId, [event, ...existing].slice(0, MAX_EVENTS_PER_SESSION));
  void saveDictationAuditEvent(event, input.actorUserId).catch(() => {
    // Keep the in-memory ledger usable even if prototype persistence is unavailable.
  });
  return event;
}

export function listDictationAuditEvents(input: {
  sessionId: string;
  limit?: number;
}) {
  const events = dictationEventLedger.get(input.sessionId) || [];
  return events.slice(0, input.limit || 12);
}
