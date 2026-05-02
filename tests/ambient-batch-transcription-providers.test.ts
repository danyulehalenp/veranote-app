import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAmbientBatchTranscriptionProviderStatuses,
  mapDeepgramBatchUtterancesToAmbientSegments,
  resolveAmbientBatchTranscriptionProviderSelection,
} from '@/lib/ambient-listening/server-transcript-adapters';
import { mapAmbientSttSegmentsToAmbientIngressEvents } from '@/lib/ambient-listening/vendor-transcript-mappers';

const originalDeepgramKey = process.env.DEEPGRAM_API_KEY;
const originalOpenAiKey = process.env.OPENAI_API_KEY;

function restoreEnv() {
  if (originalDeepgramKey === undefined) {
    delete process.env.DEEPGRAM_API_KEY;
  } else {
    process.env.DEEPGRAM_API_KEY = originalDeepgramKey;
  }

  if (originalOpenAiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  }
}

describe('ambient batch transcription provider selection', () => {
  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it('marks Deepgram unavailable when the API key is missing', () => {
    delete process.env.DEEPGRAM_API_KEY;
    process.env.OPENAI_API_KEY = 'openai-test-key';

    const statuses = getAmbientBatchTranscriptionProviderStatuses();
    const deepgram = statuses.find((status) => status.providerId === 'deepgram-batch-diarization');

    expect(deepgram?.available).toBe(false);
    expect(deepgram?.reason).toContain('DEEPGRAM_API_KEY');
  });

  it('selects Deepgram first when both Deepgram and OpenAI are configured', () => {
    process.env.DEEPGRAM_API_KEY = 'deepgram-test-key';
    process.env.OPENAI_API_KEY = 'openai-test-key';

    const selection = resolveAmbientBatchTranscriptionProviderSelection({
      requestedProvider: 'auto',
      allowMockSimulationFallback: false,
    });

    expect(selection.activeProvider).toBe('deepgram-batch-diarization');
    expect(selection.activeProviderLabel).toContain('Deepgram');
    expect(selection.fallbackApplied).toBe(false);
  });

  it('falls back to OpenAI when Deepgram is unavailable and OpenAI exists', () => {
    delete process.env.DEEPGRAM_API_KEY;
    process.env.OPENAI_API_KEY = 'openai-test-key';

    const selection = resolveAmbientBatchTranscriptionProviderSelection({
      requestedProvider: 'auto',
      allowMockSimulationFallback: false,
    });

    expect(selection.activeProvider).toBe('openai-batch-transcription');
    expect(selection.activeProviderLabel).toContain('OpenAI');
  });
});

describe('ambient batch transcription mapping', () => {
  it('maps Deepgram diarized utterances into ambient STT segments', () => {
    const segments = mapDeepgramBatchUtterancesToAmbientSegments({
      utterances: [
        {
          id: 'utt-1',
          transcript: 'I still do not feel safe going home.',
          start: 0.4,
          end: 2.2,
          confidence: 0.88,
          speaker: 0,
          words: [
            { word: 'I', start: 0.4, end: 0.5, confidence: 0.91, speaker: 0 },
            { word: 'still', start: 0.5, end: 0.8, confidence: 0.89, speaker: 0 },
          ],
        },
      ],
    });

    expect(segments).toHaveLength(1);
    expect(segments[0]?.speakerLabel).toBe('speaker_0');
    expect(segments[0]?.startMs).toBe(400);
    expect(segments[0]?.endMs).toBe(2200);
    expect(segments[0]?.wordTimings?.[0]?.speakerLabel).toBe('speaker_0');
  });

  it('keeps speaker attribution unresolved when provider segments are mapped into ambient ingress events', () => {
    const segments = mapDeepgramBatchUtterancesToAmbientSegments({
      utterances: [
        {
          id: 'utt-2',
          transcript: 'Tell me what felt hardest overnight.',
          start: 0,
          end: 1.6,
          confidence: 0.94,
          speaker: 1,
        },
      ],
    });

    const events = mapAmbientSttSegmentsToAmbientIngressEvents({ segments });

    expect(events).toHaveLength(1);
    expect(events[0]?.turn.speakerRole).toBe('unknown');
    expect(events[0]?.turn.speakerLabel).toBe('speaker_1');
    expect(events[0]?.turn.reviewHints?.attributionNeedsReview).toBe(true);
    expect(events[0]?.turn.reviewHints?.severityBadges).toContain('speaker review');
  });
});
