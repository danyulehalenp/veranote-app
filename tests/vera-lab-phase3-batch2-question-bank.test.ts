import { describe, expect, it } from 'vitest';

import { allVeraProviderQuestionCases } from '@/lib/veranote/lab/question-bank';

const phaseThreeBatchTwoCategories = [
  'involuntary_medication_refusal',
  'discharge_ama_elopement_risk',
  'personality_disorder_language_caution',
] as const;

describe('vera lab question bank phase 3 batch 2 coverage', () => {
  it('adds three messy multi-turn cases for each phase 3 batch 2 category', () => {
    for (const category of phaseThreeBatchTwoCategories) {
      const cases = allVeraProviderQuestionCases.filter((item) => item.category === category);
      expect(cases.length).toBe(3);
    }
  });

  it('requires correction and pressure prompts plus turn metadata for every phase 3 batch 2 case', () => {
    const batchTwoCases = allVeraProviderQuestionCases.filter((item) =>
      phaseThreeBatchTwoCategories.includes(item.category as typeof phaseThreeBatchTwoCategories[number]),
    );

    expect(batchTwoCases.length).toBe(9);

    for (const testCase of batchTwoCases) {
      expect(testCase.followup_prompt).toBeTruthy();
      expect(testCase.pressure_prompt).toBeTruthy();
      expect(testCase.turns?.some((turn) => turn.label === 'correction')).toBe(true);
      expect(testCase.turns?.some((turn) => turn.label === 'pressure')).toBe(true);
      expect(testCase.must_include.length).toBeGreaterThan(0);
      expect(testCase.must_not_include.length).toBeGreaterThan(0);
    }
  });

  it('covers refusal, AMA/elopement, and personality-language caution without duplicating legacy prompts', () => {
    const batchTwoCases = allVeraProviderQuestionCases.filter((item) =>
      phaseThreeBatchTwoCategories.includes(item.category as typeof phaseThreeBatchTwoCategories[number]),
    );
    const legacyCases = allVeraProviderQuestionCases.filter((item) =>
      !phaseThreeBatchTwoCategories.includes(item.category as typeof phaseThreeBatchTwoCategories[number]),
    );

    const batchTwoModes = new Set(batchTwoCases.map((item) => item.expected_answer_mode));
    const legacyPrompts = new Set(legacyCases.map((item) => item.prompt));

    expect(batchTwoModes.has('chart_ready_wording')).toBe(true);
    expect(batchTwoModes.has('warning_language')).toBe(true);
    expect(batchTwoModes.has('clinical_explanation')).toBe(true);
    expect(batchTwoModes.has('workflow_guidance')).toBe(true);

    for (const testCase of batchTwoCases) {
      expect(legacyPrompts.has(testCase.prompt)).toBe(false);
    }
  });

  it('keeps the expected high-risk safety hooks visible in each batch 2 category', () => {
    const involuntaryCases = allVeraProviderQuestionCases.filter((item) => item.category === 'involuntary_medication_refusal');
    const amaCases = allVeraProviderQuestionCases.filter((item) => item.category === 'discharge_ama_elopement_risk');
    const personalityCases = allVeraProviderQuestionCases.filter((item) => item.category === 'personality_disorder_language_caution');

    expect(involuntaryCases.some((item) => item.must_include.some((phrase) => phrase.includes('legal authority')))).toBe(true);
    expect(amaCases.some((item) => item.must_include.some((phrase) => phrase.includes('unresolved safety')))).toBe(true);
    expect(personalityCases.some((item) => item.must_include.some((phrase) => phrase.includes('non-stigmatizing')))).toBe(true);
  });
});
