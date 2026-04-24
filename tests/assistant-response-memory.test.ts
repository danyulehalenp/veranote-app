import { describe, expect, it } from 'vitest';
import { createEmptyAssistantLearningStore } from '@/lib/veranote/assistant-learning';
import { enrichAssistantResponseWithLearning } from '@/lib/veranote/assistant-response-memory';

describe('assistant response memory enrichment', () => {
  it('adds remembered facts and rewrite preferences to workflow answers', () => {
    const learningStore = createEmptyAssistantLearningStore();
    learningStore.conversationalMemoryFacts = [
      {
        key: 'concise assessment language',
        fact: 'I prefer concise assessment language.',
        count: 2,
        lastSeenAt: new Date().toISOString(),
      },
    ];
    learningStore.rewritePreferencesByNoteType['Inpatient Psych Progress Note'] = {
      'most-conservative': 0,
      balanced: 0,
      'closest-to-source': 3,
    };

    const result = enrichAssistantResponseWithLearning({
      payload: {
        message: 'I can help shape this note lane before you generate.',
        suggestions: ['Start with source organization.'],
      },
      learningStore,
      normalizedMessage: 'help me shape this note lane and assessment',
      stage: 'compose',
      mode: 'workflow-help',
      noteType: 'Inpatient Psych Progress Note',
    });

    expect(result.message).toContain('closest to source wording');
    expect(result.suggestions?.some((item) => item.includes('Remembered preference: I prefer concise assessment language.'))).toBe(true);
  });

  it('does not inject learning hints into reference lookup answers', () => {
    const learningStore = createEmptyAssistantLearningStore();
    learningStore.conversationalMemoryFacts = [
      {
        key: 'concise assessment language',
        fact: 'I prefer concise assessment language.',
        count: 2,
      },
    ];

    const result = enrichAssistantResponseWithLearning({
      payload: {
        message: 'Here is the trusted reference answer.',
        suggestions: ['Use the direct source page below.'],
      },
      learningStore,
      normalizedMessage: 'what is the icd 10 for mdd',
      stage: 'compose',
      mode: 'reference-lookup',
      noteType: 'Inpatient Psych Progress Note',
    });

    expect(result.message).toBe('Here is the trusted reference answer.');
    expect(result.suggestions).toEqual(['Use the direct source page below.']);
  });

  it('marks rewrite actions that align with learned provider preferences', () => {
    const learningStore = createEmptyAssistantLearningStore();
    learningStore.rewritePreferencesByNoteType['Inpatient Psych Progress Note'] = {
      'most-conservative': 0,
      balanced: 0,
      'closest-to-source': 4,
    };

    const result = enrichAssistantResponseWithLearning({
      payload: {
        message: 'Use the safer rewrite path first.',
        actions: [
          {
            type: 'run-review-rewrite',
            label: 'Run closer-to-source rewrite',
            instructions: 'Use the safer rewrite path first.',
            rewriteMode: 'closer-to-source',
          },
          {
            type: 'apply-conservative-rewrite',
            label: 'Closest to source rewrite',
            instructions: 'Original: text. Closest to source option: replacement.',
            originalText: 'text',
            replacementText: 'replacement',
            optionTone: 'closest-to-source',
          },
        ],
      },
      learningStore,
      normalizedMessage: 'help me make this more conservative',
      stage: 'review',
      mode: 'workflow-help',
      noteType: 'Inpatient Psych Progress Note',
    });

    expect(result.actions?.[0].label).toContain('aligned');
    expect(result.actions?.[1].label).toContain('preferred');
    expect(result.actions?.[1].instructions).toContain('usually prefer');
  });

  it('adds learned lane and prompt preferences to preference-building actions', () => {
    const learningStore = createEmptyAssistantLearningStore();
    learningStore.lanePreferencesByNoteType['Inpatient Psych Progress Note'] = [
      {
        noteType: 'Inpatient Psych Progress Note',
        outputScope: 'full-note',
        outputStyle: 'Standard',
        format: 'Labeled Sections',
        requestedSections: ['HPI', 'Assessment'],
        count: 2,
      },
    ];
    learningStore.promptPreferencesByProfileId.profile1 = [
      {
        profileId: 'profile1',
        patternKey: 'concise-lane',
        label: 'Concise note lane',
        seedPrompt: 'Keep the note concise.',
        count: 3,
        noteTypes: ['Inpatient Psych Progress Note', 'ED Psych Consult'],
      },
    ];

    const result = enrichAssistantResponseWithLearning({
      payload: {
        message: 'Use the prompt builder.',
        actions: [
          {
            type: 'create-preset-draft',
            label: 'Create preset draft',
            instructions: 'Draft the preference block.',
            presetName: 'Preset',
          },
        ],
      },
      learningStore,
      normalizedMessage: 'help me build a preference',
      stage: 'compose',
      mode: 'prompt-builder',
      noteType: 'Inpatient Psych Progress Note',
      profileId: 'profile1',
    });

    expect(result.actions?.[0].instructions).toContain('repeated lane pattern');
    expect(result.actions?.[0].instructions).toContain('Concise note lane');
  });
});
