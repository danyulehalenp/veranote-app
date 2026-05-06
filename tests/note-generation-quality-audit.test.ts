import { describe, expect, it } from 'vitest';

import { auditGeneratedNoteQuality } from '@/lib/eval/note-generation/note-quality-audit';

describe('note generation quality audit', () => {
  const riskConflictSource = {
    intakeCollateral: [
      'Nursing note:',
      '- Mother collateral reports suicidal texts last night.',
      '- Lithium level ordered and pending.',
      '- Medical clearance not documented.',
    ].join('\n'),
    clinicianNotes: [
      'Provider note:',
      '- Patient denies current SI/HI.',
      '- Patient requests discharge.',
      '- MSE not detailed yet.',
    ].join('\n'),
  };

  it('passes a source-faithful note that preserves risk conflict and pending data', () => {
    const result = auditGeneratedNoteQuality({
      noteType: 'Inpatient Psych Progress Note',
      sourceSections: riskConflictSource,
      note: [
        'Interval / Source Summary:',
        'Patient requests discharge and denies current SI/HI. Mother collateral reports suicidal texts last night. Lithium level was ordered and remains pending, and medical clearance is not documented in the available source.',
        '',
        'MSE / Risk:',
        'Detailed MSE is not documented in the available source. Risk wording should preserve the current denial alongside collateral concern and pending medical data.',
        '',
        'Plan:',
        'Continue source-supported review of safety, collateral, and pending medical data before final disposition wording is completed.',
      ].join('\n'),
    });

    expect(result.passed).toBe(true);
    expect(result.blockingFindings).toHaveLength(0);
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it('blocks provider prompt leakage and EHR/UI artifacts', () => {
    const result = auditGeneratedNoteQuality({
      noteType: 'Outpatient Psych Follow-Up',
      sourceSections: {
        clinicianNotes: 'Patient reports anxiety improved. Denies SI/HI.',
        objectiveData: 'Provider Add-On: Do not place CPT preference in the clinical note.',
      },
      note: 'Veranote draft: Provider Add-On says do not place CPT preference in the note. Apply to Draft. undefined',
    });

    expect(result.passed).toBe(false);
    expect(result.blockingFindings.map((finding) => finding.id)).toEqual(expect.arrayContaining([
      'technical-artifact',
      'assistant-ui-leakage',
      'provider-instruction-leakage',
    ]));
  });

  it('blocks unsupported reassurance when source has risk, collateral, or pending data', () => {
    const result = auditGeneratedNoteQuality({
      noteType: 'Inpatient Psych Discharge Summary',
      sourceSections: riskConflictSource,
      note: [
        'Patient denies SI/HI and is low risk. Patient is medically cleared and stable for discharge.',
        'Lithium level is normal. MSE: thought process linear, insight and judgment intact, alert and oriented x4.',
      ].join('\n'),
    });

    expect(result.passed).toBe(false);
    expect(result.blockingFindings.map((finding) => finding.id)).toEqual(expect.arrayContaining([
      'unsupported-reassurance',
      'pending-data-not-preserved',
      'invented-thought-process',
      'invented-insight-judgment',
      'invented-orientation',
    ]));
  });

  it('allows medically-cleared wording when the note preserves it as questioned or not established', () => {
    const result = auditGeneratedNoteQuality({
      noteType: 'Inpatient Psych Initial Adult Evaluation',
      sourceSections: {
        intakeCollateral: 'Transfer note says "med clear?" with question mark.',
        clinicianNotes: 'Patient denies SI/HI. CT head showed no acute intracranial abnormality.',
      },
      note: [
        'Reason for Admission:',
        'Patient was transferred for psychiatric evaluation after an ER referral. The transfer note questions whether the patient is medically cleared, so medical clearance should remain not established from this source.',
        '',
        'Safety / Risk:',
        'Patient denies suicidal and homicidal ideation in the available source. No final disposition language is supported by the source.',
      ].join('\n'),
    });

    expect(result.passed).toBe(true);
    expect(result.blockingFindings.map((finding) => finding.id)).not.toContain('unsupported-reassurance');
  });

  it('flags source conflict attribution for review without failing the audit', () => {
    const result = auditGeneratedNoteQuality({
      noteType: 'Adolescent Psychiatric Evaluation',
      sourceSections: {
        intakeCollateral: 'Mother collateral reports 3 nights barely sleeping and school suspension for fight.',
        clinicianNotes: 'Teen denies decreased need for sleep and says fight was self-defense.',
      },
      note: [
        'History:',
        'Sleep and behavioral concerns were discussed during the evaluation. The available source describes a recent conflict and ongoing concern, but the draft does not clearly separate each reporter.',
        '',
        'Risk:',
        'No SI/HI was reported in the available note source. Continued review should keep source attribution explicit as the note is finalized.',
      ].join('\n'),
    });

    expect(result.passed).toBe(true);
    expect(result.reviewFindings.map((finding) => finding.id)).toContain('source-conflict-not-attributed');
  });
});
