import { describe, expect, it } from 'vitest';
import { buildPsychMedicationReferenceHelp } from '@/lib/veranote/assistant-psych-med-knowledge';

describe('assistant psych medication knowledge', () => {
  it('answers medication overview questions for common psych meds', () => {
    const response = buildPsychMedicationReferenceHelp('what is sertraline?');

    expect(response?.message).toContain('sertraline is an antidepressant');
    expect(response?.references?.[0]?.url).toContain('medlineplus.gov');
  });

  it('answers medication side-effect questions', () => {
    const response = buildPsychMedicationReferenceHelp('what are the side effects of olanzapine?');

    expect(response?.message).toContain('common concerns include');
    expect(response?.message).toContain('weight gain');
  });

  it('answers medication monitoring questions', () => {
    const response = buildPsychMedicationReferenceHelp('what monitoring do i need for lithium?');

    expect(response?.message).toContain('serum lithium level');
    expect(response?.message).toContain('renal function');
  });

  it('answers switching questions as medication-reference framework help', () => {
    const response = buildPsychMedicationReferenceHelp('how do I cross taper sertraline to venlafaxine');

    expect(response?.answerMode).toBe('medication_reference_answer');
    expect(response?.message).toContain('current dose');
    expect(response?.message).toContain('cautious cross-taper');
    expect(response?.message).toContain('This is a provider-review switching framework, not a patient-specific order. Verify with current prescribing references, interaction checking, and patient-specific factors.');
    expect(response?.message).not.toContain('Likely strategy:');
    expect(response?.message).not.toContain('Provider-review framework:');
  });

  it('keeps medication-documentation prompts in chart-ready wording rather than switching/reference mode', () => {
    const response = buildPsychMedicationReferenceHelp('how to document med nonadherence without sounding punitive');

    expect(response?.answerMode).toBe('chart_ready_wording');
    expect(response?.message).toContain('avoid punitive labels');
    expect(response?.message).not.toContain('Likely strategy:');
  });

  it('keeps loose switching phrasing in the medication switching framework lane', () => {
    const response = buildPsychMedicationReferenceHelp('pt on paxil wants lexapro how switch');

    expect(response?.answerMode).toBe('medication_reference_answer');
    expect(response?.message).toContain('current dose');
    expect(response?.message).toContain('Paroxetine can have more discontinuation burden');
    expect(response?.message).toContain('provider-review switching framework');
    expect(response?.message).not.toContain('Likely strategy:');
    expect(response?.message).not.toContain('fromMedication');
  });

  it('does not hijack non-medication clinical narratives that include not-documented language', () => {
    const response = buildPsychMedicationReferenceHelp(
      'Patient reports new stress after a breakup and has been anxious and tearful. Exact duration is not documented.',
    );

    expect(response).toBeNull();
  });

  it('does not hijack unknown gas-station substance narratives into medication-reference fallback', () => {
    const response = buildPsychMedicationReferenceHelp(
      'Patient used an unknown gas-station drug that made them confused and sweaty. Product name is unknown.',
    );

    expect(response).toBeNull();
  });
});
