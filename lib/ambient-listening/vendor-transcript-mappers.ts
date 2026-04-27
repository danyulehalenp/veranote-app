import type { AmbientParticipantRole, AmbientTranscriptIngressEvent, AmbientTranscriptIngressTurn } from '@/types/ambient-listening';

const SPEAKER_REVIEW_THRESHOLD = 0.9;

export type VendorTranscriptSpeakerHint =
  | 'provider'
  | 'clinician'
  | 'doctor'
  | 'patient'
  | 'client'
  | 'family'
  | 'collateral'
  | 'guardian'
  | 'caregiver'
  | 'unknown';

export type VendorTranscriptSegment = {
  segmentId?: string;
  startMs: number;
  endMs: number;
  text: string;
  normalizedText?: string | null;
  isFinal: boolean;
  textConfidence?: number;
  speaker?: {
    label?: string | null;
    roleHint?: VendorTranscriptSpeakerHint;
    confidence?: number;
  };
  clinicalConcepts?: string[];
  riskMarkers?: string[];
};

export type OpenAIRealtimeAmbientSegment = VendorTranscriptSegment & {
  itemId?: string;
  responseId?: string;
};

function mapVendorSpeakerRole(roleHint?: VendorTranscriptSpeakerHint): AmbientParticipantRole {
  switch (roleHint) {
    case 'provider':
    case 'clinician':
    case 'doctor':
      return 'provider';
    case 'patient':
    case 'client':
      return 'patient';
    case 'family':
    case 'collateral':
      return 'family_member';
    case 'guardian':
      return 'guardian';
    case 'caregiver':
      return 'caregiver';
    default:
      return 'unknown';
  }
}

function buildIngressTurnFromVendorSegment(segment: VendorTranscriptSegment): AmbientTranscriptIngressTurn {
  const speakerRole = mapVendorSpeakerRole(segment.speaker?.roleHint);
  const speakerConfidence = segment.speaker?.confidence ?? 0.5;
  const attributionNeedsReview = speakerRole === 'unknown' || speakerConfidence < SPEAKER_REVIEW_THRESHOLD;

  return {
    id: segment.segmentId,
    startMs: segment.startMs,
    endMs: segment.endMs,
    speakerRole,
    speakerLabel: segment.speaker?.label || null,
    speakerConfidence,
    text: segment.text,
    normalizedText: segment.normalizedText || null,
    textConfidence: segment.textConfidence ?? 0.5,
    isFinal: segment.isFinal,
    clinicalConcepts: segment.clinicalConcepts || [],
    riskMarkers: segment.riskMarkers || [],
    reviewHints: {
      severityBadges: attributionNeedsReview ? ['speaker review'] : [],
      attributionNeedsReview,
      textNeedsReview: false,
      linkedDraftSentenceIds: [],
      providerConfirmed: false,
    },
  };
}

export function mapVendorTranscriptSegmentsToAmbientIngressEvents(input: {
  segments: VendorTranscriptSegment[];
}) {
  return input.segments.map((segment): AmbientTranscriptIngressEvent => ({
    id: segment.segmentId,
    eventType: segment.isFinal ? 'final_turn' : 'interim_turn',
    turn: buildIngressTurnFromVendorSegment(segment),
  }));
}

export function mapOpenAIRealtimeSegmentsToAmbientIngressEvents(input: {
  segments: OpenAIRealtimeAmbientSegment[];
}) {
  return mapVendorTranscriptSegmentsToAmbientIngressEvents({
    segments: input.segments.map((segment) => ({
      ...segment,
      segmentId: segment.segmentId || segment.itemId || segment.responseId,
    })),
  });
}
