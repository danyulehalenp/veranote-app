import { describe, expect, it } from 'vitest';

import { buildSourceEvidenceReview } from '@/lib/note/source-evidence-review';
import { EMPTY_SOURCE_SECTIONS } from '@/lib/ai/source-sections';

describe('source evidence review', () => {
  it('summarizes loaded source lanes and exposes stable source-field targets', () => {
    const review = buildSourceEvidenceReview({
      noteType: 'Inpatient Psych Follow-Up',
      sourceSections: {
        ...EMPTY_SOURCE_SECTIONS,
        intakeCollateral: 'Nursing intake: slept 2 hours. Vitals pending.',
        clinicianNotes: 'Patient reports mood is depressed. Insight limited.',
      },
    });

    expect(review.loadedLaneCount).toBe(2);
    expect(review.sourceCount).toBeGreaterThan(5);
    expect(review.laneSummaries.find((lane) => lane.id === 'intakeCollateral')).toMatchObject({
      label: 'Pre-Visit Data',
      status: 'present',
      targetId: 'source-field-intakeCollateral',
    });
  });

  it('flags patient denial against collateral or staff risk concern without flattening either source', () => {
    const review = buildSourceEvidenceReview({
      noteType: 'Inpatient Psych Follow-Up',
      sourceSections: {
        ...EMPTY_SOURCE_SECTIONS,
        intakeCollateral: 'Patient denies SI/HI. Collateral from mother reports suicidal texts last night and concern for overdose.',
      },
    });

    const conflict = review.signals.find((signal) => signal.id === 'patient-collateral-risk-conflict');
    expect(conflict?.severity).toBe('caution');
    expect(conflict?.summary).toMatch(/Patient denial and collateral\/staff concern/i);
    expect(conflict?.whatToCheck.join(' ')).toMatch(/side by side/i);
  });

  it('flags limited MSE support instead of encouraging invented normal findings', () => {
    const review = buildSourceEvidenceReview({
      noteType: 'Outpatient Psych Follow-Up',
      sourceSections: {
        ...EMPTY_SOURCE_SECTIONS,
        clinicianNotes: 'Mood depressed. Thought content hopeless. Insight poor.',
      },
    });

    const mseGap = review.signals.find((signal) => signal.id === 'mse-limited-source');
    expect(mseGap?.severity).toBe('review');
    expect(mseGap?.summary).toMatch(/MSE source is limited/i);
    expect(mseGap?.whatToCheck.join(' ')).toMatch(/Missing domains/i);
  });

  it('keeps pending labs and medical clearance uncertainty visible', () => {
    const review = buildSourceEvidenceReview({
      noteType: 'Inpatient Psych Evaluation',
      sourceSections: {
        ...EMPTY_SOURCE_SECTIONS,
        intakeCollateral: 'ED packet: UDS pending, EKG pending, medical clearance pending.',
      },
    });

    expect(review.signals.find((signal) => signal.id === 'pending-data-visible')).toMatchObject({
      severity: 'review',
      label: 'Pending data',
    });
  });

  it('flags draft reassurance when source has uncertainty that the draft does not preserve', () => {
    const review = buildSourceEvidenceReview({
      noteType: 'Inpatient Psych Follow-Up',
      sourceSections: {
        ...EMPTY_SOURCE_SECTIONS,
        intakeCollateral: 'Patient denies SI. Collateral reports suicidal texts. Labs pending.',
      },
      draftText: 'Patient is medically cleared and low risk for discharge.',
    });

    const reassurance = review.signals.find((signal) => signal.id === 'unsupported-reassurance-draft');
    expect(reassurance?.severity).toBe('caution');
    expect(reassurance?.whyThisMatters).toMatch(/Risk, discharge, and clearance wording/i);
  });

  it('treats provider add-on prompts as instructions rather than chart facts', () => {
    const review = buildSourceEvidenceReview({
      noteType: 'Outpatient Psych Follow-Up',
      sourceSections: {
        ...EMPTY_SOURCE_SECTIONS,
        objectiveData: 'Prompt: make this one paragraph. CPT preference 99214 if supported.',
      },
    });

    const addon = review.signals.find((signal) => signal.id === 'provider-addon-instruction-only');
    expect(addon?.severity).toBe('info');
    expect(addon?.whatToCheck.join(' ')).toMatch(/should not leak into the final note/i);
  });

  it('flags OCR-style misspellings, pending data, risk conflict, and med discrepancy', () => {
    const review = buildSourceEvidenceReview({
      noteType: 'Inpatient Psych Follow-Up',
      sourceSections: {
        ...EMPTY_SOURCE_SECTIONS,
        intakeCollateral: 'Scanned ER packet with OCR: pt denys SI today. Mom reports suicdal txts last night. UDS pendng and EKG not bak.',
        objectiveData: 'Med list still shows sertraline 50 mg, but pt not takeing meds for two weeks.',
      },
      draftText: 'Patient is medically cleared with no safety concerns.',
    });

    expect(review.signals.find((signal) => signal.id === 'source-quality-review')).toMatchObject({
      severity: 'review',
      label: 'Source quality',
    });
    expect(review.signals.find((signal) => signal.id === 'patient-collateral-risk-conflict')?.severity).toBe('caution');
    expect(review.signals.find((signal) => signal.id === 'pending-data-visible')?.summary).toMatch(/pending/i);
    expect(review.signals.find((signal) => signal.id === 'medication-source-discrepancy')?.summary).toMatch(/Medication source/i);
    expect(review.signals.find((signal) => signal.id === 'unsupported-reassurance-draft')?.severity).toBe('caution');
  });
});
