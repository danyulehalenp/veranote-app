import { describe, expect, it } from 'vitest';
import {
  isMeaningfulDictationTranscriptText,
  normalizeSpokenDictationPunctuation,
} from '@/lib/dictation/transcript-segment-utils';

describe('dictation transcript quality filters', () => {
  it('rejects tiny filler transcripts from partial batch audio', () => {
    expect(isMeaningfulDictationTranscriptText('And...')).toBe(false);
    expect(isMeaningfulDictationTranscriptText('uh')).toBe(false);
    expect(isMeaningfulDictationTranscriptText('okay')).toBe(false);
  });

  it('keeps short but clinically meaningful phrases', () => {
    expect(isMeaningfulDictationTranscriptText('Patient denies SI.')).toBe(true);
    expect(isMeaningfulDictationTranscriptText('Medication side effects denied.')).toBe(true);
  });

  it('normalizes common spoken punctuation before provider review', () => {
    expect(normalizeSpokenDictationPunctuation(
      'Patient is sleeping better period Denies suicidal thoughts comma plan follow up semicolon continue medication period',
    )).toBe('Patient is sleeping better. Denies suicidal thoughts, plan follow up; continue medication.');
    expect(normalizeSpokenDictationPunctuation(
      'Mood is open quote better close quote open parenthesis no side effects close parenthesis period',
    )).toBe('Mood is "better" (no side effects).');
    expect(normalizeSpokenDictationPunctuation(
      'Patient is doing well period. Sleeping better period . Denies suicidal thoughts period',
    )).toBe('Patient is doing well. Sleeping better. Denies suicidal thoughts.');
    expect(normalizeSpokenDictationPunctuation(
      'Patient is doing well, period Sleeping better, period Denies suicidal thoughts, period',
    )).toBe('Patient is doing well. Sleeping better. Denies suicidal thoughts.');
  });
});
