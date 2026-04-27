import { getAmbientMockTurns, type AmbientSessionSetupDraft, type AmbientTranscriptTurnViewModel } from '@/lib/ambient-listening/mock-data';
import {
  buildOpenAIRealtimeAmbientIngressEventsFromMockTurns,
  OPENAI_REALTIME_AMBIENT_ADAPTER_DESCRIPTOR,
} from '@/lib/ambient-listening/openai-realtime-ambient-adapter';
import type {
  AmbientTranscriptAdapterDescriptor,
  AmbientTranscriptEventEnvelope,
  AmbientTranscriptEventType,
  AmbientTranscriptIngressEvent,
  AmbientTranscriptIngressTurn,
  AmbientTranscriptSourceKind,
} from '@/types/ambient-listening';

type AmbientServerTranscriptAdapter = AmbientTranscriptAdapterDescriptor & {
  buildTranscriptEvents: (input: {
    sessionId: string;
    setupDraft: AmbientSessionSetupDraft;
    createId: (prefix: string) => string;
  }) => AmbientTranscriptEventEnvelope[];
};

function cloneTurn(turn: AmbientTranscriptTurnViewModel): AmbientTranscriptTurnViewModel {
  return {
    ...turn,
    clinicalConcepts: [...turn.clinicalConcepts],
    riskMarkers: [...turn.riskMarkers],
    severityBadges: [...turn.severityBadges],
    linkedDraftSentenceIds: [...turn.linkedDraftSentenceIds],
  };
}

export function normalizeAmbientTranscriptIngressEvents(input: {
  sessionId: string;
  sourceKind: Exclude<AmbientTranscriptSourceKind, 'none'>;
  deliveryTransport?: AmbientTranscriptEventEnvelope['deliveryTransport'];
  events: AmbientTranscriptIngressEvent[];
  createId: (prefix: string) => string;
}) {
  return input.events.map((event): AmbientTranscriptEventEnvelope => {
    const eventType: AmbientTranscriptEventType = event.eventType || (event.turn.isFinal ? 'final_turn' : 'interim_turn');
    const turnId = event.turn.id || input.createId('ambient-turn');

    return {
      id: event.id || input.createId('ambient-event'),
      eventType,
      occurredAt: event.occurredAt || new Date().toISOString(),
      sourceKind: input.sourceKind,
      deliveryTransport: input.deliveryTransport,
      turn: {
        id: turnId,
        sessionId: input.sessionId,
        startMs: event.turn.startMs,
        endMs: event.turn.endMs,
        speakerRole: event.turn.speakerRole || 'unknown',
        speakerLabel: event.turn.speakerLabel || null,
        speakerConfidence: event.turn.speakerConfidence ?? 0.5,
        text: event.turn.text,
        normalizedText: event.turn.normalizedText || null,
        textConfidence: event.turn.textConfidence ?? 0.5,
        isFinal: event.turn.isFinal,
        excludedFromDraft: event.turn.excludedFromDraft ?? false,
        exclusionReason: event.turn.exclusionReason || null,
        clinicalConcepts: [...(event.turn.clinicalConcepts || [])],
        riskMarkers: [...(event.turn.riskMarkers || [])],
      },
      reviewHints: event.turn.reviewHints
        ? {
            severityBadges: [...(event.turn.reviewHints.severityBadges || [])],
            attributionNeedsReview: event.turn.reviewHints.attributionNeedsReview,
            textNeedsReview: event.turn.reviewHints.textNeedsReview,
            linkedDraftSentenceIds: [...(event.turn.reviewHints.linkedDraftSentenceIds || [])],
            providerConfirmed: event.turn.reviewHints.providerConfirmed,
          }
        : undefined,
    };
  });
}

function buildIngressEventsFromMockTurns() {
  return getAmbientMockTurns().flatMap((turn) => {
    const fullTurn = cloneTurn(turn);
    const interimText = fullTurn.text.length > 48 ? `${fullTurn.text.slice(0, 48).trim()}...` : fullTurn.text;
    const interimTurn: AmbientTranscriptIngressTurn = {
      id: fullTurn.id,
      startMs: fullTurn.startMs,
      endMs: fullTurn.endMs,
      speakerRole: fullTurn.speakerRole,
      speakerLabel: fullTurn.speakerLabel,
      speakerConfidence: fullTurn.speakerConfidence,
      text: interimText,
      normalizedText: interimText,
      textConfidence: fullTurn.textConfidence,
      isFinal: false,
      excludedFromDraft: fullTurn.excludedFromDraft,
      exclusionReason: fullTurn.exclusionReason,
      clinicalConcepts: fullTurn.clinicalConcepts,
      riskMarkers: fullTurn.riskMarkers,
      reviewHints: {
        severityBadges: [],
        attributionNeedsReview: false,
        textNeedsReview: fullTurn.textNeedsReview,
        linkedDraftSentenceIds: [],
        providerConfirmed: fullTurn.providerConfirmed,
      },
    };

    const finalTurn: AmbientTranscriptIngressTurn = {
      id: fullTurn.id,
      startMs: fullTurn.startMs,
      endMs: fullTurn.endMs,
      speakerRole: fullTurn.speakerRole,
      speakerLabel: fullTurn.speakerLabel,
      speakerConfidence: fullTurn.speakerConfidence,
      text: fullTurn.text,
      normalizedText: fullTurn.normalizedText,
      textConfidence: fullTurn.textConfidence,
      isFinal: true,
      excludedFromDraft: fullTurn.excludedFromDraft,
      exclusionReason: fullTurn.exclusionReason,
      clinicalConcepts: fullTurn.clinicalConcepts,
      riskMarkers: fullTurn.riskMarkers,
      reviewHints: {
        severityBadges: fullTurn.severityBadges,
        attributionNeedsReview: fullTurn.attributionNeedsReview,
        textNeedsReview: fullTurn.textNeedsReview,
        linkedDraftSentenceIds: fullTurn.linkedDraftSentenceIds,
        providerConfirmed: fullTurn.providerConfirmed,
      },
    };

    return [
      {
        eventType: 'interim_turn',
        turn: interimTurn,
      },
      {
        eventType: 'final_turn',
        turn: finalTurn,
      },
    ] satisfies AmbientTranscriptIngressEvent[];
  });
}

function buildTranscriptEventsFromMockTurns(input: {
  sessionId: string;
  sourceKind: Exclude<AmbientTranscriptSourceKind, 'none'>;
  setupDraft: AmbientSessionSetupDraft;
  createId: (prefix: string) => string;
}) {
  return normalizeAmbientTranscriptIngressEvents({
    sessionId: input.sessionId,
    sourceKind: input.sourceKind,
    events: buildIngressEventsFromMockTurns(),
    createId: input.createId,
  });
}

const bufferedMockAmbientAdapter: AmbientServerTranscriptAdapter = {
  adapterId: 'ambient-buffered-mock',
  adapterLabel: 'Buffered mock transcript queue',
  sourceKind: 'mock_seeded',
  defaultDeliveryTransport: 'polling_pull',
  supportsBufferedReplay: true,
  supportsStreamPush: false,
  buildTranscriptEvents(input) {
    return buildTranscriptEventsFromMockTurns({
      sourceKind: 'mock_seeded',
      sessionId: input.sessionId,
      setupDraft: input.setupDraft,
      createId: input.createId,
    });
  },
};

const liveStreamSimulationAdapter: AmbientServerTranscriptAdapter = {
  ...OPENAI_REALTIME_AMBIENT_ADAPTER_DESCRIPTOR,
  buildTranscriptEvents(input) {
    return normalizeAmbientTranscriptIngressEvents({
      sessionId: input.sessionId,
      sourceKind: 'live_stream_adapter',
      events: buildOpenAIRealtimeAmbientIngressEventsFromMockTurns(),
      createId: input.createId,
    });
  },
};

const adaptersBySourceKind: Record<Exclude<AmbientTranscriptSourceKind, 'none'>, AmbientServerTranscriptAdapter> = {
  mock_seeded: bufferedMockAmbientAdapter,
  live_stream_adapter: liveStreamSimulationAdapter,
};

export function listAmbientServerTranscriptAdapters() {
  return Object.values(adaptersBySourceKind).map((adapter) => ({
    adapterId: adapter.adapterId,
    adapterLabel: adapter.adapterLabel,
    sourceKind: adapter.sourceKind,
    defaultDeliveryTransport: adapter.defaultDeliveryTransport,
    supportsBufferedReplay: adapter.supportsBufferedReplay,
    supportsStreamPush: adapter.supportsStreamPush,
  })) satisfies AmbientTranscriptAdapterDescriptor[];
}

export function resolveAmbientServerTranscriptAdapter(
  transcriptSimulator: AmbientSessionSetupDraft['transcriptSimulator'],
) {
  return adaptersBySourceKind[transcriptSimulator];
}
