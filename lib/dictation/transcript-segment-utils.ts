import { detectDictationReviewFlags } from '@/lib/dictation/review-flags';
import type { DictationSessionConfig, DictationSessionHandle, TranscriptSegment } from '@/types/dictation';

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildDictationTranscriptSegment(input: {
  config: DictationSessionConfig;
  handle: DictationSessionHandle;
  text: string;
  isFinal: boolean;
  confidence?: number;
  modelOrEngine?: string;
  sourceMode?: TranscriptSegment['source']['mode'];
}) {
  const reviewFlags = input.isFinal ? detectDictationReviewFlags(input.text) : [];

  return {
    id: createId(input.isFinal ? 'segment-final' : 'segment-interim'),
    dictationSessionId: input.handle.sessionId,
    encounterId: input.config.encounterId,
    noteId: input.config.noteId,
    targetSection: input.config.targetSection,
    text: input.text,
    normalizedText: input.text.trim(),
    isFinal: input.isFinal,
    confidence: input.confidence,
    reviewStatus: input.isFinal ? (reviewFlags.length ? 'needs_review' : 'reviewed') : 'not_required',
    reviewFlags,
    source: {
      provider: input.config.sttProvider,
      modelOrEngine: input.modelOrEngine,
      mode: input.sourceMode || 'manual',
      vendorSegmentId: createId('vendor-segment'),
    },
    createdAt: new Date().toISOString(),
  } satisfies TranscriptSegment;
}
