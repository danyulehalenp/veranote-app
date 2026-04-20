import { describe, expect, it } from 'vitest';
import { buildPsychMedicationReferenceHelp } from '@/lib/veranote/assistant-psych-med-knowledge';

describe('assistant psych medication knowledge', () => {
  it('answers medication overview questions for common psych meds', () => {
    const response = buildPsychMedicationReferenceHelp('what is sertraline?');

    expect(response?.message).toContain('Sertraline is an SSRI');
    expect(response?.references?.[0]?.url).toContain('medlineplus.gov');
  });

  it('answers medication side-effect questions', () => {
    const response = buildPsychMedicationReferenceHelp('what are the side effects of olanzapine?');

    expect(response?.message).toContain('commonly causes');
    expect(response?.message).toContain('weight gain');
  });

  it('answers medication monitoring questions', () => {
    const response = buildPsychMedicationReferenceHelp('what monitoring do i need for lithium?');

    expect(response?.message).toContain('serum lithium levels');
    expect(response?.message).toContain('renal function');
  });
});
