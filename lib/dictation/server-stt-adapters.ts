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

export function resolveServerSTTAdapter(sttProvider: string): ServerSTTAdapter {
  if (sttProvider === 'openai-transcription') {
    return openaiChunkTranscriptionAdapter;
  }

  if (sttProvider === 'mock-stt') {
    return mockServerSTTAdapter;
  }

  return mockServerSTTAdapter;
}
