import { getAmbientMockTurns, type AmbientTranscriptTurnViewModel } from '@/lib/ambient-listening/mock-data';
import { mapOpenAIRealtimeSegmentsToAmbientIngressEvents, type OpenAIRealtimeAmbientSegment } from '@/lib/ambient-listening/vendor-transcript-mappers';
import type { AmbientTranscriptAdapterDescriptor, AmbientTranscriptIngressEvent } from '@/types/ambient-listening';

function cloneTurn(turn: AmbientTranscriptTurnViewModel): AmbientTranscriptTurnViewModel {
  return {
    ...turn,
    clinicalConcepts: [...turn.clinicalConcepts],
    riskMarkers: [...turn.riskMarkers],
    severityBadges: [...turn.severityBadges],
    linkedDraftSentenceIds: [...turn.linkedDraftSentenceIds],
  };
}

function mapAmbientRoleToOpenAISpeakerHint(role: AmbientTranscriptTurnViewModel['speakerRole']) {
  switch (role) {
    case 'provider':
      return 'clinician' as const;
    case 'patient':
      return 'patient' as const;
    case 'family_member':
      return 'family' as const;
    case 'guardian':
      return 'guardian' as const;
    case 'caregiver':
      return 'caregiver' as const;
    default:
      return 'unknown' as const;
  }
}

export const OPENAI_REALTIME_AMBIENT_ADAPTER_DESCRIPTOR = {
  adapterId: 'ambient-openai-realtime-stub',
  adapterLabel: 'OpenAI Realtime ambient adapter (stub)',
  sourceKind: 'live_stream_adapter',
  defaultDeliveryTransport: 'stream_push',
  supportsBufferedReplay: false,
  supportsStreamPush: true,
} satisfies AmbientTranscriptAdapterDescriptor;

export function buildOpenAIRealtimeMockSegments() {
  return getAmbientMockTurns().flatMap((turn) => {
    const fullTurn = cloneTurn(turn);
    const interimText = fullTurn.text.length > 48 ? `${fullTurn.text.slice(0, 48).trim()}...` : fullTurn.text;

    return [
      {
        itemId: `${fullTurn.id}-interim`,
        responseId: `${fullTurn.id}-response`,
        startMs: fullTurn.startMs,
        endMs: fullTurn.endMs,
        text: interimText,
        normalizedText: interimText,
        isFinal: false,
        textConfidence: fullTurn.textConfidence,
        speaker: {
          label: fullTurn.speakerLabel,
          roleHint: mapAmbientRoleToOpenAISpeakerHint(fullTurn.speakerRole),
          confidence: fullTurn.speakerConfidence,
        },
        clinicalConcepts: [...fullTurn.clinicalConcepts],
        riskMarkers: [...fullTurn.riskMarkers],
      },
      {
        itemId: `${fullTurn.id}-final`,
        responseId: `${fullTurn.id}-response`,
        startMs: fullTurn.startMs,
        endMs: fullTurn.endMs,
        text: fullTurn.text,
        normalizedText: fullTurn.normalizedText,
        isFinal: true,
        textConfidence: fullTurn.textConfidence,
        speaker: {
          label: fullTurn.speakerLabel,
          roleHint: mapAmbientRoleToOpenAISpeakerHint(fullTurn.speakerRole),
          confidence: fullTurn.speakerConfidence,
        },
        clinicalConcepts: [...fullTurn.clinicalConcepts],
        riskMarkers: [...fullTurn.riskMarkers],
      },
    ] satisfies OpenAIRealtimeAmbientSegment[];
  });
}

export function buildOpenAIRealtimeAmbientIngressEventsFromMockTurns(): AmbientTranscriptIngressEvent[] {
  return mapOpenAIRealtimeSegmentsToAmbientIngressEvents({
    segments: buildOpenAIRealtimeMockSegments(),
  });
}
