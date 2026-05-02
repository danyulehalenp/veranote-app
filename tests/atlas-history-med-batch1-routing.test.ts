import { describe, expect, it } from 'vitest';
import { buildPsychMedicationReferenceHelp } from '@/lib/veranote/assistant-psych-med-knowledge';

function ask(message: string) {
  const response = buildPsychMedicationReferenceHelp(message);
  expect(response?.answerMode).toBe('medication_reference_answer');
  return response?.message ?? '';
}

describe('Atlas history med repair batch 1 routing', () => {
  it('routes oral antipsychotic to LAI prompts into product-specific LAI framework', () => {
    const answer = ask('How should oral haloperidol be converted to haloperidol decanoate, including injection dose and oral overlap?');

    expect(answer).toContain('Oral-to-LAI framework');
    expect(answer).toContain('Haloperidol decanoate conversion is based on the current oral daily dose');
    expect(answer).toMatch(/oral overlap/i);
    expect(answer).toContain('not a patient-specific order');
    expect(answer).not.toMatch(/\bstart haloperidol\b/i);
  });

  it('routes blood alcohol transfer prompts into urgent tox safety framing', () => {
    const answer = ask('What blood alcohol level is acceptable before transfer to inpatient psychiatry?');

    expect(answer).toContain('Urgent safety / tox-withdrawal framework');
    expect(answer).toContain('Clinical sobriety and medical stability');
    expect(answer).toContain('facility policy');
    expect(answer).toContain('Do not provide a universal transfer threshold');
  });

  it('routes general A1c questions into clinical lab reference framing', () => {
    const answer = ask('What does hemoglobin A1c of 5.9 indicate?');

    expect(answer).toContain('Clinical lab reference framework');
    expect(answer).toContain('A1c 5.9 is in the prediabetes range');
    expect(answer).toContain('Interpret labs in clinical context and trend values');
    expect(answer).toContain('Avoid diagnosing from a single isolated lab value');
  });

  it('routes SIADH workup into general lab framework instead of psych-med fallback', () => {
    const answer = ask('What labs should be ordered to evaluate SIADH?');

    expect(answer).toContain('serum sodium and serum osmolality');
    expect(answer).toContain('urine osmolality and urine sodium');
    expect(answer).toContain('Rule out thyroid, adrenal, renal, medication, pulmonary/CNS');
  });

  it('routes QTc combinations into interaction safety with mechanism and monitoring', () => {
    const answer = ask('Can ziprasidone and chlorpromazine be taken together?');

    expect(answer).toContain('Interaction safety framework');
    expect(answer).toContain('additive QTc prolongation risk');
    expect(answer).toContain('ECG and electrolyte context');
    expect(answer).toContain('current drug-interaction reference');
  });

  it('routes samidorphan with buprenorphine into opioid-antagonist interaction safety', () => {
    const answer = ask('Can olanzapine/samidorphan precipitate opioid withdrawal in a patient taking buprenorphine/naloxone?');

    expect(answer).toContain('Samidorphan is an opioid antagonist');
    expect(answer).toContain('precipitated opioid withdrawal');
    expect(answer).toContain('opioid overdose');
  });

  it('keeps sparse withdrawal shorthand in cautious missing-context fallback', () => {
    const answer = ask('Withdrawal history?');

    expect(answer).toContain('I do not have a confident medication match');
    expect(answer).toContain('Clarify the substance or medication involved');
    expect(answer).toContain('delirium tremens');
    expect(answer).toContain('Ask targeted follow-up questions');
  });

  it('keeps ANC calculation shorthand from fabricating a value', () => {
    const answer = ask('Now, what is the ANC?');

    expect(answer).toContain('required lab inputs are missing');
    expect(answer).toContain('requires WBC and neutrophil percentage');
    expect(answer).toContain('Avoid fabricating a value');
  });
});
