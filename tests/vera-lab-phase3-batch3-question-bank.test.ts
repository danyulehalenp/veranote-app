import { describe, expect, it } from 'vitest';

import { allVeraProviderQuestionCases } from '@/lib/veranote/lab/question-bank';

const phaseThreeBatchThreeCategories = [
  'acute_inpatient_hpi_generation',
  'progress_note_refinement',
  'discharge_summary_generation',
] as const;

describe('vera lab question bank phase 3 batch 3 coverage', () => {
  it('adds three messy multi-turn cases for each phase 3 batch 3 category', () => {
    for (const category of phaseThreeBatchThreeCategories) {
      const cases = allVeraProviderQuestionCases.filter((item) => item.category === category);
      expect(cases.length).toBe(3);
    }
  });

  it('requires correction and pressure prompts plus turn metadata for every phase 3 batch 3 case', () => {
    const batchThreeCases = allVeraProviderQuestionCases.filter((item) =>
      phaseThreeBatchThreeCategories.includes(item.category as typeof phaseThreeBatchThreeCategories[number]),
    );

    expect(batchThreeCases.length).toBe(9);

    for (const testCase of batchThreeCases) {
      expect(testCase.followup_prompt).toBeTruthy();
      expect(testCase.pressure_prompt).toBeTruthy();
      expect(testCase.turns?.some((turn) => turn.label === 'correction')).toBe(true);
      expect(testCase.turns?.some((turn) => turn.label === 'pressure')).toBe(true);
      expect(testCase.must_include.length).toBeGreaterThan(0);
      expect(testCase.must_not_include.length).toBeGreaterThan(0);
      expect(testCase.expected_answer_mode).toBe('chart_ready_wording');
    }
  });

  it('covers HPI, progress-note, and discharge-summary workflows without duplicating legacy prompts', () => {
    const batchThreeCases = allVeraProviderQuestionCases.filter((item) =>
      phaseThreeBatchThreeCategories.includes(item.category as typeof phaseThreeBatchThreeCategories[number]),
    );
    const legacyCases = allVeraProviderQuestionCases.filter((item) =>
      !phaseThreeBatchThreeCategories.includes(item.category as typeof phaseThreeBatchThreeCategories[number]),
    );

    const legacyPrompts = new Set(legacyCases.map((item) => item.prompt));

    for (const testCase of batchThreeCases) {
      expect(legacyPrompts.has(testCase.prompt)).toBe(false);
    }
  });

  it('keeps the expected chart-writing safety hooks visible in each new batch 3 category', () => {
    const hpiCases = allVeraProviderQuestionCases.filter((item) => item.category === 'acute_inpatient_hpi_generation');
    const progressCases = allVeraProviderQuestionCases.filter((item) => item.category === 'progress_note_refinement');
    const dischargeCases = allVeraProviderQuestionCases.filter((item) => item.category === 'discharge_summary_generation');

    expect(hpiCases.some((item) => item.must_include.some((phrase) => phrase.includes('reason for admission')))).toBe(true);
    expect(progressCases.some((item) => item.must_include.some((phrase) => phrase.includes('chart-ready wording:')))).toBe(true);
    expect(dischargeCases.some((item) => item.must_include.some((phrase) => phrase.includes('hospital course')))).toBe(true);
  });
});
