import { describe, expect, it } from 'vitest';
import { MockSTTProvider } from '@/lib/dictation/providers/mock-stt';

describe('MockSTTProvider', () => {
  it('emits interim and final segments for a mock utterance', async () => {
    const provider = new MockSTTProvider();
    const interim: string[] = [];
    const finals: string[] = [];

    provider.onInterimSegment((segment) => interim.push(segment.text));
    provider.onFinalSegment((segment) => finals.push(segment.text));

    await provider.createSession({
      tenantId: 'local-prototype',
      encounterId: 'encounter-1',
      providerUserId: 'provider-1',
      targetSection: 'clinicianNotes',
      mode: 'provider_dictation',
      sttProvider: 'mock-stt',
      language: 'en',
      commitMode: 'manual_accept',
      retention: {
        storeAudio: false,
        audioRetentionDays: 0,
        storeInterimTranscripts: false,
      },
    });

    provider.emitMockUtterance('Patient denies SI and wants discharge.');

    expect(interim[0]).toContain('...');
    expect(finals[0]).toBe('Patient denies SI and wants discharge.');
  });
});
