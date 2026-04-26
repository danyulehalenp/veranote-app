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

  it('answers formulation and strength lookups without falling back to generic class help', () => {
    const celexa = buildGeneralKnowledgeHelp('what mg does Celexa come in');
    expect(celexa?.message).toContain('Celexa (citalopram)');
    expect(celexa?.message).toContain('10 mg');
    expect(celexa?.message).toContain('40 mg');
    expect(celexa?.message).toContain('Dosing depends on indication, patient factors, and safety considerations, so verify with a current prescribing reference.');
    expect(celexa?.answerMode).toBe('medication_reference_answer');

    const celexaVariant = buildGeneralKnowledgeHelp('what mg doses is celexa availabe in?');
    expect(celexaVariant?.message).toContain('Celexa (citalopram)');
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
