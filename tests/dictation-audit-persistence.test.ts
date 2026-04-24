import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { DictationAuditEvent } from '@/types/dictation';

function createAuditEvent(overrides?: Partial<DictationAuditEvent>): DictationAuditEvent {
  return {
    id: `dictation-event-${Math.random().toString(36).slice(2, 8)}`,
    eventName: 'dictation_session_started',
    eventDomain: 'session',
    occurredAt: '2026-04-24T03:00:00.000Z',
    encounterId: 'encounter-1',
    dictationSessionId: 'session-1',
    actorUserId: 'provider-1',
    sttProvider: 'mock-stt',
    mode: 'provider_dictation',
    payload: {
      targetSection: 'clinicianNotes',
    },
    containsPhi: false,
    retentionClass: 'audit_only',
    ...overrides,
  };
}

describe('dictation audit persistence', () => {
  const originalCwd = process.cwd();
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'veranote-dictation-audit-'));
    process.chdir(tempDir);
    vi.resetModules();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('stores and filters dictation audit history by provider and session', async () => {
    const { listDictationAuditEvents, saveDictationAuditEvent } = await import('@/lib/db/client');

    await saveDictationAuditEvent(createAuditEvent(), 'provider-1');
    await saveDictationAuditEvent(createAuditEvent({
      id: 'dictation-event-2',
      dictationSessionId: 'session-2',
      eventName: 'dictation_session_stopped',
      occurredAt: '2026-04-24T03:05:00.000Z',
    }), 'provider-1');
    await saveDictationAuditEvent(createAuditEvent({
      id: 'dictation-event-3',
      actorUserId: 'provider-2',
      dictationSessionId: 'session-3',
    }), 'provider-2');

    const providerOneEvents = await listDictationAuditEvents({
      providerId: 'provider-1',
    });
    const sessionOneEvents = await listDictationAuditEvents({
      providerId: 'provider-1',
      sessionId: 'session-1',
    });

    expect(providerOneEvents).toHaveLength(2);
    expect(providerOneEvents[0]?.dictationSessionId).toBe('session-2');
    expect(sessionOneEvents).toHaveLength(1);
    expect(sessionOneEvents[0]?.dictationSessionId).toBe('session-1');
  });
});
