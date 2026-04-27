import OpenAI, { toFile } from 'openai';
import { createMockTranscriptSegments } from '@/lib/dictation/providers/mock-stt';
import { buildDictationTranscriptSegment } from '@/lib/dictation/transcript-segment-utils';
import type { DictationAudioChunkUpload, DictationSessionConfig, TranscriptSegment } from '@/types/dictation';

type ServerSessionHandle = {
  sessionId: string;
  provider: string;
};

export type ServerSTTAdapter = {
  adapterId: string;
  createTranscriptEventsFromMockUtterance: (input: {
    config: DictationSessionConfig;
    handle: ServerSessionHandle;
    transcriptText: string;
  }) => Promise<TranscriptSegment[]>;
  createTranscriptEventsFromAudioChunk?: (input: {
    config: DictationSessionConfig;
    handle: ServerSessionHandle;
    chunk: DictationAudioChunkUpload;
    receivedAudioChunkCount: number;
  }) => Promise<TranscriptSegment[]>;
};

export type ServerSTTProviderStatus = {
  providerId: string;
  providerLabel: string;
  adapterId: string;
  available: boolean;
  supportsAudioChunk: boolean;
  supportsMockUtterance: boolean;
  engineLabel: string;
  reason: string;
};

export type ServerSTTProviderSelection = {
  requestedProvider: string;
  activeProvider: string;
  activeProviderLabel: string;
  adapterId: string;
  engineLabel: string;
  fallbackApplied: boolean;
  fallbackReason?: string;
  reason: string;
};

export const mockServerSTTAdapter: ServerSTTAdapter = {
  adapterId: 'mock-stt',
  async createTranscriptEventsFromMockUtterance(input) {
    const segments = createMockTranscriptSegments(input.config, input.handle, input.transcriptText);
    return [segments.interim, segments.final];
  },
  async createTranscriptEventsFromAudioChunk() {
    return [];
  },
};

function decodeBase64Audio(base64Audio: string) {
  return Buffer.from(base64Audio, 'base64');
}

async function transcribeOpenAIAudioChunk(input: {
  config: DictationSessionConfig;
  handle: ServerSessionHandle;
  chunk: DictationAudioChunkUpload;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return [];
  }

  const client = new OpenAI({ apiKey });
  const fileBuffer = decodeBase64Audio(input.chunk.base64Audio);
  const filename = `dictation-${input.handle.sessionId}-${input.chunk.sequence}.${input.chunk.mimeType.includes('mp4') ? 'm4a' : 'webm'}`;
  const transcription = await client.audio.transcriptions.create({
    file: await toFile(fileBuffer, filename, { type: input.chunk.mimeType }),
    model: process.env.OPENAI_STT_MODEL || 'whisper-1',
    prompt: input.config.vocabularyHints?.length
      ? `Preferred vocabulary, names, and pronunciations: ${input.config.vocabularyHints.join(', ')}`
      : undefined,
  });

  const text = typeof transcription.text === 'string' ? transcription.text.trim() : '';
  if (!text) {
    return [];
  }

  return [
    buildDictationTranscriptSegment({
      config: input.config,
      handle: {
        sessionId: input.handle.sessionId,
        provider: 'openai-transcription',
      },
      text,
      isFinal: true,
      modelOrEngine: process.env.OPENAI_STT_MODEL || 'whisper-1',
      sourceMode: 'batch',
    }),
  ];
}

export const openaiChunkTranscriptionAdapter: ServerSTTAdapter = {
  adapterId: 'openai-chunk-transcription',
  async createTranscriptEventsFromMockUtterance(input) {
    const segments = createMockTranscriptSegments(input.config, input.handle, input.transcriptText);
    return [segments.interim, segments.final];
  },
  async createTranscriptEventsFromAudioChunk(input) {
    return transcribeOpenAIAudioChunk(input);
  },
};

function getOpenAIEngineLabel() {
  return process.env.OPENAI_STT_MODEL || 'whisper-1';
}

export function getServerSTTProviderStatuses() {
  const openAiAvailable = Boolean(process.env.OPENAI_API_KEY);

  return [
    {
      providerId: 'openai-transcription',
      providerLabel: 'OpenAI transcription',
      adapterId: openaiChunkTranscriptionAdapter.adapterId,
      available: openAiAvailable,
      supportsAudioChunk: true,
      supportsMockUtterance: true,
      engineLabel: getOpenAIEngineLabel(),
      reason: openAiAvailable
        ? 'OpenAI API key is configured for server transcription.'
        : 'OpenAI transcription is unavailable because OPENAI_API_KEY is not configured.',
    },
    {
      providerId: 'mock-stt',
      providerLabel: 'Mock STT',
      adapterId: mockServerSTTAdapter.adapterId,
      available: true,
      supportsAudioChunk: false,
      supportsMockUtterance: true,
      engineLabel: 'mock-clinical-dictation',
      reason: 'Prototype fallback and internal testing path.',
    },
  ] satisfies ServerSTTProviderStatus[];
}

export function resolveServerSTTProviderSelection(input?: {
  requestedProvider?: string;
  preferRealProvider?: boolean;
  allowMockFallback?: boolean;
}) {
  const statuses = getServerSTTProviderStatuses();
  const statusesById = new Map(statuses.map((item) => [item.providerId, item]));
  const requestedProvider = input?.requestedProvider || (input?.preferRealProvider ? 'openai-transcription' : 'mock-stt');
  const requested = statusesById.get(requestedProvider);

  if (requested?.available) {
    return {
      requestedProvider,
      activeProvider: requested.providerId,
      activeProviderLabel: requested.providerLabel,
      adapterId: requested.adapterId,
      engineLabel: requested.engineLabel,
      fallbackApplied: false,
      reason: requested.reason,
    } satisfies ServerSTTProviderSelection;
  }

  const mockStatus = statusesById.get('mock-stt')!;
  if (input?.allowMockFallback !== false && mockStatus.available) {
    return {
      requestedProvider,
      activeProvider: mockStatus.providerId,
      activeProviderLabel: mockStatus.providerLabel,
      adapterId: mockStatus.adapterId,
      engineLabel: mockStatus.engineLabel,
      fallbackApplied: requestedProvider !== mockStatus.providerId,
      fallbackReason: requested?.reason || 'Requested provider is unavailable.',
      reason: 'Falling back to mock STT for internal prototype continuity.',
    } satisfies ServerSTTProviderSelection;
  }

  return {
    requestedProvider,
    activeProvider: requestedProvider,
    activeProviderLabel: requested?.providerLabel || requestedProvider,
    adapterId: requested?.adapterId || 'unavailable',
    engineLabel: requested?.engineLabel || 'Unavailable',
    fallbackApplied: false,
    fallbackReason: requested?.reason || 'Requested provider is unavailable.',
    reason: requested?.reason || 'Requested provider is unavailable.',
  } satisfies ServerSTTProviderSelection;
}

export function resolveServerSTTAdapter(sttProvider: string): ServerSTTAdapter {
  if (sttProvider === 'openai-transcription') {
    return openaiChunkTranscriptionAdapter;
  }

  if (sttProvider === 'mock-stt') {
    return mockServerSTTAdapter;
  }

  return mockServerSTTAdapter;
}
