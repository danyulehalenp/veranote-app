import OpenAI, { toFile } from 'openai';
import { getAmbientMockTurns, type AmbientSessionSetupDraft, type AmbientTranscriptTurnViewModel } from '@/lib/ambient-listening/mock-data';
import {
  buildOpenAIRealtimeAmbientIngressEventsFromMockTurns,
  OPENAI_REALTIME_AMBIENT_ADAPTER_DESCRIPTOR,
} from '@/lib/ambient-listening/openai-realtime-ambient-adapter';
import { shapeAmbientSttSegments } from '@/lib/ambient-listening/transcript-shaper';
import { mapAmbientSttSegmentsToAmbientIngressEvents } from '@/lib/ambient-listening/vendor-transcript-mappers';
import type {
  AmbientBatchTranscriptionProviderResult,
  AmbientSttProviderError,
  AmbientSttProviderId,
  AmbientSttSegment,
  AmbientTranscriptAdapterDescriptor,
  AmbientTranscriptEventEnvelope,
  AmbientTranscriptEventType,
  AmbientTranscriptIngressEvent,
  AmbientTranscriptIngressTurn,
  AmbientTranscriptSourceKind,
} from '@/types/ambient-listening';

type AmbientSimulatorSourceKind = Extract<AmbientTranscriptSourceKind, 'mock_seeded' | 'live_stream_adapter'>;

type AmbientServerTranscriptAdapter = AmbientTranscriptAdapterDescriptor & {
  buildTranscriptEvents: (input: {
    sessionId: string;
    setupDraft: AmbientSessionSetupDraft;
    createId: (prefix: string) => string;
  }) => AmbientTranscriptEventEnvelope[];
};

export type AmbientBatchTranscriptionProviderStatus = {
  providerId: AmbientSttProviderId;
  providerLabel: string;
  available: boolean;
  prefersDiarization: boolean;
  reason: string;
};

export type AmbientBatchTranscriptionProviderSelection = {
  requestedProvider: AmbientSttProviderId | 'auto';
  activeProvider: AmbientSttProviderId;
  activeProviderLabel: string;
  fallbackApplied: boolean;
  fallbackReason?: string;
  reason: string;
};

export type AmbientBatchTranscriptionInput = {
  base64Audio: string;
  mimeType: string;
  vocabularyHints?: string[];
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

const adaptersBySourceKind: Record<AmbientSimulatorSourceKind, AmbientServerTranscriptAdapter> = {
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

function getOpenAIModel() {
  return process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe';
}

function buildUnavailableAmbientProviderError(input: {
  providerId: AmbientSttProviderId;
  message: string;
}) {
  return {
    providerId: input.providerId,
    code: 'provider_unavailable',
    message: input.message,
    retryable: false,
    rawProviderMetadata: null,
  } satisfies AmbientSttProviderError;
}

export function getAmbientBatchTranscriptionProviderStatuses() {
  const deepgramAvailable = Boolean(process.env.DEEPGRAM_API_KEY);
  const openAiAvailable = Boolean(process.env.OPENAI_API_KEY);

  return [
    {
      providerId: 'deepgram-batch-diarization',
      providerLabel: 'Deepgram batch diarization',
      available: deepgramAvailable,
      prefersDiarization: true,
      reason: deepgramAvailable
        ? 'Deepgram API key is configured for batch diarization.'
        : 'Deepgram batch diarization is unavailable because DEEPGRAM_API_KEY is not configured.',
    },
    {
      providerId: 'openai-batch-transcription',
      providerLabel: 'OpenAI batch transcription',
      available: openAiAvailable,
      prefersDiarization: false,
      reason: openAiAvailable
        ? 'OpenAI API key is configured for batch transcription fallback.'
        : 'OpenAI batch transcription is unavailable because OPENAI_API_KEY is not configured.',
    },
    {
      providerId: 'mock-simulation',
      providerLabel: 'Mock simulation',
      available: true,
      prefersDiarization: false,
      reason: 'Internal preview path only.',
    },
  ] satisfies AmbientBatchTranscriptionProviderStatus[];
}

export function resolveAmbientBatchTranscriptionProviderSelection(input?: {
  requestedProvider?: AmbientSttProviderId | 'auto';
  allowMockSimulationFallback?: boolean;
}) {
  const statuses = getAmbientBatchTranscriptionProviderStatuses();
  const statusById = new Map(statuses.map((status) => [status.providerId, status]));
  const requestedProvider = input?.requestedProvider || 'auto';

  if (requestedProvider !== 'auto') {
    const requested = statusById.get(requestedProvider);
    if (requested?.available) {
      return {
        requestedProvider,
        activeProvider: requested.providerId,
        activeProviderLabel: requested.providerLabel,
        fallbackApplied: false,
        reason: requested.reason,
      } satisfies AmbientBatchTranscriptionProviderSelection;
    }
  }

  const preferred = statusById.get('deepgram-batch-diarization');
  if (preferred?.available) {
    return {
      requestedProvider,
      activeProvider: preferred.providerId,
      activeProviderLabel: preferred.providerLabel,
      fallbackApplied: requestedProvider !== 'auto' && requestedProvider !== preferred.providerId,
      fallbackReason: requestedProvider !== 'auto' && requestedProvider !== preferred.providerId
        ? statusById.get(requestedProvider)?.reason || 'Requested provider unavailable.'
        : undefined,
      reason: preferred.reason,
    } satisfies AmbientBatchTranscriptionProviderSelection;
  }

  const openai = statusById.get('openai-batch-transcription');
  if (openai?.available) {
    return {
      requestedProvider,
      activeProvider: openai.providerId,
      activeProviderLabel: openai.providerLabel,
      fallbackApplied: requestedProvider !== 'auto' && requestedProvider !== openai.providerId,
      fallbackReason: requestedProvider !== 'auto' && requestedProvider !== openai.providerId
        ? statusById.get(requestedProvider)?.reason || 'Requested provider unavailable.'
        : preferred?.reason,
      reason: openai.reason,
    } satisfies AmbientBatchTranscriptionProviderSelection;
  }

  if (input?.allowMockSimulationFallback) {
    const mock = statusById.get('mock-simulation')!;
    return {
      requestedProvider,
      activeProvider: mock.providerId,
      activeProviderLabel: mock.providerLabel,
      fallbackApplied: true,
      fallbackReason: 'No real ambient transcription provider is configured.',
      reason: mock.reason,
    } satisfies AmbientBatchTranscriptionProviderSelection;
  }

  throw buildUnavailableAmbientProviderError({
    providerId: 'openai-batch-transcription',
    message: 'No real ambient transcription provider is configured. Set DEEPGRAM_API_KEY or OPENAI_API_KEY.',
  });
}

export function mapDeepgramBatchUtterancesToAmbientSegments(input: {
  utterances: Array<{
    id?: string | number;
    transcript?: string;
    start?: number;
    end?: number;
    confidence?: number;
    speaker?: number | string;
    words?: Array<{
      word?: string;
      start?: number;
      end?: number;
      confidence?: number;
      speaker?: number | string;
    }>;
    [key: string]: unknown;
  }>;
}) {
  return input.utterances
    .filter((utterance) => typeof utterance.transcript === 'string' && utterance.transcript.trim())
    .map((utterance, index) => {
      const speakerLabel = utterance.speaker === undefined || utterance.speaker === null
        ? null
        : `speaker_${utterance.speaker}`;
      return {
        segmentId: `deepgram-utterance-${utterance.id ?? index + 1}`,
        text: utterance.transcript!.trim(),
        startMs: Math.round((utterance.start || 0) * 1000),
        endMs: Math.round((utterance.end || 0) * 1000),
        isFinal: true,
        textConfidence: utterance.confidence ?? 0.65,
        speakerLabel,
        speakerConfidence: utterance.confidence ?? 0.65,
        wordTimings: Array.isArray(utterance.words)
          ? utterance.words
              .filter((word) => typeof word.word === 'string' && word.word.trim())
              .map((word) => ({
                word: word.word!.trim(),
                startMs: Math.round((word.start || 0) * 1000),
                endMs: Math.round((word.end || 0) * 1000),
                confidence: word.confidence ?? null,
                speakerLabel: word.speaker === undefined || word.speaker === null ? speakerLabel : `speaker_${word.speaker}`,
              }))
          : [],
        rawProviderMetadata: {
          speaker: utterance.speaker ?? null,
          utteranceId: utterance.id ?? null,
        },
      } satisfies AmbientSttSegment;
    });
}

export async function transcribeAmbientAudioWithDeepgram(input: AmbientBatchTranscriptionInput) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw buildUnavailableAmbientProviderError({
      providerId: 'deepgram-batch-diarization',
      message: 'Deepgram batch diarization is unavailable because DEEPGRAM_API_KEY is not configured.',
    });
  }

  const audioBuffer = Buffer.from(input.base64Audio, 'base64');
  if (!audioBuffer.length) {
    throw new Error('Ambient audio payload is empty.');
  }

  const response = await fetch('https://api.deepgram.com/v1/listen?smart_format=true&punctuate=true&diarize=true&utterances=true', {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': input.mimeType,
    },
    body: audioBuffer,
  });

  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw {
      providerId: 'deepgram-batch-diarization',
      code: 'deepgram_request_failed',
      message: typeof payload.err_msg === 'string' ? payload.err_msg : 'Deepgram ambient transcription failed.',
      retryable: response.status >= 500,
      rawProviderMetadata: payload,
    } satisfies AmbientSttProviderError;
  }

  const utterances = (((payload.results as Record<string, unknown> | undefined)?.utterances) || []) as Array<Record<string, unknown>>;
  const segments = mapDeepgramBatchUtterancesToAmbientSegments({
    utterances: utterances as Array<{
      id?: string | number;
      transcript?: string;
      start?: number;
      end?: number;
      confidence?: number;
      speaker?: number | string;
      words?: Array<{
        word?: string;
        start?: number;
        end?: number;
        confidence?: number;
        speaker?: number | string;
      }>;
      [key: string]: unknown;
    }>,
  });
  const transcriptText = segments.map((segment) => segment.text).join(' ').trim();
  if (!transcriptText) {
    throw {
      providerId: 'deepgram-batch-diarization',
      code: 'empty_transcript',
      message: 'Deepgram ambient transcription returned no text.',
      retryable: false,
      rawProviderMetadata: payload,
    } satisfies AmbientSttProviderError;
  }

  return {
    providerId: 'deepgram-batch-diarization',
    providerLabel: 'Deepgram batch diarization',
    transcriptText,
    segments,
    rawProviderMetadata: payload,
  } satisfies AmbientBatchTranscriptionProviderResult;
}

export async function transcribeAmbientAudioWithOpenAI(input: AmbientBatchTranscriptionInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw buildUnavailableAmbientProviderError({
      providerId: 'openai-batch-transcription',
      message: 'Ambient transcription is unavailable because OPENAI_API_KEY is not configured.',
    });
  }

  const audioBuffer = Buffer.from(input.base64Audio, 'base64');
  if (!audioBuffer.length) {
    throw new Error('Ambient audio payload is empty.');
  }

  const client = new OpenAI({ apiKey });
  const extension = input.mimeType.includes('mp4')
    ? 'm4a'
    : input.mimeType.includes('wav')
      ? 'wav'
      : input.mimeType.includes('mpeg') || input.mimeType.includes('mp3')
        ? 'mp3'
        : 'webm';
  const filename = `ambient-capture.${extension}`;
  const transcription = await client.audio.transcriptions.create({
    file: await toFile(audioBuffer, filename, { type: input.mimeType }),
    model: getOpenAIModel(),
    prompt: input.vocabularyHints?.length
      ? `Preferred vocabulary, names, and pronunciations: ${input.vocabularyHints.join(', ')}`
      : undefined,
  });

  const transcriptText = typeof transcription.text === 'string' ? transcription.text.trim() : '';
  if (!transcriptText) {
    throw new Error('Ambient transcription returned no text.');
  }

  return {
    providerId: 'openai-batch-transcription',
    providerLabel: 'OpenAI batch transcription',
    transcriptText,
    segments: [
      {
        segmentId: 'openai-transcript-1',
        text: transcriptText,
        startMs: 0,
        endMs: 0,
        isFinal: true,
        textConfidence: 0.72,
        speakerLabel: null,
        speakerConfidence: 0.35,
        wordTimings: [],
        rawProviderMetadata: {
          model: getOpenAIModel(),
        },
      },
    ],
    rawProviderMetadata: {
      model: getOpenAIModel(),
    },
  } satisfies AmbientBatchTranscriptionProviderResult;
}

export async function transcribeAmbientAudioWithPreferredProvider(input: AmbientBatchTranscriptionInput & {
  requestedProvider?: AmbientSttProviderId | 'auto';
  allowMockSimulationFallback?: boolean;
}) {
  const selection = resolveAmbientBatchTranscriptionProviderSelection({
    requestedProvider: input.requestedProvider,
    allowMockSimulationFallback: input.allowMockSimulationFallback,
  });

  if (selection.activeProvider === 'deepgram-batch-diarization') {
    try {
      const result = await transcribeAmbientAudioWithDeepgram(input);
      const shapedSegments = shapeAmbientSttSegments({
        providerId: result.providerId,
        segments: result.segments,
      });
      return {
        selection,
        result,
        ingressEvents: mapAmbientSttSegmentsToAmbientIngressEvents({ segments: shapedSegments }),
      };
    } catch (error) {
      const openaiStatuses = getAmbientBatchTranscriptionProviderStatuses();
      const openaiAvailable = openaiStatuses.find((status) => status.providerId === 'openai-batch-transcription')?.available;
      if (!openaiAvailable || input.requestedProvider === 'deepgram-batch-diarization') {
        throw error;
      }

      const fallbackSelection = {
        requestedProvider: selection.requestedProvider,
        activeProvider: 'openai-batch-transcription',
        activeProviderLabel: 'OpenAI batch transcription',
        fallbackApplied: true,
        fallbackReason: error instanceof Error ? error.message : 'Deepgram ambient transcription failed.',
        reason: 'Falling back to OpenAI batch transcription.',
      } satisfies AmbientBatchTranscriptionProviderSelection;
      const result = await transcribeAmbientAudioWithOpenAI(input);
      const shapedSegments = shapeAmbientSttSegments({
        providerId: result.providerId,
        segments: result.segments,
      });
      return {
        selection: fallbackSelection,
        result,
        ingressEvents: mapAmbientSttSegmentsToAmbientIngressEvents({ segments: shapedSegments }),
      };
    }
  }

  if (selection.activeProvider === 'openai-batch-transcription') {
    const result = await transcribeAmbientAudioWithOpenAI(input);
    const shapedSegments = shapeAmbientSttSegments({
      providerId: result.providerId,
      segments: result.segments,
    });
    return {
      selection,
      result,
      ingressEvents: mapAmbientSttSegmentsToAmbientIngressEvents({ segments: shapedSegments }),
    };
  }

  throw buildUnavailableAmbientProviderError({
    providerId: selection.activeProvider,
    message: 'Mock simulation is not supported for real microphone ambient transcription.',
  });
}
