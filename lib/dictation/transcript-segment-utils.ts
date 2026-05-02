import { detectDictationReviewFlags } from '@/lib/dictation/review-flags';
import type { DictationSessionConfig, DictationSessionHandle, TranscriptSegment } from '@/types/dictation';

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

const LOW_VALUE_TRANSCRIPT_TEXT = new Set([
  'and',
  'um',
  'uh',
  'uhh',
  'okay',
  'ok',
  'yeah',
  'yes',
  'no',
  'right',
  'all right',
  'alright',
]);

function normalizeTranscriptQualityText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isMeaningfulDictationTranscriptText(text: string) {
  const normalizedText = normalizeTranscriptQualityText(text);
  if (!normalizedText || LOW_VALUE_TRANSCRIPT_TEXT.has(normalizedText)) {
    return false;
  }

  const words = normalizedText.split(' ').filter(Boolean);
  if (words.length >= 4) {
    return true;
  }

  return /\b(patient|mood|medication|medications|side effect|effects|denies|reports|sleep|anxiety|depression|si|hi|hallucination|plan|assessment)\b/.test(normalizedText);
}

export function normalizeSpokenDictationPunctuation(text: string) {
  let normalizedText = text.trim();

  const replacements: Array<[RegExp, string]> = [
    [/\bnew paragraph\b/gi, '\n\n'],
    [/\bnew line\b/gi, '\n'],
    [/\bopen parentheses\b/gi, ' ('],
    [/\bopen parenthesis\b/gi, ' ('],
    [/\bopen paren\b/gi, ' ('],
    [/\bclose parentheses\b/gi, ')'],
    [/\bclose parenthesis\b/gi, ')'],
    [/\bclose paren\b/gi, ')'],
    [/\bopen quote\b/gi, ' "'],
    [/\bclose quote\b/gi, '"'],
    [/\bsemicolon\b/gi, ';'],
    [/\bcolon\b/gi, ':'],
    [/\bcomma\b/gi, ','],
    [/\bquestion mark\b/gi, '?'],
    [/\bexclamation point\b/gi, '!'],
    [/\bexclamation mark\b/gi, '!'],
    [/\bfull stop\b/gi, '.'],
    [/\bperiod\b/gi, '.'],
  ];

  replacements.forEach(([pattern, replacement]) => {
    normalizedText = normalizedText.replace(pattern, replacement);
  });

  return normalizedText
    .replace(/[ \t]+([,.;:?!\)])/g, '$1')
    .replace(/"\s*([^"\n]*?)\s*"/g, '"$1"')
    .replace(/([\(\[])[ \t]+/g, '$1')
    .replace(/([,.;:?!])(?=\S)/g, '$1 ')
    .replace(/[,;:]\s*([.!?])/g, '$1')
    .replace(/([.!?])(?:\s*\1)+/g, '$1')
    .replace(/([,;:])(?:\s*\1)+/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
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
