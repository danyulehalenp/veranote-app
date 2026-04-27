import { describe, expect, it } from 'vitest';
import { DEFAULT_PROVIDER_SETTINGS } from '@/lib/constants/settings';
import { buildDictationVoiceGuide, buildVoiceVocabularyHints, normalizeVoiceVocabulary } from '@/lib/dictation/voice-training';

describe('dictation voice training', () => {
  it('normalizes vocabulary boost input from commas and new lines', () => {
    expect(normalizeVoiceVocabulary('lamotrigine, WellSky\nTebra')).toEqual([
      'lamotrigine',
      'WellSky',
      'Tebra',
    ]);
  });

  it('builds a de-duplicated vocabulary hint list from boost and pronunciation hints', () => {
    expect(buildVoiceVocabularyHints({
      ...DEFAULT_PROVIDER_SETTINGS.dictationVoiceProfile,
      vocabularyBoost: ['lamotrigine', 'WellSky'],
      pronunciationHints: 'WellSky, lurasidone',
    })).toEqual(['lamotrigine', 'WellSky', 'lurasidone']);
  });

  it('recommends a baseline voice check before training is completed', () => {
    const guide = buildDictationVoiceGuide({
      settings: DEFAULT_PROVIDER_SETTINGS.dictationVoiceProfile,
      pendingSegments: [],
    });

    expect(guide.needsAttention).toBe(true);
    expect(guide.statusLabel).toBe('Voice check recommended');
    expect(guide.phrases.length).toBeGreaterThan(0);
  });

  it('switches to a rescue prompt when low-confidence segments accumulate', () => {
    const guide = buildDictationVoiceGuide({
      settings: {
        ...DEFAULT_PROVIDER_SETTINGS.dictationVoiceProfile,
        baselineCompletedAt: '2026-04-25T10:00:00.000Z',
      },
      pendingSegments: [
        {
          id: 'seg-1',
          dictationSessionId: 'session-1',
          encounterId: 'enc-1',
          text: 'unclear phrase one',
          isFinal: true,
          reviewStatus: 'needs_review',
          reviewFlags: [{ flagType: 'low_confidence', severity: 'moderate', matchedText: 'unclear', message: 'Low confidence' }],
          source: { provider: 'openai-transcription', mode: 'batch' },
          createdAt: '2026-04-25T10:01:00.000Z',
        },
        {
          id: 'seg-2',
          dictationSessionId: 'session-1',
          encounterId: 'enc-1',
          text: 'unclear phrase two',
          isFinal: true,
          confidence: 0.6,
          reviewStatus: 'needs_review',
          reviewFlags: [],
          source: { provider: 'openai-transcription', mode: 'batch' },
          createdAt: '2026-04-25T10:02:00.000Z',
        },
      ],
    });

    expect(guide.statusLabel).toBe('Recognition rescue');
    expect(guide.actionLabel).toBe('Re-run voice check');
    expect(guide.phrases).toEqual(
      DEFAULT_PROVIDER_SETTINGS.dictationVoiceProfile.rescuePhrases,
    );
  });
});
