import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { TranscriptSegment } from '@/types/dictation';

function createSegment(overrides?: Partial<TranscriptSegment>): TranscriptSegment {
  return {
    id: `segment-${Math.random().toString(36).slice(2, 8)}`,
    dictationSessionId: 'dictation-session-1',
    encounterId: 'encounter-1',
    targetSection: 'clinicianNotes',
    text: 'Patient reports improved sleep and denies suicidal ideation.',
    normalizedText: 'Patient reports improved sleep and denies suicidal ideation.',
    isFinal: true,
    reviewStatus: 'reviewed',
    reviewFlags: [],
    source: {
      provider: 'openai-transcription',
      modelOrEngine: 'gpt-4o-mini-transcribe',
      mode: 'realtime',
    },
    createdAt: '2026-04-24T04:00:00.000Z',
    ...overrides,
  };
}

describe('overlay draft router', () => {
  const originalCwd = process.cwd();
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'veranote-overlay-draft-'));
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

  it('creates a linked draft and appends accepted overlay dictation into the target section', async () => {
    const { appendOverlaySegmentToDraft } = await import('@/lib/dictation/overlay-draft-router');
    const { getDraftById } = await import('@/lib/db/client');

    const committed = await appendOverlaySegmentToDraft({
      providerId: 'provider-1',
      dictationSessionId: 'dictation-session-1',
      encounterId: 'encounter-1',
      targetSection: 'clinicianNotes',
      segment: createSegment(),
    });

    expect(committed.draft.id).toBeTruthy();
    expect(committed.insertion.transactionId).toContain('overlay-dictation-tx-');
    expect(committed.draftUrl).toContain(`/dashboard/new-note?draftId=${encodeURIComponent(committed.draft.id)}`);

    const saved = await getDraftById(committed.draft.id, 'provider-1');
    expect(saved?.sourceSections?.clinicianNotes).toContain('improved sleep');
    expect(saved?.dictationInsertions?.clinicianNotes?.[0]?.dictationSessionId).toBe('dictation-session-1');
  });

  it('reuses the linked draft for later accepted segments from the same overlay session', async () => {
    const { appendOverlaySegmentToDraft } = await import('@/lib/dictation/overlay-draft-router');
    const { getDraftById } = await import('@/lib/db/client');

    const firstCommit = await appendOverlaySegmentToDraft({
      providerId: 'provider-1',
      dictationSessionId: 'dictation-session-1',
      encounterId: 'encounter-1',
      targetSection: 'patientTranscript',
      segment: createSegment({
        id: 'segment-1',
        targetSection: 'patientTranscript',
        text: 'Patient states the voices are quieter today.',
      }),
    });

    const secondCommit = await appendOverlaySegmentToDraft({
      providerId: 'provider-1',
      dictationSessionId: 'dictation-session-1',
      encounterId: 'encounter-1',
      targetSection: 'patientTranscript',
      draftId: firstCommit.draft.id,
      segment: createSegment({
        id: 'segment-2',
        targetSection: 'patientTranscript',
        text: 'Patient also reports improved appetite.',
      }),
    });

    expect(secondCommit.draft.id).toBe(firstCommit.draft.id);

    const saved = await getDraftById(firstCommit.draft.id, 'provider-1');
    expect(saved?.sourceSections?.patientTranscript).toContain('voices are quieter today');
    expect(saved?.sourceSections?.patientTranscript).toContain('improved appetite');
    expect(saved?.dictationInsertions?.patientTranscript).toHaveLength(2);
  });

  it('stores destination-aware field metadata with overlay insertions', async () => {
    const { appendOverlaySegmentToDraft } = await import('@/lib/dictation/overlay-draft-router');
    const { getDraftById } = await import('@/lib/db/client');

    const committed = await appendOverlaySegmentToDraft({
      providerId: 'provider-1',
      dictationSessionId: 'dictation-session-1',
      encounterId: 'encounter-1',
      targetSection: 'clinicianNotes',
      destinationMode: 'floating-field-box',
      destinationFieldId: 'tebra-subjective',
      destinationFieldLabel: 'Subjective / HPI',
      segment: createSegment({
        id: 'segment-targeted',
        text: 'Patient reports fewer panic episodes this week.',
      }),
    });

    const saved = await getDraftById(committed.draft.id, 'provider-1');
    expect(saved?.dictationInsertions?.clinicianNotes?.[0]?.destinationMode).toBe('floating-field-box');
    expect(saved?.dictationInsertions?.clinicianNotes?.[0]?.destinationFieldId).toBe('tebra-subjective');
    expect(saved?.dictationInsertions?.clinicianNotes?.[0]?.destinationFieldLabel).toBe('Subjective / HPI');
  });
});
