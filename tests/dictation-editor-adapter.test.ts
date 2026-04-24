import { describe, expect, it } from 'vitest';
import { createSourceSectionDictationAdapter } from '@/lib/dictation/editor-adapter';
import type { SourceSections } from '@/types/session';
import type { TranscriptSegment } from '@/types/dictation';

function buildSegment(): TranscriptSegment {
  return {
    id: 'segment-1',
    dictationSessionId: 'dictation-session-1',
    encounterId: 'encounter-1',
    targetSection: 'clinicianNotes',
    text: 'Patient denies SI today.',
    isFinal: true,
    reviewStatus: 'needs_review',
    reviewFlags: [],
    source: {
      provider: 'mock-stt',
      mode: 'manual',
    },
    createdAt: '2026-04-23T00:00:00.000Z',
  };
}

describe('createSourceSectionDictationAdapter', () => {
  it('appends accepted segments into the active source section and records provenance', async () => {
    const sections: SourceSections = {
      clinicianNotes: 'Initial note',
      intakeCollateral: '',
      patientTranscript: '',
      objectiveData: '',
    };
    const insertionRecords: Array<{ transactionId: string; targetSection: string }> = [];
    const adapter = createSourceSectionDictationAdapter({
      getSourceSections: () => sections,
      targetSection: 'clinicianNotes',
      onUpdateSourceSection: (section, value) => {
        sections[section] = value;
      },
      onInsertedSegment: (record) => {
        insertionRecords.push({ transactionId: record.transactionId, targetSection: record.targetSection });
      },
    });

    const result = await adapter.insertFinalSegment(buildSegment());

    expect(sections.clinicianNotes).toContain('Initial note\nPatient denies SI today.');
    expect(result.transactionId).toMatch(/^dictation-tx-/);
    expect(insertionRecords[0]?.targetSection).toBe('clinicianNotes');
  });

  it('opens the fallback dictation box when no target section is active', async () => {
    let fallbackText = '';
    const adapter = createSourceSectionDictationAdapter({
      getSourceSections: () => ({
        clinicianNotes: '',
        intakeCollateral: '',
        patientTranscript: '',
        objectiveData: '',
      }),
      onUpdateSourceSection: () => undefined,
      onOpenFallback: (initialText) => {
        fallbackText = initialText || '';
      },
    });

    await expect(adapter.insertFinalSegment(buildSegment())).rejects.toThrow('No dictation target is active.');
    expect(fallbackText).toBe('Patient denies SI today.');
  });
});
