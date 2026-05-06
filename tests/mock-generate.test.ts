import { describe, expect, it } from 'vitest';

import { generateMockNote } from '@/lib/ai/mock-generate';
import { buildSourceInputFromSections } from '@/lib/ai/source-sections';

describe('fallback mock note generation', () => {
  it('does not leak Provider Add-On instructions into fallback clinical note text', () => {
    const sourceInput = buildSourceInputFromSections({
      intakeCollateral: 'Nursing note: appeared internally preoccupied overnight and slept 2 hours.',
      clinicianNotes: 'Patient denies AH/VH. Speech soft. No SI/HI voiced.',
      patientTranscript: 'Patient: "No, I am not hearing voices. I just did not sleep."',
      objectiveData: [
        'Provider Add-On:',
        'Do not state confirmed hallucinations or primary psychosis.',
        'Nonclinical QA marker: should-not-copy',
      ].join('\n'),
    });

    const result = generateMockNote(sourceInput, 'Inpatient Psych Progress Note');

    expect(result.note).toContain('appeared internally preoccupied');
    expect(result.note).toContain('Patient denies AH/VH');
    expect(result.note).not.toMatch(/Provider Add-On|confirmed hallucinations|primary psychosis|should-not-copy/i);
    expect(result.note).not.toMatch(/Do not state|Do not add|per provider instruction|provider instructions?/i);
  });

  it('normalizes common rushed clinical misspellings and preserves uncertainty cues in fallback text', () => {
    const sourceInput = buildSourceInputFromSections({
      intakeCollateral: 'Referral packet: Prior diagnoses listed: ADHD, bipolar disorder, PTSD. Prior med list includes Lamictle.',
      clinicianNotes: 'Provider typed fast: depresion better, anxity high, denys si hi. Patient denies current decreased need for sleep.',
      patientTranscript: 'Patient: "They said bipolar before, but I am not sure."',
      objectiveData: 'Provider Add-On: Correct misspellings silently. Do not confirm bipolar disorder.',
    });

    const result = generateMockNote(sourceInput, 'Outpatient Psychiatric Evaluation');

    expect(result.note).toMatch(/depression/i);
    expect(result.note).toMatch(/anxiety/i);
    expect(result.note).toMatch(/denies SI\/HI/i);
    expect(result.note).toMatch(/Lamictal/i);
    expect(result.note).toMatch(/Bipolar disorder.*historical\/reported.*not confirmed/i);
    expect(result.note).not.toMatch(/Provider Add-On|Correct misspellings|Do not confirm/i);
  });
});
