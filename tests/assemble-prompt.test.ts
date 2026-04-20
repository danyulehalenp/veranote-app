import { describe, expect, it } from 'vitest';
import { assemblePrompt } from '@/lib/ai/assemble-prompt';

describe('assemblePrompt', () => {
  const baseInput = {
    templatePrompt: 'Template prompt here',
    stylePrompt: 'Style prompt here',
    specialty: 'Psychiatry',
    noteType: 'Psychiatry follow-up',
    outputStyle: 'Standard',
    format: 'Labeled Sections',
    keepCloserToSource: true,
    flagMissingInfo: true,
    sourceInput: 'Follow-up for anxiety. About the same. Denies SI/HI.',
  };

  it('includes provider-specific saved preferences when supplied', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      customInstructions: 'In WellSky, only generate HPI and keep psych observations inside HPI.',
    });

    expect(prompt).toContain('Provider-specific saved preferences:');
    expect(prompt).toContain('only generate HPI');
  });

  it('includes psych MSE requirements when supplied', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      mseGuidanceLines: [
        'Output scope: full-note.',
        'A standalone Mental Status / Observations section is required for this output scope.',
      ],
    });

    expect(prompt).toContain('Psych MSE requirements:');
    expect(prompt).toContain('standalone Mental Status / Observations section is required');
  });

  it('omits provider preferences block when no custom instructions are provided', () => {
    const prompt = assemblePrompt(baseInput);
    expect(prompt).not.toContain('Provider-specific saved preferences:');
  });

  it('preserves scope guidance that says not to force standalone MSE in HPI-only mode', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      mseGuidanceLines: [
        'Output scope: hpi-only.',
        'Do not force a standalone Mental Status / Observations section for this output scope. If pertinent psych observations belong in HPI/assessment, include them there without inventing a full MSE block.',
      ],
    });

    expect(prompt).toContain('Output scope: hpi-only.');
    expect(prompt).toContain('Do not force a standalone Mental Status / Observations section');
  });

  it('adds anti-adjudication wording for unresolved substance conflicts', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      sourceInput: `### Clinician note
- Patient denies recent cocaine use.

### Transcript
- "I didn't use anything."
- Girlfriend: "You were up for two days and using."

### Objective data
- Urine drug screen positive for cocaine.`,
    });

    expect(prompt).toContain('the denial exists, collateral concern exists, and the conflict remains unresolved');
    expect(prompt).toContain('Do not use conflict-softening rhetoric');
  });

  it('adds refill-only restraint when source documents a refill need without completion', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      sourceInput: `### Clinician note
- Needs refill of lamotrigine.

### Objective data
- Medication list: lamotrigine 100 mg daily.
- Refill status not documented.`,
    });

    expect(prompt).toContain('document only the refill request');
    expect(prompt).toContain('A refill request alone does not prove the refill was sent');
  });

  it('tightens literal handling for sparse "about the same" status language', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      sourceInput: `### Clinician note
- Brief med check.
- Needs refill of lamotrigine.
- Mood "about the same."

### Transcript
- "Otherwise things are about the same."`,
    });

    expect(prompt).toContain('preserve the patient-shaped wording as literally as possible');
    expect(prompt).toContain('do not justify adding "stable," "unchanged," "no new symptoms,"');
  });

  it('makes medication-conflict guidance explicitly source-attributed', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      sourceInput: `### Clinician note
- Last visit plan was to increase sertraline to 100 mg daily.
- Patient says she has actually kept taking 50 mg because she was nervous about increasing.

### Objective data
- Medication list shows sertraline 100 mg daily.
- Pharmacy refill history not reviewed today.`,
    });

    expect(prompt).toContain('prior plan/chart med list says one thing while the patient reports another');
    expect(prompt).toContain('the current documentation does not resolve the actual regimen today');
    expect(prompt).toContain('a prior plan or chart list says one dose, the patient reports still taking another dose');
  });

  it('treats incomplete structured medication profiles as an uncertainty guardrail', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      sourceInput: `### Clinician note
- Patient thinks she is taking lithium at night but forgot bottle.
- Chart still lists lithium 300 mg BID.`,
      medicationProfileLines: [
        'Medication/profile label: Lithium | status: current | normalized medication match: lithium',
      ],
    });

    expect(prompt).toContain('If dose, schedule, route, or the normalized medication name remains incomplete or uncertain in that profile');
    expect(prompt).toContain('keep the regimen wording incomplete or uncertain in the draft rather than guessing the missing detail');
    expect(prompt).toContain('If the structured medication profile itself is incomplete, do not use cleaner prose to fill the missing dose, schedule, route, or exact active regimen.');
  });

  it('keeps diagnosis framing conservative when structured diagnosis guidance is present', () => {
    const prompt = assemblePrompt({
      ...baseInput,
      sourceInput: `### Clinician note
- Outside records list bipolar disorder but current evaluation is still exploring trauma-related disorder versus depressive disorder.`,
      diagnosisProfileLines: [
        'Diagnosis/profile label: Bipolar disorder | status: historical | certainty: unclear',
        'Diagnosis/profile label: Trauma-related disorder | status: differential | certainty: possible',
      ],
    });

    expect(prompt).toContain('If an entry is marked historical, rule-out, differential, or symptom-level, do not upgrade it into a current confirmed diagnosis');
    expect(prompt).toContain('If diagnosis profile evidence or timeframe notes are sparse, keep Assessment conservative');
    expect(prompt).toContain('Do not promote historical, rule-out, differential, or symptom-level formulations into current confirmed diagnoses unless the source explicitly supports that promotion.');
  });

});
