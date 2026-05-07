import { describe, expect, it } from 'vitest';

import {
  postNoteCptRegressionCases,
  runPostNoteCptRegression,
} from '@/lib/eval/note-generation/post-note-cpt-regression';
import { evaluatePostNoteCptRecommendations } from '@/lib/veranote/defensibility/cpt-support';

describe('post-note CPT recommendation regression', () => {
  it('keeps a broad bank of completed-note CPT support scenarios', () => {
    expect(postNoteCptRegressionCases.length).toBeGreaterThanOrEqual(10);

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
    expect(caseText).toMatch(/telehealth consent/i);
    expect(caseText).toMatch(/Patient location/i);
    expect(caseText).toMatch(/too thin|doing okay/i);
  });

  it('recommends only conservative CPT-support candidate families from completed notes', () => {
    const report = runPostNoteCptRegression();

    expect(report.total).toBe(postNoteCptRegressionCases.length);
    expect(report.failed, JSON.stringify(report.cases.filter((item) => !item.passed), null, 2)).toBe(0);
    expect(report.cases.every((item) => item.summary.includes('CPT-support') || item.summary.includes('too thin'))).toBe(true);
  });

  it('returns documentation-readiness signals without selecting a final CPT level', () => {
    const report = runPostNoteCptRegression();
    const telehealth = report.cases.find((item) => item.id === 'telehealth-med-followup-with-consent-location-still-review-only');
    const assessment = evaluatePostNoteCptRecommendations({
      noteType: 'Outpatient Psych Telehealth Follow-Up',
      completedNoteText: [
        'Telehealth medication follow-up completed by video.',
        'Patient location documented as home in Louisiana; telehealth consent reviewed.',
        'Medication adherence, side effects, and treatment options reviewed.',
        'Total time: 28 minutes.',
      ].join(' '),
      encounterSupport: {
        totalMinutes: '28',
        telehealthModality: 'audio-video',
        telehealthConsent: true,
        patientLocation: 'Home in Louisiana',
      },
    });

    expect(telehealth?.passed).toBe(true);
    expect(assessment.documentationReadiness.status).toBe('review-candidate');
    expect(assessment.documentationReadiness.presentElements.join(' ')).toMatch(/Telehealth consent support is visible/i);
    expect(assessment.documentationReadiness.presentElements.join(' ')).toMatch(/Patient location support is visible/i);
    expect(assessment.guardrails.join(' ')).toContain('does not select the final CPT level');
    expect(JSON.stringify(assessment)).not.toMatch(/must bill|bill this code|guaranteed/i);
  });
});
