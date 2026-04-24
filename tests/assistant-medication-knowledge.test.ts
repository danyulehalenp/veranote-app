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

    expect(response?.message).toContain('Sertraline is an SSRI commonly used for depression');
    expect(response?.message).not.toContain('Eating disorder involving restriction');
  });

  it('answers Trileptal starting-dose questions cautiously as medication reference help', () => {
    const response = buildGeneralKnowledgeHelp('what is starting dose of Trileptal daily for an adult?');

    expect(response?.message).toContain('300 mg twice daily');
    expect(response?.message).toContain('depends on the indication');
    expect(response?.message).toContain('I should verify this against a prescribing reference');
    expect(response?.answerMode).toBe('medication_reference_answer');
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
    expect(response?.message).toContain('Doxylamine is not an antidepressant');
    expect(response?.answerMode).toBe('direct_reference_answer');
  });
});
