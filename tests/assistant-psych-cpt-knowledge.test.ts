import { describe, expect, it } from 'vitest';
import { buildPsychCptHelp } from '@/lib/veranote/assistant-psych-cpt-knowledge';

describe('assistant psych cpt knowledge', () => {
  it('answers psych med-management cpt family questions conservatively', () => {
    const response = buildPsychCptHelp('what cpt code do i use for psych med management?');

    expect(response?.message).toContain('office or outpatient E/M family');
    expect(response?.suggestions?.some((item) => item.includes('E/M plus a psychotherapy add-on'))).toBe(true);
  });

  it('answers psychotherapy add-on questions directly', () => {
    const response = buildPsychCptHelp('when do i use 90833?');

    expect(response?.message).toContain('90833, 90836, and 90838');
    expect(response?.message).toContain('used with an E/M service on the same day');
  });

  it('answers compare-style outpatient psychotherapy and intake questions directly', () => {
    const intakeCompare = buildPsychCptHelp('90791 vs 90792');
    const therapyCompare = buildPsychCptHelp('90834 vs 90837');
    const emCompare = buildPsychCptHelp('when do i use e/m alone vs e/m + 90833?');

    expect(intakeCompare?.message).toContain('difference between 90791 and 90792');
    expect(intakeCompare?.message).toContain('medical services');
    expect(therapyCompare?.message).toContain('difference between 90834 and 90837');
    expect(therapyCompare?.suggestions?.some((item) => item.includes('psychotherapy-only'))).toBe(true);
    expect(emCompare?.message).toContain('E/M alone versus E/M plus 90833');
    expect(emCompare?.suggestions?.some((item) => item.includes('backfill therapy language'))).toBe(true);
  });

  it('answers follow-up, crisis-boundary, and telehealth cpt questions directly', () => {
    const intakeVsFollowup = buildPsychCptHelp('intake vs follow-up for psych med management');
    const therapyBoundary = buildPsychCptHelp('psychotherapy-only vs med management follow-up');
    const crisisBoundary = buildPsychCptHelp('crisis psychotherapy vs regular psychotherapy');
    const telehealth = buildPsychCptHelp('what do i do with psych telehealth cpt coding?');

    expect(intakeVsFollowup?.message).toContain('intake families and follow-up families should stay separate');
    expect(therapyBoundary?.message).toContain('Psychotherapy-only follow-up and med-management follow-up are different billing families');
    expect(crisisBoundary?.message).toContain('Crisis psychotherapy and standard psychotherapy should stay clearly separated');
    expect(telehealth?.message).toContain('For psych telehealth');
    expect(telehealth?.suggestions?.some((item) => item.includes('Choose the core family first'))).toBe(true);
  });

  it('answers documentation-support and red-flag cpt questions directly', () => {
    const addOnSupport = buildPsychCptHelp('what has to be documented to support 90833?');
    const emVsCombo = buildPsychCptHelp('what makes a note read like e/m only vs e/m + psychotherapy?');
    const redFlags = buildPsychCptHelp('what are red flags that a group therapy or crisis psychotherapy note is not enough for billing support?');

    expect(addOnSupport?.message).toContain('both services truly happened');
    expect(addOnSupport?.suggestions?.some((item) => item.includes('generic supportive counseling'))).toBe(true);
    expect(emVsCombo?.message).toContain('E/M only versus E/M plus psychotherapy');
    expect(redFlags?.message).toContain('Documentation red flags matter a lot');
    expect(redFlags?.suggestions?.some((item) => item.includes('Crisis-psychotherapy red flags'))).toBe(true);
  });

  it('answers quick billing-support checklist questions directly', () => {
    const response = buildPsychCptHelp('before i sign this, give me a quick billing support checklist for 90833');

    expect(response?.message).toContain('quick billing-support checklist');
    expect(response?.suggestions?.some((item) => item.includes('Likely family'))).toBe(true);
    expect(response?.suggestions?.some((item) => item.includes('verify before signing'))).toBe(true);
  });

  it('answers outpatient scenario-aware billing sanity checks directly', () => {
    const newVsEstablished = buildPsychCptHelp('new vs established e/m for psych med management follow-up');
    const collateralVsFamily = buildPsychCptHelp('collateral vs family therapy billing');
    const interactiveMisuse = buildPsychCptHelp('interactive complexity red flags');
    const addOnMisuse = buildPsychCptHelp('90833 misuse warnings');
    const briefMedCheck = buildPsychCptHelp('quick med management follow-up billing check');

    expect(newVsEstablished?.message).toContain('new versus established status');
    expect(collateralVsFamily?.message).toContain('Collateral gathering or family discussion is not automatically family psychotherapy');
    expect(interactiveMisuse?.message).toContain('Interactive complexity should be treated cautiously');
    expect(addOnMisuse?.message).toContain('Psychotherapy add-on misuse');
    expect(briefMedCheck?.message).toContain('short outpatient med-management follow-up');
  });

  it('flags pasted-note billing support concerns for thin documentation directly', () => {
    const addOnConcern = buildPsychCptHelp('does this note support 90833? Interval update: anxiety a little better. Medications reviewed. Continue sertraline 100 mg. Follow up in 4 weeks.');
    const interactiveConcern = buildPsychCptHelp('does this note support 90785? Session note: patient upset, mother present, discussed plan and follow up.');
    const crisisConcern = buildPsychCptHelp('does this note support crisis psychotherapy 90839? Session note: patient was anxious and upset. Safety discussed. Follow up tomorrow.');

    expect(addOnConcern?.message).toContain('thin for a psychotherapy add-on family');
    expect(interactiveConcern?.message).toContain('thin for 90785');
    expect(crisisConcern?.message).toContain('thin for crisis psychotherapy');
  });

  it('uses current draft context for note-support and generic billing concern questions', () => {
    const familySpecific = buildPsychCptHelp('does this note support 90833?', 'Interval update: anxiety a little better. Medications reviewed. Continue sertraline 100 mg. Follow up in 4 weeks.');
    const genericConcern = buildPsychCptHelp('any billing concerns before i sign this?', 'Interval update: anxiety a little better. Medications reviewed. Continue sertraline 100 mg. Follow up in 4 weeks.');

    expect(familySpecific?.message).toContain('thin for a psychotherapy add-on family');
    expect(genericConcern?.message).toContain('billing-support concern');
  });

  it('answers psychiatric diagnostic evaluation questions directly', () => {
    const response = buildPsychCptHelp('what is 90792?');

    expect(response?.message).toContain('psychiatric diagnostic evaluation with medical services');
  });

  it('answers psychotherapy crisis questions directly', () => {
    const response = buildPsychCptHelp('what cpt code is psychotherapy crisis?');

    expect(response?.message).toContain('90839 and 90840');
    expect(response?.suggestions?.some((item) => item.includes('crisis timing literally'))).toBe(true);
  });

  it('answers interactive complexity questions directly', () => {
    const response = buildPsychCptHelp('when do i use 90785?');

    expect(response?.message).toContain('interactive complexity add-on code');
    expect(response?.suggestions?.some((item) => item.includes('complicated communication'))).toBe(true);
  });

  it('answers family and group psychotherapy questions directly', () => {
    const familyWithoutPatient = buildPsychCptHelp('what is 90846?');
    const familyWithPatient = buildPsychCptHelp('what is 90847?');
    const group = buildPsychCptHelp('what is 90853?');
    const compare = buildPsychCptHelp('family therapy vs group therapy');

    expect(familyWithoutPatient?.message).toContain('family psychotherapy without the patient present');
    expect(familyWithPatient?.message).toContain('family psychotherapy with the patient present');
    expect(group?.message).toContain('group psychotherapy');
    expect(compare?.message).toContain('Family therapy and group therapy are different psychotherapy families');
  });

  it('does not hijack non-cpt psychiatry questions', () => {
    const response = buildPsychCptHelp('what do you know about depression?');

    expect(response).toBeNull();
  });
});
