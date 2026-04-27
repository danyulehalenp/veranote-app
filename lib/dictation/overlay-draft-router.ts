import { buildSourceInputFromSections, EMPTY_SOURCE_SECTIONS, normalizeSourceSections } from '@/lib/ai/source-sections';
import { saveDraft, getDraftById } from '@/lib/db/client';
import { recordDictationAuditEvent } from '@/lib/dictation/event-ledger';
import type { DictationTargetSection, TranscriptSegment } from '@/types/dictation';
import type { DraftSession, DictationInsertionRecord, SourceSections } from '@/types/session';

function createTransactionId() {
  return `overlay-dictation-tx-${Math.random().toString(36).slice(2, 10)}`;
}

function appendToSection(existing: string, next: string) {
  return existing.trim() ? `${existing.trim()}\n${next.trim()}` : next.trim();
}

function buildOverlayDraftBase(input: {
  providerId: string;
  encounterId: string;
}): DraftSession {
  return {
    providerIdentityId: input.providerId,
    specialty: 'Psychiatry',
    role: 'Psychiatric NP',
    noteType: 'Inpatient Psych Progress Note',
    template: 'Default Inpatient Psych Progress Note',
    outputStyle: 'Standard',
    format: 'Labeled Sections',
    keepCloserToSource: true,
    flagMissingInfo: true,
    sourceInput: '',
    sourceSections: EMPTY_SOURCE_SECTIONS,
    dictationInsertions: {},
    note: '',
    flags: [],
    copilotSuggestions: [],
    mode: 'live',
    warning: `Overlay dictation draft for encounter ${input.encounterId}.`,
  };
}

export async function appendOverlaySegmentToDraft(input: {
  providerId: string;
  dictationSessionId: string;
  encounterId: string;
  targetSection: DictationTargetSection;
  segment: TranscriptSegment;
  draftId?: string;
  destinationMode?: 'floating-source-box' | 'floating-field-box';
  destinationFieldId?: string;
  destinationFieldLabel?: string;
}) {
  const existingDraft = input.draftId
    ? await getDraftById(input.draftId, input.providerId)
    : null;

  if (input.draftId && !existingDraft) {
    throw new Error('Linked draft not found.');
  }

  const sourceSections = normalizeSourceSections(existingDraft?.sourceSections as Partial<SourceSections> | null | undefined);
  sourceSections[input.targetSection] = appendToSection(
    sourceSections[input.targetSection] || '',
    input.segment.text,
  );

  const insertionRecord: DictationInsertionRecord = {
    segmentId: input.segment.id,
    dictationSessionId: input.dictationSessionId,
    targetSection: input.targetSection,
    text: input.segment.text,
    insertedAt: new Date().toISOString(),
    transactionId: createTransactionId(),
    provider: input.segment.source.provider,
    sourceMode: input.segment.source.mode,
    confidence: input.segment.confidence,
    reviewFlags: input.segment.reviewFlags,
    destinationMode: input.destinationMode,
    destinationFieldId: input.destinationFieldId,
    destinationFieldLabel: input.destinationFieldLabel,
  };

  const nextDraft: DraftSession = {
    ...(existingDraft || buildOverlayDraftBase({
      providerId: input.providerId,
      encounterId: input.encounterId,
    })),
    draftId: existingDraft?.id,
    providerIdentityId: input.providerId,
    sourceSections,
    sourceInput: buildSourceInputFromSections(sourceSections),
    dictationInsertions: {
      ...(existingDraft?.dictationInsertions || {}),
      [input.targetSection]: [
        insertionRecord,
        ...((existingDraft?.dictationInsertions?.[input.targetSection] || []) as DictationInsertionRecord[]),
      ],
    },
    note: existingDraft?.note || '',
    flags: existingDraft?.flags || [],
    copilotSuggestions: existingDraft?.copilotSuggestions || [],
    mode: existingDraft?.mode || 'live',
  };

  const savedDraft = await saveDraft(nextDraft, input.providerId);

  recordDictationAuditEvent({
    sessionId: input.dictationSessionId,
    encounterId: input.encounterId,
    noteId: savedDraft.id,
    actorUserId: input.providerId,
    sttProvider: input.segment.source.provider,
    mode: 'provider_dictation',
    eventName: 'dictation_segment_inserted',
    eventDomain: 'editor',
    payload: {
      transactionId: insertionRecord.transactionId,
      targetSection: input.targetSection,
        sourceMode: input.segment.source.mode,
        confidence: input.segment.confidence,
        overlayCommitted: true,
        reviewFlagCount: input.segment.reviewFlags.length,
        destinationMode: input.destinationMode,
        destinationFieldId: input.destinationFieldId,
        destinationFieldLabel: input.destinationFieldLabel,
      },
    containsPhi: true,
  });

  return {
    draft: savedDraft,
    insertion: insertionRecord,
    draftUrl: `/dashboard/new-note?draftId=${encodeURIComponent(savedDraft.id)}&dictationSessionId=${encodeURIComponent(input.dictationSessionId)}`,
  };
}
