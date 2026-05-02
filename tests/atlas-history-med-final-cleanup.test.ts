import { describe, expect, it } from 'vitest';
import { runAtlasHistoryMedSimulation } from '@/lib/eval/med-reference/run-atlas-history-med-simulation';
import { buildPsychMedicationReferenceHelp } from '@/lib/veranote/assistant-psych-med-knowledge';

function ask(message: string) {
  const response = buildPsychMedicationReferenceHelp(message);
  expect(response?.answerMode).toBe('medication_reference_answer');
  return response?.message ?? '';
}

describe('Atlas history med final cleanup', () => {
  it('answers stable long-term valproate level cadence without a universal fixed interval', () => {
    const answer = ask('During long-term inpatient treatment, how often should valproate levels be checked after levels are stable?');

    expect(answer).toContain('Valproate trough level monitoring');
    expect(answer).toContain('does not have one universal fixed interval');
    expect(answer).toContain('CBC and liver function monitoring');
    expect(answer).toContain('More frequent checks are appropriate after dose changes');
    expect(answer).toContain('adherence concerns');
    expect(answer).toContain('interacting medications');
    expect(answer).toContain('Frame as clinician reference, not a patient-specific order');
    expect(answer).toContain('local protocol');
  });

  it('keeps ANC shorthand as targeted missing-context fallback without fabricating a value', () => {
    const answer = ask('Now, what is the ANC?');

    expect(answer).toContain('required lab inputs are missing');
    expect(answer).toContain('Missing context includes WBC units');
    expect(answer).toContain('formula can be applied only if WBC and differential are provided');
    expect(answer).toContain('Avoid fabricating a value');
    expect(answer).not.toMatch(/\bANC is \d/i);
  });

  it('keeps baclofen shorthand as targeted missing-context fallback without a dose', () => {
    const answer = ask('What about baclofen?');

    expect(answer).toContain('fragment lacks indication and patient context');
    expect(answer).toContain('Missing context includes target symptom');
    expect(answer).toContain('renal function, CNS depressants, withdrawal risk');
    expect(answer).toContain('Ask whether this concerns spasticity, cravings, anxiety, or withdrawal');
    expect(answer).toContain('Do not give a dose from this fragment alone.');
  });

  it('passes all history-derived medication/lab cases and records failure types for any future failure', () => {
    const output = runAtlasHistoryMedSimulation();
    const failedCases = output.cases.filter((item) => !item.passed);

    expect(output.summary.totalCases).toBe(70);
    expect(output.summary.passed).toBe(70);
    expect(output.summary.failed).toBe(0);
    expect(output.summary.unsafeAnswerCount).toBe(0);
    expect(output.summary.overConservativeFallbackCount).toBe(0);
    expect(failedCases.every((item) => item.failureTypes.length > 0)).toBe(true);
  }, 15000);
});
