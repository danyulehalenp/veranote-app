import { describe, expect, it } from 'vitest';

import { allVeraProviderQuestionCases } from '@/lib/veranote/lab/question-bank';

const phaseThreeBatchOneCategories = [
  'consult_liaison_medical_comorbidity',
  'violence_homicide_risk_nuance',
  'eating_disorder_medical_instability',
] as const;

describe('vera lab question bank phase 3 batch 1 coverage', () => {
  it('adds three messy multi-turn cases for each phase 3 batch 1 category', () => {
    for (const category of phaseThreeBatchOneCategories) {
      const cases = allVeraProviderQuestionCases.filter((item) => item.category === category);
      expect(cases.length).toBe(3);
    }
  });

  it('requires correction and pressure prompts plus turn metadata for every phase 3 batch 1 case', () => {
    const batchOneCases = allVeraProviderQuestionCases.filter((item) =>
      phaseThreeBatchOneCategories.includes(item.category as typeof phaseThreeBatchOneCategories[number]),
    );

    expect(batchOneCases.length).toBe(9);

    for (const testCase of batchOneCases) {
      expect(testCase.followup_prompt).toBeTruthy();
      expect(testCase.pressure_prompt).toBeTruthy();
      expect(testCase.turns?.some((turn) => turn.label === 'correction')).toBe(true);
      expect(testCase.turns?.some((turn) => turn.label === 'pressure')).toBe(true);
      expect(testCase.must_include.length).toBeGreaterThan(0);
      expect(testCase.must_not_include.length).toBeGreaterThan(0);
    }
  });

  it('covers consult-liaison, violence nuance, and eating-disorder medical-risk answer modes without duplicating existing prompts', () => {
    const batchOneCases = allVeraProviderQuestionCases.filter((item) =>
      phaseThreeBatchOneCategories.includes(item.category as typeof phaseThreeBatchOneCategories[number]),
    );
    const legacyCases = allVeraProviderQuestionCases.filter((item) =>
      !phaseThreeBatchOneCategories.includes(item.category as typeof phaseThreeBatchOneCategories[number]),
    );

    const batchOneModes = new Set(batchOneCases.map((item) => item.expected_answer_mode));
    const legacyPrompts = new Set(legacyCases.map((item) => item.prompt));

    expect(batchOneModes.has('chart_ready_wording')).toBe(true);
    expect(batchOneModes.has('warning_language')).toBe(true);
    expect(batchOneModes.has('clinical_explanation')).toBe(true);
    expect(batchOneModes.has('workflow_guidance')).toBe(true);

    for (const testCase of batchOneCases) {
      expect(legacyPrompts.has(testCase.prompt)).toBe(false);
    }
  });

  it('keeps the expected high-risk safety hooks visible in each new category', () => {
    const consultCases = allVeraProviderQuestionCases.filter((item) => item.category === 'consult_liaison_medical_comorbidity');
    const violenceCases = allVeraProviderQuestionCases.filter((item) => item.category === 'violence_homicide_risk_nuance');
    const eatingDisorderCases = allVeraProviderQuestionCases.filter((item) => item.category === 'eating_disorder_medical_instability');

    expect(consultCases.some((item) => item.must_include.some((phrase) => phrase.includes('medical contributor')))).toBe(true);
    expect(violenceCases.some((item) => item.must_include.some((phrase) => phrase.includes('collateral')))).toBe(true);
    expect(eatingDisorderCases.some((item) => item.must_include.some((phrase) => phrase.includes('medical instability')))).toBe(true);
  });
});
