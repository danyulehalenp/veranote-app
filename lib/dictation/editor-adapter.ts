import type { DictationEditorAdapter, DictationTargetSection, TranscriptSegment } from '@/types/dictation';
import type { DictationInsertionRecord, SourceSections } from '@/types/session';

type SourceSectionAdapterOptions = {
  getSourceSections: () => SourceSections;
  targetSection?: DictationTargetSection;
  onUpdateSourceSection: (section: DictationTargetSection, value: string) => void;
  onInsertedSegment?: (record: DictationInsertionRecord) => void;
  onOpenFallback?: (initialText?: string) => void;
};

function createTransactionId() {
  return `dictation-tx-${Math.random().toString(36).slice(2, 10)}`;
}

function appendToSection(existing: string, next: string) {
  return existing.trim() ? `${existing.trim()}\n${next.trim()}` : next.trim();
}

export function createSourceSectionDictationAdapter(options: SourceSectionAdapterOptions): DictationEditorAdapter {
  return {
    getCurrentTarget() {
      return options.targetSection ? { noteId: 'new-note', section: options.targetSection } : null;
    },
    previewInterimSegment() {
      return;
    },
    async insertFinalSegment(segment: TranscriptSegment) {
      if (!options.targetSection) {
        options.onOpenFallback?.(segment.text);
        throw new Error('No dictation target is active.');
      }

      const currentValue = options.getSourceSections()[options.targetSection] || '';
      const nextValue = appendToSection(currentValue, segment.text);
      const transactionId = createTransactionId();

      options.onUpdateSourceSection(options.targetSection, nextValue);
      options.onInsertedSegment?.({
        segmentId: segment.id,
        dictationSessionId: segment.dictationSessionId,
        targetSection: options.targetSection,
        text: segment.text,
        insertedAt: new Date().toISOString(),
        transactionId,
        provider: segment.source.provider,
        sourceMode: segment.source.mode,
        confidence: segment.confidence,
        reviewFlags: segment.reviewFlags,
      });

      return { transactionId };
    },
    applyReviewFlags() {
      return;
    },
    async markSegmentReviewed() {
      return;
    },
    openDictationBox(initialText?: string) {
      options.onOpenFallback?.(initialText);
    },
  };
}
