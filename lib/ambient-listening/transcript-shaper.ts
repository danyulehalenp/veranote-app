import type {
  AmbientSttProviderId,
  AmbientSttSegment,
  AmbientSttWordTiming,
} from '@/types/ambient-listening';

type TranscriptShapeOptions = {
  providerId?: AmbientSttProviderId;
  minFragmentWords?: number;
  maxMergeGapMs?: number;
  maxWordsPerTurn?: number;
  targetMaxTurns?: number;
};

const DEFAULT_MIN_FRAGMENT_WORDS = 5;
const DEFAULT_MAX_MERGE_GAP_MS = 1400;
const DEFAULT_MAX_WORDS_PER_TURN = 34;
const DEFAULT_TARGET_MAX_TURNS = 8;
const OPENAI_TARGET_MAX_TURNS = 6;

function cleanText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function countWords(text: string) {
  const matches = cleanText(text).match(/\b[\w'-]+\b/g);
  return matches?.length || 0;
}

function hasTerminalPunctuation(text: string) {
  return /[.!?]["')\]]?$/.test(cleanText(text));
}

function averageDefined(values: Array<number | null | undefined>, fallback: number) {
  const usable = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!usable.length) {
    return fallback;
  }

  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function sameSpeaker(a: AmbientSttSegment, b: AmbientSttSegment) {
  return (a.speakerLabel || null) === (b.speakerLabel || null);
}

function timeGapMs(a: AmbientSttSegment, b: AmbientSttSegment) {
  if (!a.endMs || !b.startMs) {
    return 0;
  }

  return Math.max(0, b.startMs - a.endMs);
}

function joinTranscriptText(segments: AmbientSttSegment[]) {
  return cleanText(segments.map((segment) => cleanText(segment.text)).filter(Boolean).join(' '));
}

function mergeAmbientSttSegments(
  segments: AmbientSttSegment[],
  segmentId: string,
): AmbientSttSegment {
  const wordTimings = segments.flatMap((segment) => segment.wordTimings || []);
  const sourceSegmentIds = segments.map((segment) => segment.segmentId);

  return {
    segmentId,
    text: joinTranscriptText(segments),
    startMs: segments[0]?.startMs ?? 0,
    endMs: segments.at(-1)?.endMs ?? segments[0]?.endMs ?? 0,
    isFinal: segments.every((segment) => segment.isFinal),
    textConfidence: averageDefined(segments.map((segment) => segment.textConfidence), 0.65),
    speakerLabel: segments[0]?.speakerLabel || null,
    speakerConfidence: averageDefined(segments.map((segment) => segment.speakerConfidence), 0.5),
    wordTimings,
    rawProviderMetadata: {
      shaped: true,
      shapeKind: 'merged_fragments',
      sourceSegmentIds,
    },
  };
}

function splitIntoSentences(text: string) {
  return cleanText(text).match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(cleanText).filter(Boolean) || [];
}

function splitLongSentence(sentence: string, maxWordsPerTurn: number) {
  const words = cleanText(sentence).split(/\s+/).filter(Boolean);
  if (words.length <= maxWordsPerTurn) {
    return [cleanText(sentence)];
  }

  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += maxWordsPerTurn) {
    chunks.push(words.slice(index, index + maxWordsPerTurn).join(' '));
  }

  return chunks;
}

function distributeTextUnitsIntoTurns(units: string[], targetMaxTurns: number) {
  if (units.length <= targetMaxTurns) {
    return units;
  }

  const chunks: string[] = [];
  const targetChunkSize = Math.ceil(units.length / targetMaxTurns);
  for (let index = 0; index < units.length; index += targetChunkSize) {
    chunks.push(cleanText(units.slice(index, index + targetChunkSize).join(' ')));
  }

  return chunks;
}

function splitLargeSegment(input: {
  segment: AmbientSttSegment;
  maxWordsPerTurn: number;
  targetMaxTurns: number;
}) {
  const sentenceUnits = splitIntoSentences(input.segment.text)
    .flatMap((sentence) => splitLongSentence(sentence, input.maxWordsPerTurn));
  const units = sentenceUnits.length ? sentenceUnits : splitLongSentence(input.segment.text, input.maxWordsPerTurn);
  const turnTexts = distributeTextUnitsIntoTurns(units, input.targetMaxTurns);
  const totalChars = Math.max(1, turnTexts.reduce((sum, text) => sum + text.length, 0));
  const durationMs = Math.max(0, input.segment.endMs - input.segment.startMs);
  let consumedChars = 0;

  return turnTexts.map((text, index): AmbientSttSegment => {
    const startRatio = consumedChars / totalChars;
    consumedChars += text.length;
    const endRatio = consumedChars / totalChars;
    const startMs = durationMs > 0 ? Math.round(input.segment.startMs + durationMs * startRatio) : input.segment.startMs;
    const endMs = durationMs > 0 ? Math.round(input.segment.startMs + durationMs * endRatio) : input.segment.endMs;

    return {
      segmentId: `${input.segment.segmentId}-shaped-${index + 1}`,
      text,
      startMs,
      endMs,
      isFinal: input.segment.isFinal,
      textConfidence: input.segment.textConfidence,
      speakerLabel: input.segment.speakerLabel || null,
      speakerConfidence: input.segment.speakerConfidence,
      wordTimings: [],
      rawProviderMetadata: {
        shaped: true,
        shapeKind: 'split_large_block',
        sourceSegmentIds: [input.segment.segmentId],
      },
    };
  });
}

function shouldSplitLargeSegment(segment: AmbientSttSegment, providerId?: AmbientSttProviderId) {
  const sentences = splitIntoSentences(segment.text);
  if (providerId === 'openai-batch-transcription') {
    return sentences.length > 1 || countWords(segment.text) > DEFAULT_MAX_WORDS_PER_TURN;
  }

  return !segment.speakerLabel && (sentences.length > 2 || countWords(segment.text) > DEFAULT_MAX_WORDS_PER_TURN * 2);
}

function shouldMergeWithPrevious(input: {
  current: AmbientSttSegment;
  next: AmbientSttSegment;
  minFragmentWords: number;
  maxMergeGapMs: number;
  maxWordsPerTurn: number;
}) {
  if (!sameSpeaker(input.current, input.next)) {
    return false;
  }

  const combinedWords = countWords(`${input.current.text} ${input.next.text}`);
  if (combinedWords > input.maxWordsPerTurn) {
    return false;
  }

  const gapMs = timeGapMs(input.current, input.next);
  if (gapMs > input.maxMergeGapMs) {
    return false;
  }

  const currentWords = countWords(input.current.text);
  const nextWords = countWords(input.next.text);

  if (hasTerminalPunctuation(input.current.text) && currentWords >= input.minFragmentWords) {
    return false;
  }

  return (
    currentWords < input.minFragmentWords
    || nextWords < input.minFragmentWords
    || !hasTerminalPunctuation(input.current.text)
  );
}

function mergeAdjacentFragments(input: {
  segments: AmbientSttSegment[];
  minFragmentWords: number;
  maxMergeGapMs: number;
  maxWordsPerTurn: number;
}) {
  const shaped: AmbientSttSegment[] = [];
  let currentGroup: AmbientSttSegment[] = [];

  const flushGroup = () => {
    if (!currentGroup.length) {
      return;
    }

    const first = currentGroup[0]!;
    shaped.push(
      currentGroup.length === 1
        ? first
        : mergeAmbientSttSegments(currentGroup, `${first.segmentId}-merged-${shaped.length + 1}`),
    );
    currentGroup = [];
  };

  for (const segment of input.segments) {
    if (!currentGroup.length) {
      currentGroup = [segment];
      continue;
    }

    const current = currentGroup.length === 1
      ? currentGroup[0]!
      : mergeAmbientSttSegments(currentGroup, `${currentGroup[0]!.segmentId}-group`);
    if (
      shouldMergeWithPrevious({
        current,
        next: segment,
        minFragmentWords: input.minFragmentWords,
        maxMergeGapMs: input.maxMergeGapMs,
        maxWordsPerTurn: input.maxWordsPerTurn,
      })
    ) {
      currentGroup.push(segment);
    } else {
      flushGroup();
      currentGroup = [segment];
    }
  }

  flushGroup();
  return shaped;
}

function compressToTargetTurns(input: {
  segments: AmbientSttSegment[];
  targetMaxTurns: number;
  maxWordsPerTurn: number;
}) {
  if (input.segments.length <= input.targetMaxTurns) {
    return input.segments;
  }

  const compressed: AmbientSttSegment[] = [];
  let currentGroup: AmbientSttSegment[] = [];

  const flush = () => {
    if (!currentGroup.length) {
      return;
    }

    const first = currentGroup[0]!;
    compressed.push(
      currentGroup.length === 1
        ? first
        : mergeAmbientSttSegments(currentGroup, `${first.segmentId}-target-${compressed.length + 1}`),
    );
    currentGroup = [];
  };

  for (const segment of input.segments) {
    const groupText = joinTranscriptText([...currentGroup, segment]);
    const wouldExceedWords = countWords(groupText) > input.maxWordsPerTurn;
    const wouldExceedSpeaker = currentGroup.length > 0 && !sameSpeaker(currentGroup.at(-1)!, segment);

    if (currentGroup.length && (wouldExceedWords || wouldExceedSpeaker)) {
      flush();
    }

    currentGroup.push(segment);
  }

  flush();
  return compressed;
}

export function shapeAmbientSttSegments(input: {
  segments: AmbientSttSegment[];
  providerId?: AmbientSttProviderId;
  options?: TranscriptShapeOptions;
}) {
  const minFragmentWords = input.options?.minFragmentWords ?? DEFAULT_MIN_FRAGMENT_WORDS;
  const maxMergeGapMs = input.options?.maxMergeGapMs ?? DEFAULT_MAX_MERGE_GAP_MS;
  const maxWordsPerTurn = input.options?.maxWordsPerTurn ?? DEFAULT_MAX_WORDS_PER_TURN;
  const targetMaxTurns = input.options?.targetMaxTurns
    ?? (input.providerId === 'openai-batch-transcription' ? OPENAI_TARGET_MAX_TURNS : DEFAULT_TARGET_MAX_TURNS);

  const normalized = input.segments
    .filter((segment) => cleanText(segment.text))
    .map((segment) => ({
      ...segment,
      text: cleanText(segment.text),
      wordTimings: [...(segment.wordTimings || [])] satisfies AmbientSttWordTiming[],
    }))
    .sort((a, b) => a.startMs - b.startMs);

  const splitSegments = normalized.flatMap((segment) => (
    shouldSplitLargeSegment(segment, input.providerId)
      ? splitLargeSegment({ segment, maxWordsPerTurn, targetMaxTurns })
      : [segment]
  ));

  const mergedSegments = mergeAdjacentFragments({
    segments: splitSegments,
    minFragmentWords,
    maxMergeGapMs,
    maxWordsPerTurn,
  });

  return compressToTargetTurns({
    segments: mergedSegments,
    targetMaxTurns,
    maxWordsPerTurn,
  });
}
