import { describe, expect, it } from 'vitest';

import { allVeraProviderQuestionCases } from '@/lib/veranote/lab/question-bank';

const messyProviderCategories = [
  'messy_risk_wording',
  'messy_hpi_generation',
  'messy_progress_note_cleanup',
  'messy_mse_completion',
  'messy_discharge_wording',
  'messy_medication_plan_wording',
  'messy_substance_vs_psych',
  'messy_collateral_integration',
  'messy_medical_psych_overlap',
  'messy_direct_reference_question',
] as const;

const shorthandPattern = /\b(pt|si|hi|avh|ah|vh|dc|d\/c|meds|hpi|mse|uds|prn|psych|collateral|idk|rn)\b/i;
const casualShorthandPattern = /(can i say|word this better|does this sound ok|make it less bad|need .* fast|pls|reccomend|dont|w\/o)/i;
const obviousPhiPattern = /\b(mrn|dob|date of birth|ssn|social security|address|street|st\.|avenue|ave\.|road|rd\.|boulevard|blvd\.|apartment|apt\.|unit|room \d+)\b/i;
const directIdentifierPattern = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/;

describe('vera lab messy provider question-bank coverage', () => {
  it('adds two PHI-safe messy cases for each new messy-provider category', () => {
    for (const category of messyProviderCategories) {
      const cases = allVeraProviderQuestionCases.filter((item) => item.category === category);
      expect(cases.length).toBe(2);
    }
  });

  it('keeps messy-provider case ids and prompts unique relative to the rest of the bank', () => {
    const messyCases = allVeraProviderQuestionCases.filter((item) =>
      messyProviderCategories.includes(item.category as typeof messyProviderCategories[number]),
    );
    const allIds = allVeraProviderQuestionCases.map((item) => item.id);
    const allPrompts = allVeraProviderQuestionCases.map((item) => item.prompt);

    expect(new Set(allIds).size).toBe(allIds.length);
    expect(new Set(allPrompts).size).toBe(allPrompts.length);

    for (const testCase of messyCases) {
      expect(testCase.followup_prompt).toBeTruthy();
      expect(testCase.pressure_prompt).toBeTruthy();
      expect(testCase.turns?.some((turn) => turn.label === 'correction')).toBe(true);
      expect(testCase.turns?.some((turn) => turn.label === 'pressure')).toBe(true);
      expect(testCase.expected_answer_mode).toBeTruthy();
      expect(testCase.must_include.length).toBeGreaterThan(0);
      expect(testCase.must_not_include.length).toBeGreaterThan(0);
    }
  });

  it('uses realistic messy-provider shorthand without obvious PHI markers or raw-note style identifiers', () => {
    const messyCases = allVeraProviderQuestionCases.filter((item) =>
      messyProviderCategories.includes(item.category as typeof messyProviderCategories[number]),
    );

    expect(messyCases.length).toBe(20);

    for (const testCase of messyCases) {
      const combined = [
        testCase.prompt,
        testCase.followup_prompt || '',
        testCase.pressure_prompt || '',
      ].join(' ');

      expect(
        shorthandPattern.test(testCase.prompt) || casualShorthandPattern.test(testCase.prompt),
        `${testCase.id} should sound like a rushed provider prompt`,
      ).toBe(true);

      expect(obviousPhiPattern.test(combined), `${testCase.id} should not contain obvious PHI markers`).toBe(false);
      expect(directIdentifierPattern.test(combined), `${testCase.id} should not contain full-name style identifiers`).toBe(false);
    }
  });

  it('covers messy note-writing, risk, overlap, and direct-reference patterns with safety checks', () => {
    const messyCases = allVeraProviderQuestionCases.filter((item) =>
      messyProviderCategories.includes(item.category as typeof messyProviderCategories[number]),
    );
    const answerModes = new Set(messyCases.map((item) => item.expected_answer_mode));

    expect(answerModes.has('chart_ready_wording')).toBe(true);
    expect(answerModes.has('warning_language')).toBe(true);
    expect(answerModes.has('mse_completion_limits')).toBe(true);
    expect(answerModes.has('clinical_explanation')).toBe(true);
    expect(answerModes.has('workflow_guidance')).toBe(true);
    expect(answerModes.has('direct_reference_answer')).toBe(true);
    expect(answerModes.has('general_health_reference')).toBe(true);

    expect(messyCases.some((item) => item.category === 'messy_direct_reference_question')).toBe(true);
    expect(messyCases.some((item) => item.must_not_include.some((phrase) => phrase.includes('stable for discharge')))).toBe(true);
    expect(messyCases.some((item) => item.must_not_include.some((phrase) => phrase.includes('low risk')))).toBe(true);
    expect(messyCases.some((item) => item.must_not_include.some((phrase) => phrase.includes('noncompliant')))).toBe(true);
  });
});
