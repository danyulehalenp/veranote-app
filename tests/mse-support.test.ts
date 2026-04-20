import { describe, expect, it } from 'vitest';
import { summarizeMseSupport } from '@/lib/ai/mse-support';

describe('summarizeMseSupport', () => {
  it('returns null for non-psych notes', () => {
    const result = summarizeMseSupport({
      noteType: 'General medical follow-up / SOAP',
      sourceInput: 'BP today 168/102. Headaches better overall.',
      sourceSections: {
        clinicianNotes: 'Follow-up for blood pressure and headaches.',
        intakeCollateral: '',
        patientTranscript: '',
        objectiveData: 'BP today: 168/102.',
      },
    });

    expect(result).toBeNull();
  });

  it('requires MSE and marks limited support for sparse psych input', () => {
    const result = summarizeMseSupport({
      noteType: 'Psychiatry follow-up',
      sourceInput: 'Brief med check. "About the same." Needs refill.',
      sourceSections: {
        clinicianNotes: 'Brief med check. Needs refill.',
        intakeCollateral: '',
        patientTranscript: '"About the same."',
        objectiveData: 'Medication list: lamotrigine 100 mg daily.',
      },
    });

    expect(result).not.toBeNull();
    expect(result?.required).toBe(true);
    expect(result?.limited).toBe(true);
    expect(result?.guidanceLines.join(' ')).toContain('Mental Status / Observations section is required');
    expect(result?.suggestedFlag).toBeTruthy();
  });

  it('detects supported MSE domains from multiple psych source sections', () => {
    const result = summarizeMseSupport({
      noteType: 'Inpatient psych progress note',
      sourceInput: 'Patient calmer today, still guarded with staff, denies AH today. Nursing overnight note says patient appeared internally preoccupied.',
      sourceSections: {
        clinicianNotes: 'Patient calmer today. Still guarded with staff. Denies AH today.',
        intakeCollateral: '',
        patientTranscript: '"I\'m a little calmer today."',
        objectiveData: 'Nursing note: patient appeared internally preoccupied overnight.',
      },
    });

    expect(result).not.toBeNull();
    expect(result?.supportedDomains).toContain('behavior');
    expect(result?.supportedDomains).toContain('mood');
    expect(result?.supportedDomains).toContain('perception');
    expect(result?.evidence.length).toBeGreaterThan(0);
  });

  it('marks perception conflict when patient denial and observed internal preoccupation both exist', () => {
    const result = summarizeMseSupport({
      noteType: 'Psychiatry follow-up',
      sourceInput: 'Patient denies hallucinations. Nursing note says patient laughing to self and internally preoccupied.',
      sourceSections: {
        clinicianNotes: 'Patient denies hallucinations.',
        intakeCollateral: '',
        patientTranscript: '"No, I am not hearing voices."',
        objectiveData: 'Nursing note: laughing to self, appeared internally preoccupied.',
      },
    });

    expect(result).not.toBeNull();
    expect(result?.conflictingDomains).toContain('perception');
    expect(result?.guidanceLines.join(' ')).toContain('Preserve patient denial and conflicting observation side by side');
  });

  it('suggests missing-MSE flag when no MSE domains are supported', () => {
    const result = summarizeMseSupport({
      noteType: 'Psychiatry follow-up',
      sourceInput: 'Needs refill. Follow up in 4 weeks.',
      sourceSections: {
        clinicianNotes: 'Needs refill. Follow up in 4 weeks.',
        intakeCollateral: '',
        patientTranscript: '',
        objectiveData: 'Medication list reviewed.',
      },
    });

    expect(result).not.toBeNull();
    expect(result?.supportedDomains).toHaveLength(0);
    expect(result?.suggestedFlag).toBe('MSE not documented beyond limited interview content.');
  });
});
