import { describe, expect, it } from 'vitest';
import { evaluateMedicalNecessitySupport } from '@/lib/note/medical-necessity-support';

describe('medical necessity support', () => {
  it('stays inactive for non-inpatient-psych note types', () => {
    const result = evaluateMedicalNecessitySupport({
      noteType: 'SOAP Follow-Up Note',
      draftText: 'Patient presents for routine medication follow-up.',
    });

    expect(result.applies).toBe(false);
  });

  it('scores a strong inpatient psych case with Louisiana boosts', () => {
    const result = evaluateMedicalNecessitySupport({
      noteType: 'Inpatient Psych Progress Note',
      draftText: 'Patient reports suicidal ideation with plan to overdose tonight and access to medications at home. Attempted hanging 2 days ago and returned to the ED today after outpatient safety planning failed. Has not eaten in 3 days, is not showering, missed 5 days of lithium, and was wandering outside unable to state address. Requires 24-hour inpatient observation because lower levels of care were insufficient.',
    });

    expect(result.applies).toBe(true);
    expect(result.totalScore).toBeGreaterThanOrEqual(10);
    expect(result.status).toBe('strong-approval-case');
    expect(result.louisianaBoosts.length).toBeGreaterThanOrEqual(2);
  });

  it('flags thin why-now and lower-level-care support', () => {
    const result = evaluateMedicalNecessitySupport({
      noteType: 'Inpatient Psych Progress Note',
      draftText: 'Patient is unsafe and needs structure for stabilization. Admission recommended.',
    });

    expect(result.status).toBe('high-denial-risk');
    expect(result.nationalCues.some((cue) => cue.id === 'national-why-now')).toBe(true);
    expect(result.nationalCues.some((cue) => cue.id === 'national-lower-level-failure')).toBe(true);
  });

  it('flags grave disability claims without objective proof', () => {
    const result = evaluateMedicalNecessitySupport({
      noteType: 'Inpatient Psych Progress Note',
      draftText: 'Patient has grave disability and needs inpatient admission for stabilization.',
    });

    expect(result.louisianaCues.some((cue) => cue.id === 'louisiana-grave-disability-proof')).toBe(true);
  });
});
