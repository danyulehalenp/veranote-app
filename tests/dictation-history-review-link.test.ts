import { describe, expect, it } from 'vitest';
import { buildDictationReviewLinks, buildDictationReviewTrendWindows } from '@/lib/dictation/history-review-link';
import type { PersistedDraftSession } from '@/types/session';
import type { DictationSessionSummary } from '@/lib/dictation/history-summary';

function createSession(overrides?: Partial<DictationSessionSummary>): DictationSessionSummary {
  return {
    sessionId: 'session-1',
    lastOccurredAt: '2026-04-24T05:00:00.000Z',
    providerId: 'openai-transcription',
    providerLabel: 'OpenAI transcription',
    engineLabel: 'Whisper 1',
    encounterId: 'draft_1',
    noteId: 'draft_1',
    eventCount: 5,
    eventNames: ['session started'],
    flaggedEventCount: 0,
    insertedEventCount: 1,
    flaggedTypes: [],
    fallbackTransitionCount: 0,
    draftResumeCount: 0,
    finalState: 'stopped_cleanly',
    insertionOutcome: 'inserted_into_source',
    ...overrides,
  };
}

function createDraft(overrides?: Partial<PersistedDraftSession>): PersistedDraftSession {
  return {
    id: 'draft_1',
    providerIdentityId: 'provider-1',
    createdAt: '2026-04-24T05:00:00.000Z',
    updatedAt: '2026-04-24T05:10:00.000Z',
    version: 1,
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    noteType: 'Inpatient Psych Progress Note',
    template: 'Default Inpatient Psych Progress Note',
    outputStyle: 'Standard',
    format: 'Labeled Sections',
    keepCloserToSource: true,
    flagMissingInfo: true,
    sourceInput: 'Patient reports anxiety.',
    note: 'HPI: Patient reports anxiety.',
    flags: [],
    copilotSuggestions: [],
    mode: 'live',
    dictationInsertions: {
      clinicianNotes: [{
        segmentId: 'segment-1',
        dictationSessionId: 'session-1',
        targetSection: 'clinicianNotes',
        text: 'Patient reports anxiety.',
        insertedAt: '2026-04-24T05:01:00.000Z',
        transactionId: 'tx-1',
        provider: 'openai-transcription',
        sourceMode: 'realtime',
        reviewFlags: [],
      }],
    },
    sectionReviewState: {
      hpi: {
        heading: 'HPI',
        status: 'approved',
        confirmedEvidenceBlockIds: ['block-1'],
      },
      plan: {
        heading: 'Plan',
        status: 'needs-review',
        confirmedEvidenceBlockIds: [],
      },
    },
    draftId: 'draft_1',
    draftVersion: 1,
    ...overrides,
  };
}

describe('dictation history review link', () => {
  it('links sessions to drafts and derives downstream review state', () => {
    const links = buildDictationReviewLinks([createSession()], [createDraft()]);

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      linked: true,
      carriedInsertionCount: 1,
      linkedReviewState: 'needs_review',
      confirmedEvidenceCount: 1,
      reviewAttentionCount: 1,
    });
  });

  it('builds review trend windows across linked sessions', () => {
    const sessions = [
      createSession({
        sessionId: 'session-1',
        noteId: 'draft_1',
        encounterId: 'draft_1',
        lastOccurredAt: '2026-04-23T05:00:00.000Z',
      }),
      createSession({
        sessionId: 'session-2',
        noteId: 'draft_2',
        encounterId: 'draft_2',
        lastOccurredAt: '2026-04-10T05:00:00.000Z',
      }),
    ];
    const drafts = [
      createDraft({
        id: 'draft_1',
        draftId: 'draft_1',
        dictationInsertions: {
          clinicianNotes: [{
            segmentId: 'segment-1',
            dictationSessionId: 'session-1',
            targetSection: 'clinicianNotes',
            text: 'Patient reports anxiety.',
            insertedAt: '2026-04-24T05:01:00.000Z',
            transactionId: 'tx-1',
            provider: 'openai-transcription',
            sourceMode: 'realtime',
            reviewFlags: [],
          }],
        },
        sectionReviewState: {
          hpi: {
            heading: 'HPI',
            status: 'approved',
            confirmedEvidenceBlockIds: ['block-1'],
          },
        },
      }),
      createDraft({
        id: 'draft_2',
        draftId: 'draft_2',
        dictationInsertions: {},
        sectionReviewState: {
          plan: {
            heading: 'Plan',
            status: 'needs-review',
            confirmedEvidenceBlockIds: [],
          },
        },
      }),
    ];

    const links = buildDictationReviewLinks(sessions, drafts);
    const [sevenDay, thirtyDay] = buildDictationReviewTrendWindows(links.map((_, index) => sessions[index]), links, '2026-04-24T12:00:00.000Z');

    expect(sevenDay).toMatchObject({
      label: '7d',
      linkedDraftRate: 100,
      carriedInsertionRate: 100,
      reviewCompleteRate: 100,
      needsReviewRate: 0,
    });
    expect(thirtyDay).toMatchObject({
      label: '30d',
      linkedDraftRate: 100,
      carriedInsertionRate: 50,
      reviewCompleteRate: 50,
      needsReviewRate: 50,
    });
  });
});
