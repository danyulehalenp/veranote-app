import { describe, expect, it } from 'vitest';
import { shapeAmbientSttSegments } from '@/lib/ambient-listening/transcript-shaper';
import { mapAmbientSttSegmentsToAmbientIngressEvents } from '@/lib/ambient-listening/vendor-transcript-mappers';
import type { AmbientSttSegment } from '@/types/ambient-listening';

function segment(input: Partial<AmbientSttSegment> & Pick<AmbientSttSegment, 'segmentId' | 'text'>): AmbientSttSegment {
  return {
    startMs: 0,
    endMs: 0,
    isFinal: true,
    textConfidence: 0.86,
    speakerLabel: null,
    speakerConfidence: 0.66,
    wordTimings: [],
    rawProviderMetadata: null,
    ...input,
  };
}

describe('ambient transcript shaper', () => {
  it('merges Deepgram-style fragments into reviewable same-speaker turns', () => {
    const fragments = [
      'How have',
      'you been feeling',
      'this week?',
      "I've been",
      'really down,',
      'not sleeping well,',
      'and I stopped',
      'taking my medication.',
      'Are you having',
      'any thoughts',
      'of hurting yourself?',
      'Not right now,',
      'but I did',
      'last week.',
      'I also',
      'missed group',
      'yesterday.',
      'Can we',
      'talk about',
      'discharge?',
    ].map((text, index) => segment({
      segmentId: `deepgram-fragment-${index + 1}`,
      text,
      startMs: index * 450,
      endMs: index * 450 + 320,
      speakerLabel: 'speaker_0',
      speakerConfidence: 0.82,
    }));

    const shaped = shapeAmbientSttSegments({
      providerId: 'deepgram-batch-diarization',
      segments: fragments,
    });

    expect(fragments).toHaveLength(20);
    expect(shaped.length).toBeGreaterThanOrEqual(3);
    expect(shaped.length).toBeLessThanOrEqual(8);
    expect(shaped[0]?.text).toBe('How have you been feeling this week?');
    expect(shaped.some((turn) => turn.text.includes('not sleeping well'))).toBe(true);
    expect(shaped.every((turn) => turn.speakerLabel === 'speaker_0')).toBe(true);

    const events = mapAmbientSttSegmentsToAmbientIngressEvents({ segments: shaped });
    expect(events.every((event) => event.turn.speakerRole === 'unknown')).toBe(true);
    expect(events.every((event) => event.turn.reviewHints?.attributionNeedsReview)).toBe(true);
  });

  it('does not merge Deepgram fragments across vendor speaker labels', () => {
    const shaped = shapeAmbientSttSegments({
      providerId: 'deepgram-batch-diarization',
      segments: [
        segment({
          segmentId: 'provider-1',
          text: 'How have you been feeling this week?',
          startMs: 0,
          endMs: 1400,
          speakerLabel: 'speaker_0',
        }),
        segment({
          segmentId: 'patient-1',
          text: "I've been really down and not sleeping well.",
          startMs: 1600,
          endMs: 3800,
          speakerLabel: 'speaker_1',
        }),
      ],
    });

    expect(shaped).toHaveLength(2);
    expect(shaped[0]?.speakerLabel).toBe('speaker_0');
    expect(shaped[1]?.speakerLabel).toBe('speaker_1');
  });

  it('splits OpenAI-style merged transcript blobs into sentence-level review turns', () => {
    const openAiBlob = segment({
      segmentId: 'openai-transcript-1',
      text: 'How have you been feeling this week? I have been really down, not sleeping well, and I stopped taking my medication. Are you having any thoughts of hurting yourself? Not right now, but I did last week.',
      startMs: 0,
      endMs: 12000,
      speakerConfidence: 0.35,
    });

    const shaped = shapeAmbientSttSegments({
      providerId: 'openai-batch-transcription',
      segments: [openAiBlob],
    });

    expect(shaped.length).toBeGreaterThanOrEqual(3);
    expect(shaped.length).toBeLessThanOrEqual(6);
    expect(shaped[0]?.text).toBe('How have you been feeling this week?');
    expect(shaped.at(-1)?.text).toBe('Not right now, but I did last week.');
    expect(shaped.every((turn) => turn.speakerRole === undefined)).toBe(true);

    const events = mapAmbientSttSegmentsToAmbientIngressEvents({ segments: shaped });
    expect(events.every((event) => event.turn.speakerRole === 'unknown')).toBe(true);
    expect(events.every((event) => event.turn.reviewHints?.severityBadges?.includes('speaker review'))).toBe(true);
  });
});
