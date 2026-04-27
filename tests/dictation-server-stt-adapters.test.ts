import { describe, expect, it } from 'vitest';
import {
  getServerSTTProviderStatuses,
  resolveServerSTTProviderSelection,
} from '@/lib/dictation/server-stt-adapters';

describe('server STT adapters', () => {
  it('reports provider availability and adapter metadata', () => {
    const statuses = getServerSTTProviderStatuses();

    expect(statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: 'openai-transcription',
          adapterId: 'openai-chunk-transcription',
          supportsAudioChunk: true,
        }),
        expect.objectContaining({
          providerId: 'mock-stt',
          adapterId: 'mock-stt',
          supportsAudioChunk: false,
        }),
      ]),
    );
  });

  it('falls back to mock STT when a requested real provider is unavailable', () => {
    const selection = resolveServerSTTProviderSelection({
      requestedProvider: 'openai-transcription',
      allowMockFallback: true,
    });

    expect(selection).toMatchObject({
      requestedProvider: 'openai-transcription',
      activeProvider: 'mock-stt',
      fallbackApplied: true,
      adapterId: 'mock-stt',
    });
  });
});
