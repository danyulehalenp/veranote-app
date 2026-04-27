import type { ProviderSettings } from '@/lib/constants/settings';
import type { TranscriptSegment } from '@/types/dictation';

export type DictationVoiceGuide = {
  statusLabel: string;
  headline: string;
  detail: string;
  phrases: string[];
  needsAttention: boolean;
  actionLabel: string;
};

export function normalizeVoiceVocabulary(rawValue: string) {
  return rawValue
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function buildVoiceVocabularyHints(settings: ProviderSettings['dictationVoiceProfile']) {
  return [
    ...settings.vocabularyBoost,
    ...normalizeVoiceVocabulary(settings.pronunciationHints),
  ].filter((value, index, values) => values.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index);
}

export function buildDictationVoiceGuide(input: {
  settings: ProviderSettings['dictationVoiceProfile'];
  pendingSegments: TranscriptSegment[];
}) : DictationVoiceGuide {
  const lowConfidenceSegments = input.pendingSegments.filter((segment) =>
    segment.reviewFlags.some((flag) => flag.flagType === 'low_confidence')
      || (typeof segment.confidence === 'number' && segment.confidence < 0.84),
  );

  if (!input.settings.baselineCompletedAt) {
    return {
      statusLabel: 'Voice check recommended',
      headline: 'Run a short voice check before you dictate into the note.',
      detail: `Read 2-3 phrases in a ${input.settings.preferredPacing.replace(/_/g, ' ')} cadence so Veranote can anchor on your speech pattern and vocabulary.`,
      phrases: input.settings.starterPhrases,
      needsAttention: true,
      actionLabel: 'Mark voice check complete',
    };
  }

  if (input.settings.promptWhenSystemStruggles && lowConfidenceSegments.length >= input.settings.lowConfidencePromptThreshold) {
    return {
      statusLabel: 'Recognition rescue',
      headline: 'The system is struggling a bit. Slow down, separate clauses, and retry a short rescue phrase.',
      detail: `${lowConfidenceSegments.length} recent segment${lowConfidenceSegments.length === 1 ? '' : 's'} came in with low-confidence markers. Re-read one of the rescue phrases, then continue at a measured pace.`,
      phrases: input.settings.rescuePhrases,
      needsAttention: true,
      actionLabel: 'Re-run voice check',
    };
  }

  return {
    statusLabel: 'Voice profile active',
    headline: 'Voice profile is active and dictation is staying on track.',
    detail: input.settings.pronunciationHints.trim()
      ? `Custom pronunciation hints are loaded: ${input.settings.pronunciationHints.trim()}`
      : 'If accuracy drops, re-run the voice check and add pronunciation hints for names, medications, or local phrases.',
    phrases: input.settings.vocabularyBoost.slice(0, 3),
    needsAttention: false,
    actionLabel: 'Refresh voice check',
  };
}
