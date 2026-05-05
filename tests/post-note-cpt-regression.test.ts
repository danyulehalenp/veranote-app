import { describe, expect, it } from 'vitest';

import {
  postNoteCptRegressionCases,
  runPostNoteCptRegression,
} from '@/lib/eval/note-generation/post-note-cpt-regression';

describe('post-note CPT recommendation regression', () => {
  it('keeps a broad bank of completed-note CPT support scenarios', () => {
    expect(postNoteCptRegressionCases.length).toBeGreaterThanOrEqual(9);

    const caseText = postNoteCptRegressionCases.map((item) => [
      item.noteType,
      item.completedNoteText,
      item.expectedCandidates.map((candidate) => candidate.family).join(' '),
    ].join('\n')).join('\n\n');

    expect(caseText).toMatch(/Outpatient Psych Follow-Up/i);
    expect(caseText).toMatch(/Therapy Progress Note/i);
    expect(caseText).toMatch(/Outpatient Psychiatric Evaluation/i);
    expect(caseText).toMatch(/Psychiatric Crisis Note/i);
    expect(caseText).toMatch(/Telehealth/i);
    expect(caseText).toMatch(/Interactive complexity/i);
    expect(caseText).toMatch(/Psycotherpay/i);
  });

  it('recommends only conservative CPT-support candidate families from completed notes', () => {
    const report = runPostNoteCptRegression();

    expect(report.total).toBe(postNoteCptRegressionCases.length);
    expect(report.failed, JSON.stringify(report.cases.filter((item) => !item.passed), null, 2)).toBe(0);
    expect(report.cases.every((item) => item.summary.includes('CPT-support') || item.summary.includes('too thin'))).toBe(true);
  });
});
