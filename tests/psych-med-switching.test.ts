import { describe, expect, it } from 'vitest';
import {
  answerPsychMedicationSwitchQuestion,
  detectPsychMedicationSwitchingIntent,
  getPsychMedicationSwitchRules,
  getPsychMedicationSwitchStrategies,
  getPsychMedicationSwitchingCaveat,
} from '@/lib/veranote/meds/psych-med-switching';

describe('psych med switching layer', () => {
  function expectProviderFacingSwitchAnswer(text = '') {
    expect(text).toContain('current dose');
    expect(text).toContain(getPsychMedicationSwitchingCaveat());
    expect(text).not.toContain('fromMedication');
    expect(text).not.toContain('toMedication');
    expect(text).not.toContain('Likely strategy:');
    expect(text).not.toContain('High-risk switch considerations:');
    expect(text).not.toContain('Provider-review framework:');
    expect(text.toLowerCase()).not.toContain('you should start');
  }

  it('defines the expected switching strategy types', () => {
    const strategyIds = getPsychMedicationSwitchStrategies().map((strategy) => strategy.id);

    expect(strategyIds).toEqual(expect.arrayContaining([
      'direct_switch',
      'taper_then_switch',
      'cross_taper',
      'taper_washout_switch',
      'washout_required',
      'overlap_bridge',
      'oral_to_lai_transition',
      'taper_only',
      'specialist_reference_required',
      'avoid_cross_taper',
    ]));
  });

  it('defines the expected high-risk switch rules', () => {
    const ruleIds = getPsychMedicationSwitchRules().map((rule) => rule.id);

    expect(ruleIds).toEqual(expect.arrayContaining([
      'maoi_switch',
      'fluoxetine_long_half_life',
      'paroxetine_venlafaxine_discontinuation',
      'clomipramine_tca_serotonergic_switch',
      'antidepressant_general_switch',
      'antipsychotic_switch',
      'oral_to_lai',
      'lithium_transition',
      'valproate_lamotrigine_transition',
      'carbamazepine_transition',
      'benzodiazepine_taper',
      'stimulant_switch_or_restart',
      'sedative_hypnotic_switch',
    ]));
  });

  it('detects switching intent in representative prompts', () => {
    expect(detectPsychMedicationSwitchingIntent('how do I cross taper sertraline to venlafaxine')).toBe(true);
    expect(detectPsychMedicationSwitchingIntent('switch Prozac to Zoloft')).toBe(true);
    expect(detectPsychMedicationSwitchingIntent('xanax taper pls')).toBe(true);
  });

  it('answers sertraline to venlafaxine as a provider-review cross-taper framework', () => {
    const response = answerPsychMedicationSwitchQuestion('how do I cross taper sertraline to venlafaxine');

    expect(response?.intent).toBe('switching_framework');
    expect(response?.fromMedication?.id).toBe('sertraline');
    expect(response?.toMedication?.id).toBe('venlafaxine');
    expect(response?.switchStrategy?.id).toBe('cross_taper');
    expect(response?.text).toContain('cautious cross-taper may be considered');
    expectProviderFacingSwitchAnswer(response?.text);
  });

  it('flags fluoxetine to sertraline as needing extra caution because of the long half-life tail', () => {
    const response = answerPsychMedicationSwitchQuestion('switch Prozac to Zoloft');

    expect(response?.fromMedication?.id).toBe('fluoxetine');
    expect(response?.toMedication?.id).toBe('sertraline');
    expect(response?.switchRuleIds).toContain('fluoxetine_long_half_life');
    expect(response?.text).toContain('Fluoxetine has a long half-life');
    expectProviderFacingSwitchAnswer(response?.text);
  });

  it('treats phenelzine to sertraline as a washout-required high-risk switch', () => {
    const response = answerPsychMedicationSwitchQuestion('phenelzine to sertraline');

    expect(response?.switchStrategy?.id).toBe('washout_required');
    expect(response?.switchRuleIds).toContain('maoi_switch');
    expect(response?.text).toContain('Do not treat this as a routine cross-taper');
    expect(response?.text).toContain('washout and current-reference guidance are required');
    expectProviderFacingSwitchAnswer(response?.text);
  });

  it('treats valproate to lamotrigine as a specialist-reference-required transition', () => {
    const response = answerPsychMedicationSwitchQuestion('depakote to lamictal safe?');

    expect(response?.fromMedication?.id).toBe('divalproex');
    expect(response?.toMedication?.id).toBe('lamotrigine');
    expect(response?.switchRuleIds).toContain('valproate_lamotrigine_transition');
    expect(response?.text).toContain('valproate changes lamotrigine exposure and rash risk');
    expectProviderFacingSwitchAnswer(response?.text);
  });

  it('treats risperidone oral to LAI as a product-specific LAI transition', () => {
    const response = answerPsychMedicationSwitchQuestion('risperdal po to consta');

    expect(response?.switchStrategy?.id).toBe('oral_to_lai_transition');
    expect(response?.switchRuleIds).toContain('oral_to_lai');
    expect(response?.text).toContain('product-specific labeling');
    expect(response?.text).toContain('oral overlap');
    expectProviderFacingSwitchAnswer(response?.text);
  });

  it('treats alprazolam taper requests as individualized taper-only frameworks', () => {
    const response = answerPsychMedicationSwitchQuestion('xanax taper pls');

    expect(response?.fromMedication?.id).toBe('alprazolam');
    expect(response?.switchStrategy?.id).toBe('taper_only');
    expect(response?.switchRuleIds).toContain('benzodiazepine_taper');
    expect(response?.text).toContain('avoid abrupt discontinuation');
    expect(response?.text).toContain('withdrawal and seizure risk');
    expectProviderFacingSwitchAnswer(response?.text);
  });

  it('recognizes stop ambien start trazodone as a switching framework', () => {
    const response = answerPsychMedicationSwitchQuestion('stop ambien start trazodone');

    expect(response?.fromMedication?.id).toBe('zolpidem');
    expect(response?.toMedication?.id).toBe('trazodone');
    expectProviderFacingSwitchAnswer(response?.text);
    expect(response?.text).toContain('rebound insomnia');
  });

  it('recognizes methylphenidate to amphetamine as a stimulant switching framework', () => {
    const response = answerPsychMedicationSwitchQuestion('methylphenidate to amphetamine');

    expect(response?.fromMedication?.id).toBe('methylphenidate');
    expect(response?.toMedication?.id).toBe('mixed_amphetamine_salts');
    expect(response?.switchRuleIds).toContain('stimulant_switch_or_restart');
    expect(response?.text).toContain('mania, psychosis, substance-use risk, cardiovascular history');
    expectProviderFacingSwitchAnswer(response?.text);
  });

  it('recognizes loose patient-on-med switching phrasing for paxil to lexapro', () => {
    const response = answerPsychMedicationSwitchQuestion('pt on paxil wants lexapro how switch');

    expect(response?.fromMedication?.id).toBe('paroxetine');
    expect(response?.toMedication?.id).toBe('escitalopram');
    expect(response?.switchRuleIds).toContain('paroxetine_venlafaxine_discontinuation');
    expect(response?.switchRuleIds).toContain('antidepressant_general_switch');
    expect(response?.text).toContain('Paroxetine can have more discontinuation burden');
    expectProviderFacingSwitchAnswer(response?.text);
  });

  it('answers common provider switching phrasing in a concise external style', () => {
    const prompts = [
      'how do you switch a patient from celexa to paxil?',
      'celexa to paxil switch',
      'pt on celexa wants paxil how switch',
      'prozac to zoloft how switch',
      'phenelzine to sertraline switch',
      'depakote to lamictal cross taper?',
    ];

    for (const prompt of prompts) {
      const response = answerPsychMedicationSwitchQuestion(prompt);
      expect(response?.intent).toBe('switching_framework');
      expectProviderFacingSwitchAnswer(response?.text);
    }

    expect(answerPsychMedicationSwitchQuestion('how do you switch a patient from celexa to paxil?')?.text)
      .toContain('SSRI-to-SSRI switch');
    expect(answerPsychMedicationSwitchQuestion('phenelzine to sertraline switch')?.text)
      .toContain('washout and current-reference guidance are required');
    expect(answerPsychMedicationSwitchQuestion('depakote to lamictal cross taper?')?.text)
      .toContain('rash risk');
  });
});
