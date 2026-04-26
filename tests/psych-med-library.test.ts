import { describe, expect, it } from 'vitest';
import { PSYCH_MEDICATION_LIBRARY } from '@/lib/veranote/meds/psych-med-library';
import { detectHighRiskInteraction } from '@/lib/veranote/meds/psych-med-answering';
import {
  answerMedicationReferenceQuestion,
  detectMedicationQuestionIntent,
  findPsychMedication,
  getMedicationProfile,
} from '@/lib/veranote/meds/psych-med-answering';

describe('psych medication knowledge layer v1', () => {
  it('has at least 100 medications', () => {
    expect(PSYCH_MEDICATION_LIBRARY.length).toBeGreaterThanOrEqual(100);
  });

  it('ensures each medication has the required fields', () => {
    for (const medication of PSYCH_MEDICATION_LIBRARY) {
      expect(medication.id).toBeTruthy();
      expect(medication.genericName).toBeTruthy();
      expect(medication.class).toBeTruthy();
      expect(medication.commonUses.length).toBeGreaterThan(0);
      expect(medication.keyAdverseEffects.length).toBeGreaterThan(0);
      expect(medication.highRiskWarnings.length).toBeGreaterThan(0);
      expect(medication.monitoring.length).toBeGreaterThan(0);
      expect(medication.verificationRequiredFor.length).toBeGreaterThan(0);
    }
  });

  it('handles common brand lookups', () => {
    expect(findPsychMedication('Trileptal')?.id).toBe('oxcarbazepine');
    expect(findPsychMedication('Zoloft')?.id).toBe('sertraline');
    expect(findPsychMedication('Abilify')?.id).toBe('aripiprazole');

    const depakote = findPsychMedication('Depakote');
    expect(['divalproex', 'valproic_acid']).toContain(depakote?.id);
  });

  it('handles starts-with lookup safely', () => {
    const response = answerMedicationReferenceQuestion('What antidepressant starts with d?');
    expect(response.text).toContain('duloxetine');
    expect(response.text).toContain('desvenlafaxine');
    expect(response.text).toContain('doxepin');
  });

  it('detects lithium plus ibuprofen risk', () => {
    const matches = detectHighRiskInteraction(['lithium', 'ibuprofen']);
    expect(matches.some((match) => match.rule.id === 'lithium_nsaid_ace_arb_diuretic')).toBe(true);
  });

  it('detects valproate plus lamotrigine risk', () => {
    const matches = detectHighRiskInteraction(['lamotrigine', 'Depakote']);
    expect(matches.some((match) => match.rule.id === 'valproate_lamotrigine_rash')).toBe(true);
  });

  it('detects sertraline plus linezolid or MAOI risk', () => {
    expect(detectHighRiskInteraction(['sertraline', 'linezolid']).some((match) => match.rule.id === 'ssri_snri_maoi')).toBe(true);
    expect(detectHighRiskInteraction(['sertraline', 'phenelzine']).some((match) => match.rule.id === 'ssri_snri_maoi')).toBe(true);
  });

  it('detects benzodiazepine plus opioid risk', () => {
    const matches = detectHighRiskInteraction(['lorazepam', 'opioid']);
    expect(matches.some((match) => match.rule.id === 'benzodiazepine_opioid_alcohol_sedative')).toBe(true);
  });

  it('detects citalopram plus qt-prolonging medication risk', () => {
    const matches = detectHighRiskInteraction(['citalopram', 'ondansetron']);
    expect(matches.some((match) => match.rule.id === 'qt_stacking')).toBe(true);
  });

  it('detects clozapine monitoring warning', () => {
    const matches = detectHighRiskInteraction(['clozapine']);
    expect(matches.some((match) => match.rule.id === 'clozapine_monitoring_bundle')).toBe(true);
  });

  it('includes dose verification caveats', () => {
    const response = answerMedicationReferenceQuestion('What is the starting dose of Trileptal?');
    expect(response.text).toContain('Dosing depends on indication, patient factors, interactions, and current prescribing references.');
    expect(response.text).toContain('Verify with a current prescribing reference');
  });

  it('answers formulation and strength lookups directly', () => {
    expect(detectMedicationQuestionIntent('what mg does Celexa come in')).toBe('formulation_lookup');
    expect(detectMedicationQuestionIntent('how many mg formulations does Celexa come in?')).toBe('formulation_lookup');
    expect(detectMedicationQuestionIntent('what mg doses is celexa availabe in?')).toBe('formulation_lookup');
    expect(detectMedicationQuestionIntent('depakote tablet mg?')).toBe('formulation_lookup');
    expect(detectMedicationQuestionIntent('Patient reports new stress after a breakup and has been anxious and tearful. Exact duration is not documented.')).toBe('unknown');

    const celexa = answerMedicationReferenceQuestion('what mg does Celexa come in');
    expect(celexa.text).toContain('Celexa (citalopram)');
    expect(celexa.text).toContain('10 mg');
    expect(celexa.text).toContain('20 mg');
    expect(celexa.text).toContain('40 mg');
    expect(celexa.text).toContain('Dosing depends on indication, patient factors, and safety considerations, so verify with a current prescribing reference.');

    const zoloft = answerMedicationReferenceQuestion('available doses of Zoloft');
    expect(zoloft.text).toContain('25 mg');
    expect(zoloft.text).toContain('50 mg');
    expect(zoloft.text).toContain('100 mg');

    const zoloftVariant = answerMedicationReferenceQuestion('what doses does Zoloft come in?');
    expect(zoloftVariant.text).toContain('25 mg');
    expect(zoloftVariant.text).not.toContain('SSRIs are antidepressants');

    const abilify = answerMedicationReferenceQuestion('what strengths does Abilify come in');
    expect(abilify.text).toContain('2 mg');
    expect(abilify.text).toContain('30 mg');

    const abilifyVariant = answerMedicationReferenceQuestion('pill strengths for Abilify');
    expect(abilifyVariant.text).toContain('2 mg');
    expect(abilifyVariant.text).toContain('30 mg');

    const lithium = answerMedicationReferenceQuestion('what forms does lithium come in');
    expect(lithium.text).toContain('capsule');
    expect(lithium.text).toContain('extended-release tablet');

    const depakote = answerMedicationReferenceQuestion('tablet strengths for Depakote');
    expect(depakote.text).toContain('125 mg');
    expect(depakote.text).toContain('250 mg');
    expect(depakote.text).toContain('500 mg');

    const depakoteVariant = answerMedicationReferenceQuestion('depakote tablet mg?');
    expect(depakoteVariant.text).toContain('125 mg');
    expect(depakoteVariant.text).toContain('500 mg');

    const lexapro = answerMedicationReferenceQuestion('what strengths does Lexapro come in');
    expect(lexapro.text).toContain('5 mg');
    expect(lexapro.text).toContain('20 mg');

    const prozac = answerMedicationReferenceQuestion('what forms does Prozac come in');
    expect(prozac.text).toContain('capsule');
    expect(prozac.text).toContain('oral solution');

    const buspirone = answerMedicationReferenceQuestion('what strengths does buspirone come in?');
    expect(buspirone.text).toContain("I don't have verified strength/formulation data for that medication in the current library.");
    expect(buspirone.text).toContain('Verify with a current prescribing reference.');
  });

  it('includes interaction verification caveats', () => {
    const response = answerMedicationReferenceQuestion('any interaction concern with Zoloft and trazodone?');
    expect(response.text).toContain('This should be verified against a current drug-interaction reference.');
  });

  it('keeps documentation wording questions non-prescriptive', () => {
    const response = answerMedicationReferenceQuestion('How should I document trazodone in the note?');
    expect(detectMedicationQuestionIntent('How should I document trazodone in the note?')).toBe('documentation_wording');
    expect(response.text).toContain('documentation should stay descriptive');
    expect(response.text.toLowerCase()).not.toContain('start trazodone');
  });

  it('returns safe uncertainty for unknown medications', () => {
    const response = answerMedicationReferenceQuestion('what about madeuprazole?');
    expect(response.text).toContain('I do not have a confident medication match');
  });

  it('exposes direct profile access', () => {
    const profile = getMedicationProfile('sertraline');
    expect(profile?.genericName).toBe('sertraline');
  });
});
