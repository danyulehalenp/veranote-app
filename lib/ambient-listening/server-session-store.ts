import {
  getAmbientMockReviewFlags,
  getAmbientMockSections,
  getAmbientMockTurns,
  type AmbientConsentEventDraft,
  type AmbientDraftSectionViewModel,
  type AmbientSessionSetupDraft,
  type AmbientTranscriptTurnViewModel,
} from '@/lib/ambient-listening/mock-data';
import {
  resolveAmbientBatchTranscriptionProviderSelection,
  normalizeAmbientTranscriptIngressEvents,
  resolveAmbientServerTranscriptAdapter,
  transcribeAmbientAudioWithPreferredProvider,
} from '@/lib/ambient-listening/server-transcript-adapters';
import type {
  AmbientTranscriptAdapterDescriptor,
  AmbientParticipant,
  AmbientTranscriptEventEnvelope,
  AmbientReviewFlag,
  AmbientReviewStatus,
  AmbientSessionState,
  AmbientTranscriptDeliveryTransport,
  AmbientTranscriptEventType,
  AmbientTranscriptSourceKind,
  AmbientTranscriptTransportPhase,
} from '@/types/ambient-listening';

type ServerAmbientSessionRecord = {
  sessionId: string;
  providerIdentityId: string;
  encounterId: string;
  state: AmbientSessionState;
  setupDraft: AmbientSessionSetupDraft;
  participants: AmbientParticipant[];
  consentDrafts: AmbientConsentEventDraft[];
  turns: AmbientTranscriptTurnViewModel[];
  sections: AmbientDraftSectionViewModel[];
  reviewFlags: AmbientReviewFlag[];
  pendingTranscriptEvents: AmbientTranscriptEvent[];
  transcriptAdapterId: string;
  transcriptAdapterLabel: string;
  transcriptSourceKind: AmbientTranscriptSourceKind;
  lastTranscriptDeliveryTransport: AmbientTranscriptDeliveryTransport;
  createdAt: string;
  startedAt?: string;
  stoppedAt?: string;
  transcriptEventCount: number;
};

type AmbientTranscriptEvent = {
  id: string;
  eventType: AmbientTranscriptEventType;
  occurredAt: string;
  sourceKind: Exclude<AmbientTranscriptSourceKind, 'none'>;
  turn: AmbientTranscriptTurnViewModel;
};

type AmbientTranscriptionAudioUpload = {
  base64Audio: string;
  mimeType: string;
  sizeBytes: number;
  capturedAt: string;
};

const serverAmbientSessions = new Map<string, ServerAmbientSessionRecord>();
const serverAmbientSessionListeners = new Map<string, Set<(record: ServerAmbientSessionRecord) => void>>();
const ATTRIBUTION_THRESHOLD = 0.9;

export function resetServerAmbientSessions() {
  serverAmbientSessions.clear();
  serverAmbientSessionListeners.clear();
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function notifyServerAmbientSessionListeners(record: ServerAmbientSessionRecord) {
  const listeners = serverAmbientSessionListeners.get(record.sessionId);
  if (!listeners?.size) {
    return;
  }

  for (const listener of listeners) {
    listener(record);
  }
}

function persistServerAmbientSession(record: ServerAmbientSessionRecord) {
  serverAmbientSessions.set(record.sessionId, record);
  notifyServerAmbientSessionListeners(record);
}

function cloneSetupDraft(setupDraft: AmbientSessionSetupDraft): AmbientSessionSetupDraft {
  return {
    ...setupDraft,
    participants: setupDraft.participants.map((participant) => ({ ...participant })),
  };
}

function cloneConsentDrafts(consentDrafts: AmbientConsentEventDraft[]) {
  return consentDrafts.map((draft) => ({
    ...draft,
    scope: { ...draft.scope },
  }));
}

function cloneTurns(turns: AmbientTranscriptTurnViewModel[]) {
  return turns.map((turn) => ({
    ...turn,
    clinicalConcepts: [...turn.clinicalConcepts],
    riskMarkers: [...turn.riskMarkers],
    severityBadges: [...turn.severityBadges],
    linkedDraftSentenceIds: [...turn.linkedDraftSentenceIds],
  }));
}

function cloneSections(sections: AmbientDraftSectionViewModel[]) {
  return sections.map((section) => ({
    ...section,
    sentences: section.sentences.map((sentence) => ({
      ...sentence,
      evidenceAnchors: sentence.evidenceAnchors.map((anchor) => ({ ...anchor })),
      primaryTurnIds: [...sentence.primaryTurnIds],
      blockingFlagIds: [...sentence.blockingFlagIds],
    })),
  }));
}

function cloneFlags(flags: AmbientReviewFlag[]) {
  return flags.map((flag) => ({
    ...flag,
    sourceTurnIds: [...flag.sourceTurnIds],
  }));
}

function cloneTranscriptEvents(events: AmbientTranscriptEvent[]) {
  return events.map((event) => ({
    ...event,
    turn: {
      ...event.turn,
      clinicalConcepts: [...event.turn.clinicalConcepts],
      riskMarkers: [...event.turn.riskMarkers],
      severityBadges: [...event.turn.severityBadges],
      linkedDraftSentenceIds: [...event.turn.linkedDraftSentenceIds],
    },
  }));
}

function buildAmbientTranscriptEventFromEnvelope(event: AmbientTranscriptEventEnvelope): AmbientTranscriptEvent {
  return {
    id: event.id,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    sourceKind: event.sourceKind,
    turn: {
      ...event.turn,
      clinicalConcepts: [...event.turn.clinicalConcepts],
      riskMarkers: [...event.turn.riskMarkers],
      severityBadges: [...(event.reviewHints?.severityBadges || [])],
      linkedDraftSentenceIds: [...(event.reviewHints?.linkedDraftSentenceIds || [])],
      attributionNeedsReview: event.reviewHints?.attributionNeedsReview ?? false,
      textNeedsReview: event.reviewHints?.textNeedsReview ?? false,
      providerConfirmed: event.reviewHints?.providerConfirmed ?? false,
    },
  };
}

function deriveTranscriptTransportPhase(record: ServerAmbientSessionRecord): AmbientTranscriptTransportPhase {
  if (record.state === 'draft_generation_pending') {
    return 'awaiting_draft_generation';
  }

  if (record.state === 'processing_transcript') {
    return 'flushing_after_stop';
  }

  if (record.state === 'recording' && record.transcriptSourceKind === 'live_stream_adapter') {
    return 'streaming_live';
  }

  if (['recording', 'paused', 'off_record'].includes(record.state) && record.pendingTranscriptEvents.length > 0) {
    return 'replaying_buffered';
  }

  return 'idle';
}

function hasBlockingAttribution(turns: AmbientTranscriptTurnViewModel[]) {
  return turns.some((turn) => !turn.excludedFromDraft && turn.attributionNeedsReview && !turn.providerConfirmed);
}

function reconcileFlags(flags: AmbientReviewFlag[], turns: AmbientTranscriptTurnViewModel[]) {
  const attributionResolved = !hasBlockingAttribution(turns);
  const nextFlags = flags.map((flag): AmbientReviewFlag => {
    if (flag.flagId === 'flag-speaker-1') {
      return {
        ...flag,
        status: (attributionResolved ? 'resolved' : 'open') as AmbientReviewStatus,
      };
    }

    return flag;
  });

  if (!nextFlags.some((flag) => flag.flagId === 'flag-speaker-1') && !attributionResolved) {
    nextFlags.unshift({
      flagId: 'flag-speaker-1',
      category: 'speaker_attribution',
      severity: 'high',
      message: 'Speaker attribution still needs provider review before source-backed draft language should be accepted.',
      sourceTurnIds: turns.filter((turn) => !turn.excludedFromDraft && turn.attributionNeedsReview && !turn.providerConfirmed).map((turn) => turn.id),
      status: 'open',
    });
  }

  return nextFlags;
}

function reconcileStateForReview(record: ServerAmbientSessionRecord): ServerAmbientSessionRecord {
  const reviewFlags = reconcileFlags(record.reviewFlags, record.turns);
  const shouldNeedReview = hasBlockingAttribution(record.turns);

  return {
    ...record,
    reviewFlags,
    state: ['accepted_into_note', 'finalized', 'discarded'].includes(record.state)
      ? record.state
      : shouldNeedReview
        ? 'needs_review'
        : record.state === 'processing_transcript' || record.state === 'draft_generation_pending'
          ? 'draft_ready'
          : record.state,
  };
}

function seedMockTranscript(record: ServerAmbientSessionRecord): ServerAmbientSessionRecord {
  const turns = cloneTurns(getAmbientMockTurns());
  const sections = cloneSections(getAmbientMockSections());
  const reviewFlags = reconcileFlags(cloneFlags(getAmbientMockReviewFlags()), turns);

  return {
    ...record,
    turns,
    sections,
    reviewFlags,
    pendingTranscriptEvents: [],
    transcriptAdapterId: record.transcriptAdapterId,
    transcriptAdapterLabel: record.transcriptAdapterLabel,
    transcriptSourceKind: record.transcriptSourceKind === 'none' ? record.setupDraft.transcriptSimulator : record.transcriptSourceKind,
    lastTranscriptDeliveryTransport: record.lastTranscriptDeliveryTransport,
    transcriptEventCount: turns.length,
  };
}

function buildSectionsFromTranscribedTurns(turns: AmbientTranscriptTurnViewModel[]) {
  if (!turns.length) {
    return [] satisfies AmbientDraftSectionViewModel[];
  }

  return [
    {
      sectionId: 'transcript-review',
      label: 'Transcript review',
      sentences: turns.map((turn, index) => ({
        sentenceId: `sentence-transcript-${index + 1}`,
        text: turn.text,
        evidenceAnchors: [
          {
            turnId: turn.id,
            startChar: 0,
            endChar: turn.text.length,
            supportType: 'direct' as const,
            confidence: turn.textConfidence,
          },
        ],
        assertionType: 'unknown' as const,
        confidence: turn.textConfidence,
        supportSummary: '1 direct ambient transcript turn',
        primaryTurnIds: [turn.id],
        blockingFlagIds: turn.attributionNeedsReview && !turn.providerConfirmed ? ['flag-speaker-1'] : [],
        accepted: false,
        rejected: false,
      })),
    },
  ] satisfies AmbientDraftSectionViewModel[];
}

function buildFlagsFromTranscribedTurns(turns: AmbientTranscriptTurnViewModel[]) {
  const unresolvedTurns = turns.filter((turn) => turn.attributionNeedsReview && !turn.providerConfirmed);
  if (!unresolvedTurns.length) {
    return [] satisfies AmbientReviewFlag[];
  }

  return [
    {
      flagId: 'flag-speaker-1',
      category: 'speaker_attribution',
      severity: 'high',
      message: 'Transcribed ambient audio is currently unlabeled for speaker identity. Confirm whether each turn belongs to provider, patient, or collateral before using it as source-backed note material.',
      sourceTurnIds: unresolvedTurns.map((turn) => turn.id),
      status: 'open',
    },
  ] satisfies AmbientReviewFlag[];
}

function applyTranscriptEvent(record: ServerAmbientSessionRecord, event: AmbientTranscriptEvent) {
  const existingTurnIndex = record.turns.findIndex((turn) => turn.id === event.turn.id);
  const nextTurns = cloneTurns(record.turns);

  if (existingTurnIndex >= 0) {
    nextTurns[existingTurnIndex] = event.turn;
  } else {
    nextTurns.push(event.turn);
  }

  return reconcileStateForReview({
    ...record,
    turns: nextTurns,
    transcriptEventCount: record.transcriptEventCount + 1,
  });
}

function flushPendingTranscriptEvents(record: ServerAmbientSessionRecord) {
  let nextRecord: ServerAmbientSessionRecord = {
    ...record,
    pendingTranscriptEvents: [],
  };

  for (const event of record.pendingTranscriptEvents) {
    nextRecord = {
      ...applyTranscriptEvent(nextRecord, event),
      pendingTranscriptEvents: [],
    };
  }

  return nextRecord;
}

function updateSectionBlockingForTurn(
  sections: AmbientDraftSectionViewModel[],
  turnId: string,
  hasBlockingFlag: boolean,
) {
  return sections.map((section) => ({
    ...section,
    sentences: section.sentences.map((sentence) => {
      if (!sentence.primaryTurnIds.includes(turnId)) {
        return sentence;
      }

      const nextBlockingFlagIds = hasBlockingFlag
        ? Array.from(new Set([...sentence.blockingFlagIds, 'flag-speaker-1']))
        : sentence.blockingFlagIds.filter((flagId) => flagId !== 'flag-speaker-1');

      return {
        ...sentence,
        blockingFlagIds: nextBlockingFlagIds,
      };
    }),
  }));
}

export function createServerAmbientSession(input: {
  providerIdentityId: string;
  encounterId: string;
  setupDraft: AmbientSessionSetupDraft;
  participants: AmbientParticipant[];
  consentDrafts: AmbientConsentEventDraft[];
}) {
  const sessionId = createId('ambient-session');
  const transcriptAdapter = resolveAmbientServerTranscriptAdapter(input.setupDraft.transcriptSimulator);
  let preferredBatchProvider: ReturnType<typeof resolveAmbientBatchTranscriptionProviderSelection> | null = null;
  if (input.setupDraft.captureRuntime === 'real_microphone') {
    try {
      preferredBatchProvider = resolveAmbientBatchTranscriptionProviderSelection({
        requestedProvider: 'auto',
        allowMockSimulationFallback: false,
      });
    } catch {
      preferredBatchProvider = null;
    }
  }
  const record: ServerAmbientSessionRecord = {
    sessionId,
    providerIdentityId: input.providerIdentityId,
    encounterId: input.encounterId,
    state: 'consent_pending',
    setupDraft: cloneSetupDraft(input.setupDraft),
    participants: input.participants.map((participant) => ({ ...participant })),
    consentDrafts: cloneConsentDrafts(input.consentDrafts),
    turns: [],
    sections: [],
    reviewFlags: [],
    pendingTranscriptEvents: [],
    transcriptAdapterId: preferredBatchProvider?.activeProvider || transcriptAdapter.adapterId,
    transcriptAdapterLabel: preferredBatchProvider?.activeProviderLabel || transcriptAdapter.adapterLabel,
    transcriptSourceKind: 'none',
    lastTranscriptDeliveryTransport: 'none',
    createdAt: new Date().toISOString(),
    transcriptEventCount: 0,
  };

  persistServerAmbientSession(record);
  return record;
}

export function subscribeToServerAmbientSession(input: {
  sessionId: string;
  providerIdentityId: string;
  onUpdate: (record: ServerAmbientSessionRecord) => void;
}) {
  const record = getServerAmbientSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Ambient session not found.');
  }

  const existing = serverAmbientSessionListeners.get(input.sessionId) || new Set<(record: ServerAmbientSessionRecord) => void>();
  existing.add(input.onUpdate);
  serverAmbientSessionListeners.set(input.sessionId, existing);

  input.onUpdate(record);

  return () => {
    const listeners = serverAmbientSessionListeners.get(input.sessionId);
    if (!listeners) {
      return;
    }

    listeners.delete(input.onUpdate);
    if (!listeners.size) {
      serverAmbientSessionListeners.delete(input.sessionId);
    }
  };
}

export function getServerAmbientSession(sessionId: string, providerIdentityId: string) {
  const record = serverAmbientSessions.get(sessionId);
  if (!record || record.providerIdentityId !== providerIdentityId) {
    return null;
  }

  return reconcileStateForReview(record);
}

export function updateServerAmbientConsent(input: {
  sessionId: string;
  providerIdentityId: string;
  consentDrafts: AmbientConsentEventDraft[];
}) {
  const record = getServerAmbientSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Ambient session not found.');
  }

  const allGranted = input.consentDrafts.every((draft) => draft.status === 'granted');
  const nextRecord: ServerAmbientSessionRecord = {
    ...record,
    consentDrafts: cloneConsentDrafts(input.consentDrafts),
    state: allGranted ? 'ready_to_record' : 'consent_pending',
  };
  persistServerAmbientSession(nextRecord);
  return nextRecord;
}

export function setServerAmbientSessionState(input: {
  sessionId: string;
  providerIdentityId: string;
  state: AmbientSessionState;
}) {
  const record = getServerAmbientSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Ambient session not found.');
  }

  let nextRecord: ServerAmbientSessionRecord = {
    ...record,
    state: input.state,
  };

  if (input.state === 'recording' && !record.startedAt) {
    nextRecord.startedAt = new Date().toISOString();
  }

  if (
    input.state === 'recording'
    && record.setupDraft.captureRuntime !== 'real_microphone'
    && !record.turns.length
    && !record.pendingTranscriptEvents.length
  ) {
    const transcriptAdapter = resolveAmbientServerTranscriptAdapter(record.setupDraft.transcriptSimulator);
    nextRecord.pendingTranscriptEvents = transcriptAdapter.buildTranscriptEvents({
      sessionId: record.sessionId,
      setupDraft: record.setupDraft,
      createId,
    }).map(buildAmbientTranscriptEventFromEnvelope);
    nextRecord.transcriptAdapterId = transcriptAdapter.adapterId;
    nextRecord.transcriptAdapterLabel = transcriptAdapter.adapterLabel;
    nextRecord.transcriptSourceKind = transcriptAdapter.sourceKind;
  }

  if (input.state === 'processing_transcript') {
    nextRecord.stoppedAt = new Date().toISOString();
    if (nextRecord.pendingTranscriptEvents.length) {
      nextRecord = flushPendingTranscriptEvents(nextRecord);
    }
  }

  if (
    input.state === 'draft_generation_pending'
    && record.setupDraft.captureRuntime !== 'real_microphone'
    && !nextRecord.turns.length
    && !nextRecord.pendingTranscriptEvents.length
  ) {
    nextRecord = seedMockTranscript(nextRecord);
  }

  if (input.state === 'draft_ready' || input.state === 'needs_review') {
    nextRecord = reconcileStateForReview(nextRecord);
    nextRecord.state = hasBlockingAttribution(nextRecord.turns) ? 'needs_review' : 'draft_ready';
  }

  persistServerAmbientSession(nextRecord);
  return nextRecord;
}

export async function transcribeServerAmbientAudio(input: {
  sessionId: string;
  providerIdentityId: string;
  audio: AmbientTranscriptionAudioUpload;
}) {
  const record = getServerAmbientSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Ambient session not found.');
  }

  if (!input.audio.base64Audio || !input.audio.mimeType || !input.audio.sizeBytes) {
    throw new Error('Ambient audio upload is incomplete.');
  }

  const transcription = await transcribeAmbientAudioWithPreferredProvider({
    base64Audio: input.audio.base64Audio,
    mimeType: input.audio.mimeType,
    requestedProvider: 'auto',
  });

  const occurredAt = input.audio.capturedAt || new Date().toISOString();
  const envelopes = normalizeAmbientTranscriptIngressEvents({
    sessionId: record.sessionId,
    sourceKind: 'batch_transcription',
    events: transcription.ingressEvents,
    createId,
  });
  const transcribedTurns: AmbientTranscriptTurnViewModel[] = envelopes
    .filter((event) => event.turn.isFinal)
    .map((event, index) => ({
      ...event.turn,
      severityBadges: [...(event.reviewHints?.severityBadges || ['speaker review'])],
      attributionNeedsReview: event.reviewHints?.attributionNeedsReview ?? true,
      textNeedsReview: event.reviewHints?.textNeedsReview ?? false,
      linkedDraftSentenceIds: [`sentence-transcript-${index + 1}`],
      providerConfirmed: event.reviewHints?.providerConfirmed ?? false,
    }));

  const nextRecord = reconcileStateForReview({
    ...record,
    state: 'draft_ready',
    turns: transcribedTurns,
    sections: buildSectionsFromTranscribedTurns(transcribedTurns),
    reviewFlags: buildFlagsFromTranscribedTurns(transcribedTurns),
    pendingTranscriptEvents: [],
    transcriptAdapterId: transcription.selection.activeProvider,
    transcriptAdapterLabel: transcription.selection.activeProviderLabel,
    transcriptSourceKind: 'batch_transcription',
    lastTranscriptDeliveryTransport: 'none',
    transcriptEventCount: transcribedTurns.length,
    stoppedAt: occurredAt,
  });

  persistServerAmbientSession(nextRecord);
  return nextRecord;
}

export function relabelServerAmbientTurn(input: {
  sessionId: string;
  providerIdentityId: string;
  turnId: string;
  role: AmbientTranscriptTurnViewModel['speakerRole'];
}) {
  const record = getServerAmbientSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Ambient session not found.');
  }

  const turns = record.turns.map((turn) => {
    if (turn.id !== input.turnId) {
      return turn;
    }

    const attributionNeedsReview = turn.providerConfirmed ? false : turn.speakerConfidence < ATTRIBUTION_THRESHOLD;
    return {
      ...turn,
      speakerRole: input.role,
      attributionNeedsReview,
      severityBadges: Array.from(new Set([
        ...turn.severityBadges.filter((badge) => badge !== 'speaker review'),
        ...(attributionNeedsReview ? ['speaker review'] : []),
      ])),
    };
  });

  const targetTurn = turns.find((turn) => turn.id === input.turnId);
  const sections = updateSectionBlockingForTurn(record.sections, input.turnId, Boolean(targetTurn?.attributionNeedsReview && !targetTurn.providerConfirmed));

  const nextRecord = reconcileStateForReview({
    ...record,
    turns,
    sections,
  });

  persistServerAmbientSession(nextRecord);
  return nextRecord;
}

export function setServerAmbientSpeakerLabel(input: {
  sessionId: string;
  providerIdentityId: string;
  turnId: string;
  speakerLabel: string | null;
}) {
  const record = getServerAmbientSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Ambient session not found.');
  }

  const nextRecord: ServerAmbientSessionRecord = {
    ...record,
    turns: record.turns.map((turn) => (
      turn.id === input.turnId
        ? { ...turn, speakerLabel: input.speakerLabel }
        : turn
    )),
  };

  persistServerAmbientSession(nextRecord);
  return nextRecord;
}

export function markServerAmbientTurnUnresolved(input: {
  sessionId: string;
  providerIdentityId: string;
  turnId: string;
}) {
  const record = getServerAmbientSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Ambient session not found.');
  }

  const turns = record.turns.map((turn): AmbientTranscriptTurnViewModel => (
    turn.id === input.turnId
      ? {
          ...turn,
          speakerRole: 'unknown',
          speakerLabel: null,
          providerConfirmed: false,
          attributionNeedsReview: true,
          severityBadges: Array.from(new Set([...turn.severityBadges, 'speaker review'])),
        }
      : turn
  ));

  const sections = updateSectionBlockingForTurn(record.sections, input.turnId, true);
  const nextRecord = reconcileStateForReview({
    ...record,
    turns,
    sections,
  });

  persistServerAmbientSession(nextRecord);
  return nextRecord;
}

export function excludeServerAmbientTurn(input: {
  sessionId: string;
  providerIdentityId: string;
  turnId: string;
  excluded: boolean;
}) {
  const record = getServerAmbientSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Ambient session not found.');
  }

  const turns = record.turns.map((turn) => (
    turn.id === input.turnId
      ? {
          ...turn,
          excludedFromDraft: input.excluded,
          exclusionReason: input.excluded ? 'provider_excluded' : null,
        }
      : turn
  ));

  const nextRecord = reconcileStateForReview({
    ...record,
    turns,
  });
  persistServerAmbientSession(nextRecord);
  return nextRecord;
}

export function confirmServerAmbientTurn(input: {
  sessionId: string;
  providerIdentityId: string;
  turnId: string;
}) {
  const record = getServerAmbientSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Ambient session not found.');
  }

  const turns = record.turns.map((turn) => (
    turn.id === input.turnId
      ? {
          ...turn,
          providerConfirmed: true,
          attributionNeedsReview: false,
          severityBadges: turn.severityBadges.filter((badge) => badge !== 'speaker review'),
        }
      : turn
  ));

  const sections = updateSectionBlockingForTurn(record.sections, input.turnId, false);
  const nextRecord = reconcileStateForReview({
    ...record,
    turns,
    sections,
  });

  persistServerAmbientSession(nextRecord);
  return nextRecord;
}

export function editServerAmbientSentence(input: {
  sessionId: string;
  providerIdentityId: string;
  sentenceId: string;
  text: string;
}) {
  const record = getServerAmbientSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Ambient session not found.');
  }

  const nextRecord: ServerAmbientSessionRecord = {
    ...record,
    sections: record.sections.map((section) => ({
      ...section,
      sentences: section.sentences.map((sentence) => (
        sentence.sentenceId === input.sentenceId
          ? { ...sentence, text: input.text }
          : sentence
      )),
    })),
  };

  persistServerAmbientSession(nextRecord);
  return nextRecord;
}

export function setServerAmbientSentenceStatus(input: {
  sessionId: string;
  providerIdentityId: string;
  sentenceId: string;
  accepted: boolean;
  rejected: boolean;
}) {
  const record = getServerAmbientSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Ambient session not found.');
  }

  const nextRecord: ServerAmbientSessionRecord = {
    ...record,
    state: input.accepted ? 'accepted_into_note' : record.state,
    sections: record.sections.map((section) => ({
      ...section,
      sentences: section.sentences.map((sentence) => (
        sentence.sentenceId === input.sentenceId
          ? { ...sentence, accepted: input.accepted, rejected: input.rejected }
          : sentence
      )),
    })),
  };

  persistServerAmbientSession(nextRecord);
  return nextRecord;
}

export function acceptServerAmbientSection(input: {
  sessionId: string;
  providerIdentityId: string;
  sectionId: string;
}) {
  const record = getServerAmbientSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Ambient session not found.');
  }

  const nextRecord: ServerAmbientSessionRecord = {
    ...record,
    state: 'accepted_into_note',
    sections: record.sections.map((section) => (
      section.sectionId === input.sectionId
        ? {
            ...section,
            sentences: section.sentences.map((sentence) => ({ ...sentence, accepted: true, rejected: false })),
          }
        : section
    )),
  };

  persistServerAmbientSession(nextRecord);
  return nextRecord;
}

export function drainServerAmbientTranscriptEvents(input: {
  sessionId: string;
  providerIdentityId: string;
  limit?: number;
  deliveryTransport?: AmbientTranscriptDeliveryTransport;
}) {
  const record = getServerAmbientSession(input.sessionId, input.providerIdentityId);
  if (!record) {
    throw new Error('Ambient session not found.');
  }

  const limit = Math.max(1, input.limit || 1);
  const events = record.pendingTranscriptEvents.slice(0, limit);
  let nextRecord: ServerAmbientSessionRecord = {
    ...record,
    pendingTranscriptEvents: record.pendingTranscriptEvents.slice(limit),
    lastTranscriptDeliveryTransport: events.length ? (input.deliveryTransport || 'polling_pull') : record.lastTranscriptDeliveryTransport,
  };

  for (const event of events) {
    nextRecord = {
      ...applyTranscriptEvent(nextRecord, event),
      pendingTranscriptEvents: nextRecord.pendingTranscriptEvents,
    };
  }

  persistServerAmbientSession(nextRecord);
  return {
    events: cloneTranscriptEvents(events),
    session: nextRecord,
  };
}

export function serializeAmbientSession(record: ServerAmbientSessionRecord) {
  return {
    sessionId: record.sessionId,
    encounterId: record.encounterId,
    providerIdentityId: record.providerIdentityId,
    state: record.state,
    setupDraft: cloneSetupDraft(record.setupDraft),
    participants: record.participants.map((participant) => ({ ...participant })),
    consentDrafts: cloneConsentDrafts(record.consentDrafts),
    turns: cloneTurns(record.turns),
    sections: cloneSections(record.sections),
    reviewFlags: cloneFlags(record.reviewFlags),
    queuedTranscriptEventCount: record.pendingTranscriptEvents.length,
    transcriptAdapterId: record.transcriptAdapterId,
    transcriptAdapterLabel: record.transcriptAdapterLabel,
    transcriptSourceKind: record.transcriptSourceKind,
    transcriptTransportPhase: deriveTranscriptTransportPhase(record),
    transcriptDeliveryTransport: record.lastTranscriptDeliveryTransport,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    stoppedAt: record.stoppedAt,
    transcriptEventCount: record.transcriptEventCount,
  };
}
