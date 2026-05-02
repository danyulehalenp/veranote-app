import { describe, expect, it } from 'vitest';
import { buildGeneralKnowledgeHelp } from '@/lib/veranote/assistant-knowledge';
import { buildPsychMedicationReferenceHelp } from '@/lib/veranote/assistant-psych-med-knowledge';

describe('assistant medication knowledge', () => {
  it('answers broad depression medication questions with medication guidance rather than diagnosis framing', () => {
    const response = buildGeneralKnowledgeHelp('what types of drugs help with depression?');

    expect(response?.message).toContain('Antidepressants for depression commonly include SSRIs, SNRIs, bupropion, mirtazapine, trazodone, TCAs, and MAOIs');
    expect(response?.message).not.toContain('When providers say depression broadly');
  });

  it('answers SSRI questions as medication-class help', () => {
    const response = buildPsychMedicationReferenceHelp('what is an ssri?');

    expect(response?.message).toContain('SSRIs are antidepressants commonly used for depression, anxiety disorders, OCD, PTSD, and related conditions.');
    expect(response?.message).toContain('sertraline');
  });

  it('answers Zoloft questions with the sertraline medication profile', () => {
    const response = buildGeneralKnowledgeHelp('what is zoloft?');

    expect(response?.message).toContain('sertraline is an antidepressant');
    expect(response?.message).not.toContain('Eating disorder involving restriction');
  });

  it('answers Trileptal starting-dose questions cautiously as medication reference help', () => {
    const response = buildGeneralKnowledgeHelp('what is starting dose of Trileptal daily for an adult?');

    expect(response?.message).toContain('150-300 mg twice daily');
    expect(response?.message).toContain('Dosing depends on indication, patient factors, interactions, and current prescribing references.');
    expect(response?.message).toContain('Verify with a current prescribing reference');
    expect(response?.answerMode).toBe('medication_reference_answer');
  });

  it('keeps generic lithium therapeutic-level questions in concise reference mode', () => {
    const response = buildPsychMedicationReferenceHelp('what are normal therapeutic levels of lithium for a patient');

    expect(response?.answerMode).toBe('medication_reference_answer');
    expect(response?.message).toContain('Typical lithium therapeutic levels:');
    expect(response?.message).toContain('Maintenance: 0.6-1.0 mEq/L');
    expect(response?.message).toContain('Acute mania: 0.8-1.2 mEq/L');
    expect(response?.message).not.toContain('Follow-up:');
    expect(response?.message).not.toContain('Key context:');
  });

  it('answers formulation and strength lookups without falling back to generic class help', () => {
    const celexa = buildGeneralKnowledgeHelp('what mg does Celexa come in');
    expect(celexa?.message).toContain('citalopram/Celexa');
    expect(celexa?.message).toContain('10 mg');
    expect(celexa?.message).toContain('40 mg');
    expect(celexa?.message).toContain('verify with a current prescribing reference or pharmacy');
    expect(celexa?.message).not.toContain('Dosing depends on indication, patient factors, and safety considerations');
    expect(celexa?.message).not.toContain('If you would like');
    expect(celexa?.answerMode).toBe('medication_reference_answer');

    const celexaVariant = buildGeneralKnowledgeHelp('what mg doses is celexa availabe in?');
    expect(celexaVariant?.message).toContain('citalopram/Celexa');
    expect(celexaVariant?.message).toContain('10 mg');
    expect(celexaVariant?.message).not.toContain('citalopram is an antidepressant');

    const zoloft = buildPsychMedicationReferenceHelp('available doses of Zoloft');
    expect(zoloft?.message).toContain('25 mg');
    expect(zoloft?.message).toContain('100 mg');

    const abilify = buildPsychMedicationReferenceHelp('what strengths does Abilify come in');
    expect(abilify?.message).toContain('2 mg');
    expect(abilify?.message).toContain('30 mg');

    const lithium = buildPsychMedicationReferenceHelp('what forms does lithium come in');
    expect(lithium?.message).toContain('capsule');
    expect(lithium?.message).toContain('oral solution');

    const depakote = buildPsychMedicationReferenceHelp('tablet strengths for Depakote');
    expect(depakote?.message).toContain('125 mg');
    expect(depakote?.message).toContain('500 mg');
  });

  it('answers high-confidence formulation questions for common psych meds', () => {
    const lamotrigine = buildGeneralKnowledgeHelp('What mg formulations does lamotrigine come in?');
    expect(lamotrigine?.message).toContain('lamotrigine');
    expect(lamotrigine?.message).toContain('25 mg');
    expect(lamotrigine?.message).toContain('100 mg');
    expect(lamotrigine?.message).toContain('150 mg');
    expect(lamotrigine?.message).toContain('200 mg');
    expect(lamotrigine?.message).toContain('chewable/dispersible tablet');
    expect(lamotrigine?.message).toContain('orally disintegrating tablet');
    expect(lamotrigine?.message).toContain('verify with a current prescribing reference or pharmacy');
    expect(lamotrigine?.message).not.toContain('Exact strengths and formulations can vary by manufacturer or product.');
    expect(lamotrigine?.message).not.toContain('Dosing depends on indication, patient factors, and safety considerations');
    expect(lamotrigine?.message).not.toContain('If you would like');
    expect(lamotrigine?.answerMode).toBe('medication_reference_answer');

    const sertraline = buildPsychMedicationReferenceHelp('What mg formulations does sertraline come in?');
    expect(sertraline?.message).toContain('25 mg');
    expect(sertraline?.message).toContain('50 mg');
    expect(sertraline?.message).toContain('100 mg');

    const quetiapine = buildPsychMedicationReferenceHelp('What strengths does quetiapine come in?');
    expect(quetiapine?.message).toContain('25 mg');
    expect(quetiapine?.message).toContain('400 mg');
    expect(quetiapine?.message).toContain('extended-release tablet');

    const lithium = buildPsychMedicationReferenceHelp('What forms does lithium come in?');
    expect(lithium?.message).toContain('capsule');
    expect(lithium?.message).toContain('extended-release tablet');
    expect(lithium?.message).toContain('oral solution');

    const buspirone = buildPsychMedicationReferenceHelp('What strengths does buspirone come in?');
    expect(buspirone?.message).toContain('buspirone/Buspar');
    expect(buspirone?.message).toContain('5 mg');
    expect(buspirone?.message).toContain('30 mg');
    expect(buspirone?.message).toContain('verify with a current prescribing reference');
  });

  it('answers adult sleep recommendation questions directly', () => {
    const response = buildGeneralKnowledgeHelp('How many hours of sleep is recommended for an adult?');

    expect(response?.message).toContain('at least 7 hours');
    expect(response?.message).toContain('7 to 9 hours');
    expect(response?.answerMode).toBe('general_health_reference');
  });

  it('answers antidepressant generics starting with d directly', () => {
    const response = buildPsychMedicationReferenceHelp('What antidepressant generic starts with a d?');

    expect(response?.message).toContain('duloxetine');
    expect(response?.message).toContain('desvenlafaxine');
    expect(response?.message).toContain('doxepin');
    expect(response?.message).toContain('dextromethorphan-bupropion');
    expect(response?.answerMode).toBe('medication_reference_answer');
  });

  it('answers Zoloft and trazodone interaction questions with interaction caveats', () => {
    const response = buildPsychMedicationReferenceHelp('Zoloft and trazodone together concern?');

    expect(response?.message).toContain('serotonin syndrome risk');
    expect(response?.message).toContain('This should be verified against a current drug-interaction reference.');
    expect(response?.answerMode).toBe('medication_reference_answer');
  });

  it('keeps the medication identity across a pronoun follow-up', () => {
    const response = buildPsychMedicationReferenceHelp('is it an antidepressant?', [
      { role: 'provider', content: 'what is Lamictal used for?' },
      { role: 'assistant', content: 'lamotrigine is a mood stabilizer / anticonvulsant.' },
    ]);

    expect(response?.message.toLowerCase()).toContain('lamotrigine');
    expect(response?.message.toLowerCase()).toContain('mood stabilizer');
    expect(response?.message).not.toContain('Antidepressants for depression commonly include SSRIs');
  });

  it('answers Depakote monitoring questions without patient-specific order language', () => {
    const response = buildPsychMedicationReferenceHelp('what labs for Depakote?');

    expect(response?.message).toContain('high-yield monitoring includes');
    expect(response?.message).toContain('current prescribing reference');
    expect(response?.message.toLowerCase()).not.toContain('you should order');
  });

  it('returns safe uncertainty for unknown medications', () => {
    const response = buildPsychMedicationReferenceHelp('what is starting dose of madeupzine?');

    expect(response?.message).toContain('I do not have a confident medication match');
    expect(response?.answerMode).toBe('medication_reference_answer');
  });

  it('routes switching questions through the general knowledge layer as medication reference help', () => {
    const response = buildGeneralKnowledgeHelp('switch Prozac to Zoloft');

    expect(response?.answerMode).toBe('medication_reference_answer');
    expect(response?.message).toContain('current dose');
    expect(response?.message).toContain('provider-review switching framework');
    expect(response?.message).not.toContain('Likely strategy:');
    expect(response?.message).not.toContain('fromMedication');
  });
});
