import { describe, expect, it } from 'vitest';

import { allVeraProviderQuestionCases } from '@/lib/veranote/lab/question-bank';

const phaseTwoCategories = [
  'discharge_planning_realistic',
  'capacity_and_consent',
  'collateral_vs_patient_conflict',
  'malingering_or_inconsistency',
  'legal_hold_language',
  'substance_intoxication_vs_withdrawal',
  'medical_vs_psych_overlap',
  'vague_or_fragmented_source',
  'provider_time_pressure',
  'ambiguous_followup_prompts',
] as const;

describe('vera lab question bank phase 2 coverage', () => {
  it('keeps primary case ids and prompts unique', () => {
    const ids = allVeraProviderQuestionCases.map((item) => item.id);
    const prompts = allVeraProviderQuestionCases.map((item) => item.prompt);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it('adds two messy cases for each new phase 2 category', () => {
    for (const category of phaseTwoCategories) {
      const cases = allVeraProviderQuestionCases.filter((item) => item.category === category);
      expect(cases.length).toBe(2);
    }
  });

  it('requires follow-up and pressure prompts plus correction and pressure turns for phase 2 cases', () => {
    const phaseTwoCases = allVeraProviderQuestionCases.filter((item) => phaseTwoCategories.includes(item.category as typeof phaseTwoCategories[number]));

    expect(phaseTwoCases.length).toBe(20);

    for (const testCase of phaseTwoCases) {
      expect(testCase.followup_prompt).toBeTruthy();
      expect(testCase.pressure_prompt).toBeTruthy();
      expect(testCase.turns?.some((turn) => turn.label === 'correction')).toBe(true);
      expect(testCase.turns?.some((turn) => turn.label === 'pressure')).toBe(true);
    }
  });

  it('covers the required answer-mode spread without duplicating legacy prompts', () => {
    const phaseTwoCases = allVeraProviderQuestionCases.filter((item) => phaseTwoCategories.includes(item.category as typeof phaseTwoCategories[number]));
    const legacyCases = allVeraProviderQuestionCases.filter((item) => !phaseTwoCategories.includes(item.category as typeof phaseTwoCategories[number]));
    const phaseTwoModes = new Set(phaseTwoCases.map((item) => item.expected_answer_mode));
    const legacyPrompts = new Set(legacyCases.map((item) => item.prompt));

    expect(phaseTwoModes.has('chart_ready_wording')).toBe(true);
    expect(phaseTwoModes.has('warning_language')).toBe(true);
    expect(phaseTwoModes.has('mse_completion_limits')).toBe(true);
    expect(phaseTwoModes.has('clinical_explanation')).toBe(true);
    expect(phaseTwoModes.has('workflow_guidance')).toBe(true);

    for (const testCase of phaseTwoCases) {
      expect(legacyPrompts.has(testCase.prompt)).toBe(false);
    }
  });
});
