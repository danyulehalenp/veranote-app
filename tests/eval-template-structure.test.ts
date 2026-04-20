import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function promptText(fileName: string) {
  return readFileSync(path.join(process.cwd(), 'prompts', fileName), 'utf8');
}

describe('psych eval prompt templates', () => {
  it('adult initial eval template includes richer adult eval sections', () => {
    const text = promptText('inpatient-psych-initial-adult-eval.md');

    expect(text).toContain('Family Psychiatric / Relevant Family History');
    expect(text).toContain('Trauma / Abuse History');
    expect(text).toContain('Legal History');
    expect(text).toContain('Justification of Hospitalization');
    expect(text).toContain('Clinical Status / Complexity');
  });

  it('adolescent initial eval template includes adolescent-specific structure', () => {
    const text = promptText('inpatient-psych-initial-adolescent-eval.md');

    expect(text).toContain('Guardian / Family / Collateral');
    expect(text).toContain('Developmental / Educational History');
    expect(text).toContain('Legal / Custody History');
    expect(text).toContain('Justification of Hospitalization');
  });
});
