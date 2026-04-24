import { buildDictationTranscriptSegment } from '@/lib/dictation/transcript-segment-utils';
import type {
  AudioChunk,
  DictationProviderError,
  DictationSessionConfig,
  DictationSessionHandle,
  DictationStopReason,
  STTProvider,
  TranscriptSegment,
} from '@/types/dictation';

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createMockTranscriptSegments(
  config: DictationSessionConfig,
  handle: DictationSessionHandle,
  text: string,
) {
  const normalizedText = text.trim();
  return {
    interim: buildDictationTranscriptSegment({
      config,
      handle,
      text: `${normalizedText} ...`,
      isFinal: false,
      confidence: 0.72,
      modelOrEngine: 'mock-clinical-dictation',
      sourceMode: 'manual',
    }),
    final: buildDictationTranscriptSegment({
      config,
      handle,
      text: normalizedText,
      isFinal: true,
      confidence: 0.97,
      modelOrEngine: 'mock-clinical-dictation',
      sourceMode: 'manual',
    }),
  };
}

export class MockSTTProvider implements STTProvider {
  private config?: DictationSessionConfig;
  private handle?: DictationSessionHandle;
  private interimCallback: (segment: TranscriptSegment) => void = () => undefined;
  private finalCallback: (segment: TranscriptSegment) => void = () => undefined;
  private errorCallback: (error: DictationProviderError) => void = () => undefined;

  async createSession(config: DictationSessionConfig): Promise<DictationSessionHandle> {
    this.config = config;
    this.handle = {
      sessionId: createId('mock-session'),
      provider: config.sttProvider,
    };
    return this.handle;
  }

  async streamAudio(_chunk: AudioChunk): Promise<void> {
    return;
  }

  onInterimSegment(callback: (segment: TranscriptSegment) => void): void {
    this.interimCallback = callback;
  }

  onFinalSegment(callback: (segment: TranscriptSegment) => void): void {
    this.finalCallback = callback;
  }

  onError(callback: (error: DictationProviderError) => void): void {
    this.errorCallback = callback;
  }

  async closeSession(_reason: DictationStopReason): Promise<void> {
    this.handle = undefined;
    this.config = undefined;
  }

  emitMockUtterance(text: string) {
    if (!this.config || !this.handle) {
      this.errorCallback({
        code: 'mock_session_missing',
        message: 'Mock dictation session has not been started.',
        retryable: true,
      });
      return;
    }

    const segments = createMockTranscriptSegments(this.config, this.handle, text);
    this.interimCallback(segments.interim);
    this.finalCallback(segments.final);
  }
}
