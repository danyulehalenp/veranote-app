import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'atlas-med-reference-provider',
      role: 'provider',
      email: 'atlas-med-reference@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'atlas-med-reference-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';

async function ask(message: string) {
  const response = await POST(new Request('http://localhost/api/assistant/respond?eval=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      stage: 'review',
      mode: 'workflow-help',
      message,
      context: {
        providerAddressingName: 'Test Provider',
        noteType: 'Medication Reference',
        currentDraftText: '',
      },
      recentMessages: [],
    }),
  }));

  expect(response.status).toBe(200);
  return response.json();
}

function sentenceCount(text: string) {
  return text.match(/[^.!?]+[.!?]+/g)?.length ?? 0;
}

function questionCount(text: string) {
  return text.match(/\?/g)?.length ?? 0;
}

function nonEmptyLineCount(text: string) {
  return text.split('\n').filter((line) => line.trim()).length;
}

describe('assistant structured medication reference routing', () => {
  it('routes Lamictal formulation questions through the structured reference layer', async () => {
    const payload = await ask('What mg formulations does Lamictal come in?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('immediate-release tablets 25 mg, 100 mg, 150 mg, and 200 mg');
    expect(payload.message).toContain('chewable/dispersible tablets / tablets for oral suspension 2 mg, 5 mg, and 25 mg');
    expect(payload.message).toContain('orally disintegrating tablets 25 mg, 50 mg, 100 mg, and 200 mg');
    expect(payload.message).toContain('extended-release / XR tablets 25 mg, 50 mg, 100 mg, 200 mg, 250 mg, and 300 mg');
    expect(payload.message).toContain('verify with a current prescribing reference');
    expect(payload.message).not.toContain("I don't have verified strength/formulation data");
    expect(payload.message).not.toMatch(/\bVera\b/);
  });

  it('keeps unknown formulation questions in the existing safe fallback lane', async () => {
    const payload = await ask('what strengths does madeupzine come in?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('I do not have a confident medication match');
    expect(payload.message).not.toContain('25 mg');
    expect(payload.message).not.toMatch(/\bVera\b/);
  });

  it('does not turn patient-specific Lamictal dosing into a formulation-only answer', async () => {
    const payload = await ask('what dose should I start Lamictal for this patient?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('Dosing depends on indication, patient factors, interactions, and current prescribing references.');
    expect(payload.message).not.toContain('extended-release / XR tablets 25 mg, 50 mg, 100 mg, 200 mg, 250 mg, and 300 mg');
    expect(payload.message).not.toMatch(/\bVera\b/);
  });

  it('answers lithium monitoring from structured reference data', async () => {
    const payload = await ask('what labs for lithium?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('serum lithium level');
    expect(payload.message).toContain('renal function');
    expect(payload.message).toContain('thyroid function');
    expect(payload.message).toContain('current prescribing reference');
    expect(payload.message).not.toMatch(/\bVera\b/);
  });

  it('keeps pure lithium range reference questions short and follow-up free', async () => {
    const referencePrompts = [
      'what are normal lithium levels',
      'what are normal therapeutic levels of lithium',
      'what are normal therapeutic levels of lithium for a patient',
      'lithium therapeutic range for adults',
      'normal lithium level in patients',
      'what level should lithium usually be',
    ];
    const responses = await Promise.all(referencePrompts.map((prompt) => ask(prompt)));

    for (const response of responses) {
      expect(response.answerMode).toBe('medication_reference_answer');
      expect(response.message).toContain('Typical lithium therapeutic levels:');
      expect(response.message).toContain('Maintenance: 0.6-1.0 mEq/L');
      expect(response.message).toContain('Acute mania: 0.8-1.2 mEq/L');
      expect(response.message).not.toContain('Follow-up:');
      expect(response.message).not.toContain('Was this a true trough?');
      expect(response.message).not.toContain('Key context:');
      expect(nonEmptyLineCount(response.message)).toBeLessThanOrEqual(3);
    }
  });

  it('keeps pure formulation reference questions direct and follow-up free', async () => {
    const payload = await ask('What mg does lamotrigine come in?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('immediate-release tablets 25 mg, 100 mg, 150 mg, and 200 mg');
    expect(payload.message).not.toContain('If you would like');
    expect(payload.message).not.toContain('Follow-up:');
  });

  it('keeps routine formulation answers concise while preserving useful reference content', async () => {
    const payload = await ask('What mg does lamotrigine come in?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('immediate-release tablets 25 mg, 100 mg, 150 mg, and 200 mg');
    expect(payload.message).toContain('extended-release / XR tablets 25 mg, 50 mg, 100 mg, 200 mg, 250 mg, and 300 mg');
    expect(payload.message).toContain('verify with a current prescribing reference');
    expect(payload.message).not.toContain('Follow-up:');
    expect(sentenceCount(payload.message)).toBeLessThanOrEqual(6);
  });

  it('does not add context-bridge follow-up to urgent lithium toxicity prompts', async () => {
    const payload = await ask('Lithium level 1.6 and confused');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('This is not routine monitoring');
    expect(payload.message).not.toContain('Follow-up:');
    expect(payload.message).not.toContain('I can help walk through');
    expect(payload.message).not.toContain('If you would like, I can help apply this');
  });

  it('does not add context-bridge follow-up to contextual dose-change prompts', async () => {
    const payload = await ask('Should I increase lithium from 0.4?');
    const lowLevel = await ask('lithium level is low, should I increase');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('Do not make an automatic dose change from one lab value alone');
    expect(payload.message).not.toContain('I can help walk through');
    expect(payload.message).not.toContain('If you would like, I can help apply this');

    expect(lowLevel.answerMode).toBe('medication_reference_answer');
    expect(lowLevel.message).toContain('Do not make an automatic dose change from one lab value alone');
    expect(lowLevel.message).toContain('Follow-up:');
  });

  it('keeps symptomatic lithium prompts in applied safety reasoning', async () => {
    const payload = await ask('patient on lithium has tremor and diarrhea');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('This is not routine monitoring');
    expect(payload.message).toContain('toxicity');
    expect(payload.message).not.toContain('Typical lithium therapeutic levels:');
  });

  it('adds targeted clarification questions to high-uncertainty med/lab answers without over-questioning', async () => {
    const renal = await ask('Creatinine is 1.6. Would lithium be a good choice?');
    const lowLithium = await ask('Lithium level 0.4 what should I do?');
    const qtc = await ask('QTc 520 on Haldol');

    expect(renal.message).toContain('Follow-up:');
    expect(renal.message).toContain('Is this acute or baseline?');
    expect(renal.message).toContain('Do you have the eGFR/CrCl?');
    expect(questionCount(renal.message)).toBeLessThanOrEqual(2);

    expect(lowLithium.message).toContain('Follow-up:');
    expect(lowLithium.message).toContain('Was this a true trough?');
    expect(lowLithium.message).toContain('How is the patient clinically?');
    expect(questionCount(lowLithium.message)).toBeLessThanOrEqual(2);

    expect(qtc.message).toContain('Follow-up:');
    expect(qtc.message).toContain('Do you know potassium, magnesium, and calcium?');
    expect(qtc.message).toContain('Any syncope, palpitations, or chest pain?');
    expect(questionCount(qtc.message)).toBeLessThanOrEqual(2);
  });

  it('keeps pure QTc range reference questions short and follow-up free', async () => {
    const payload = await ask('QTc normal range');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('Typical QTc reference context:');
    expect(payload.message).toContain('Common upper limit: about 450 ms in men and about 460 ms in women');
    expect(payload.message).toContain('QTc around or above 500 ms is generally high-risk');
    expect(payload.message).not.toContain('Follow-up:');
    expect(payload.message).not.toContain('If you have the actual QTc value');
    expect(sentenceCount(payload.message)).toBeLessThanOrEqual(3);
  });

  it('keeps pure valproate therapeutic range questions short and follow-up free', async () => {
    const payload = await ask('valproate therapeutic range');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('Typical valproate/divalproex total-level reference:');
    expect(payload.message).toContain('50-100 mcg/mL');
    expect(payload.message).toContain('up to 125 mcg/mL');
    expect(payload.message).not.toContain('Follow-up:');
    expect(payload.message).not.toContain('Do you know the timing of draw?');
    expect(sentenceCount(payload.message)).toBeLessThanOrEqual(3);
  });

  it('answers basic class/use questions without entering documentation mode', async () => {
    const payload = await ask('what is quetiapine used for?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('quetiapine is an antipsychotic');
    expect(payload.message).toContain('schizophrenia');
    expect(payload.message).toContain('not a patient-specific treatment recommendation');
    expect(payload.message).not.toMatch(/\bVera\b/);
  });

  it('routes trazodone overdose to urgent safety framing instead of a generic profile', async () => {
    const payload = await ask('patient overdosed on trazodone what do I do');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('urgent clinical evaluation');
    expect(payload.message).toContain('poison control');
    expect(payload.message).toContain('Do not provide home-management instructions');
    expect(payload.message).not.toContain('trazodone is an antidepressant');
  });

  it('routes lithium toxicity symptoms to urgent toxicity framing', async () => {
    const payload = await ask('lithium toxicity symptoms');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('GI upset');
    expect(payload.message).toContain('tremor');
    expect(payload.message).toContain('confusion');
    expect(payload.message).toContain('ataxia');
    expect(payload.message).toContain('seizures or arrhythmia');
    expect(payload.message).toContain('urgent clinical situation');
  });

  it('warns against abrupt lorazepam discontinuation', async () => {
    const payload = await ask('can I stop lorazepam abruptly');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('Abrupt benzodiazepine discontinuation');
    expect(payload.message).toContain('withdrawal');
    expect(payload.message).toContain('seizures');
    expect(payload.message).toContain('prescriber-supervised taper');
    expect(payload.message).not.toContain('lorazepam is an anxiolytic');
  });

  it('flags sertraline plus linezolid as a high-risk interaction', async () => {
    const payload = await ask('sertraline plus linezolid');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('serotonin syndrome');
    expect(payload.message).toContain('linezolid');
    expect(payload.message).toContain('This should be verified against a current drug-interaction reference.');
    expect(payload.message).not.toContain('sertraline is an antidepressant');
  });

  it('flags IM olanzapine plus benzodiazepine concerns', async () => {
    const payload = await ask('olanzapine plus benzo IM concern');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('additive sedation');
    expect(payload.message).toContain('respiratory/CNS depression');
    expect(payload.message).toContain('local protocol');
    expect(payload.message).toContain('This should be verified against a current drug-interaction reference.');
  });

  it('routes pregnancy and breastfeeding variants to special-population caution', async () => {
    const pregnancy = await ask('sertraline pregnancy');
    const breastfeeding = await ask('Zoloft breastfeeding');

    for (const payload of [pregnancy, breastfeeding]) {
      expect(payload.answerMode).toBe('medication_reference_answer');
      expect(payload.message).toContain('pregnancy/lactation issues should be verified with current references');
      expect(payload.message).toContain('Do not use this layer alone for pregnancy or lactation prescribing decisions.');
      expect(payload.message).not.toContain('high-yield monitoring includes');
    }
  });

  it('does not confuse max-dose questions with starting-dose answers', async () => {
    const payload = await ask('max dose lithium');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('typical adult range');
    expect(payload.message).toContain('Dosing depends on indication, patient factors, interactions, and current prescribing references.');
    expect(payload.message).not.toContain('typical adult starting dose');
  });

  it('routes risperidone-to-aripiprazole switches as oral antipsychotic switches unless LAI is explicit', async () => {
    const payload = await ask('switch risperidone to aripiprazole');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('antipsychotic-to-antipsychotic switch');
    expect(payload.message).toContain('provider-review switching framework');
    expect(payload.message).not.toContain('Oral-to-LAI');
    expect(payload.message).not.toContain('long-acting injectable antipsychotic switch');
  });

  it('routes clozapine low ANC to high-risk REMS/current-labeling caution', async () => {
    const payload = await ask('clozapine low ANC what do I do');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('high-risk clozapine safety issue');
    expect(payload.message).toContain('current prescribing information');
    expect(payload.message).toContain('REMS requirements have changed');
    expect(payload.message).toContain('local protocol');
    expect(payload.message).not.toContain('high-yield monitoring includes');
  });

  it('keeps Lamictal plus valproate dosing patient-specific and product-specific', async () => {
    const payload = await ask('what is the dose for this patient on lamictal and valproate');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('Valproate can increase lamotrigine exposure');
    expect(payload.message).toContain('Dosing depends on indication, patient factors, interactions, and current prescribing references.');
    expect(payload.message).toContain('This should be verified against a current drug-interaction reference.');
    expect(payload.message).not.toContain('a typical adult starting dose');
  });

  it('interprets low lithium levels as context-dependent rather than automatic dose increases', async () => {
    const payload = await ask('Lithium level 0.4 what should I do?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('may be below common therapeutic targets');
    expect(payload.message).toContain('below many common therapeutic targets');
    expect(payload.message).toContain('true trough');
    expect(payload.message).toContain('adherence or missed doses');
    expect(payload.message).toContain('renal function/eGFR/creatinine');
    expect(payload.message).toContain('NSAIDs, ACE inhibitors, ARBs, thiazides');
    expect(payload.message).toContain('Do not make an automatic dose change from one lab value alone');
    expect(payload.message).not.toMatch(/\bincrease dose\b/i);
    expect(payload.message).not.toMatch(/\bhold (the )?(medication|lithium)\b/i);
  });

  it('frames high lithium level with confusion as urgent toxicity concern', async () => {
    const payload = await ask('Lithium level 1.6 and patient confused');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('falls in the general toxicity-risk range category');
    expect(payload.message).toContain('lithium toxicity');
    expect(payload.message).toMatch(/urgent evaluation/i);
    expect(payload.message).toContain('GI upset');
    expect(payload.message).toContain('coarse tremor');
    expect(payload.message).toContain('confusion');
    expect(payload.message).toContain('seizures');
    expect(payload.message).not.toMatch(/\btitrate\b/i);
    expect(sentenceCount(payload.message)).toBeLessThanOrEqual(9);
  });

  it('maps renal-function values near lithium to renal candidacy rather than lithium serum level', async () => {
    const creatinine = await ask('Creatinine is 1.6. Would lithium be a good choice?');
    const cr = await ask('Cr 1.6, thinking lithium for mood stabilization');
    const egfr = await ask('eGFR 45, can I start lithium?');

    for (const payload of [creatinine, cr, egfr]) {
      expect(payload.answerMode).toBe('medication_reference_answer');
      expect(payload.message).toContain('Lithium renal-safety candidacy framework');
      expect(payload.message).toContain('not a lithium serum level');
      expect(payload.message).toContain('Lithium is renally cleared');
      expect(payload.message).toContain('eGFR/CrCl');
      expect(payload.message).toContain('baseline and trend');
      expect(payload.message).toContain('age/body size');
      expect(payload.message).toContain('hydration');
      expect(payload.message).toContain('sodium/fluid status');
      expect(payload.message).toContain('urinalysis/proteinuria');
      expect(payload.message).toContain('NSAIDs, ACE inhibitors, ARBs, thiazides');
      expect(payload.message).toContain('alternatives');
      expect(payload.message).toContain('Severe renal impairment');
      expect(payload.message).toContain('not a patient-specific medication order');
      expect(sentenceCount(payload.message)).toBeLessThanOrEqual(7);
      expect(payload.message).not.toContain('falls in the general toxicity-risk range category');
      expect(payload.message).not.toMatch(/\blithium level of 1\.6\b/i);
      expect(payload.message).not.toMatch(/\b(start|avoid|hold|continue)\s+(lithium|the medication)\b/i);
    }
  });

  it('keeps explicit lithium levels in lithium level interpretation lanes after renal mapping fix', async () => {
    const high = await ask('Lithium level 1.6 and confused');
    const low = await ask('Lithium 0.4 what should I do?');

    expect(high.message).toContain('falls in the general toxicity-risk range category');
    expect(high.message).toContain('lithium toxicity');
    expect(high.message).not.toContain('Lithium renal-safety candidacy framework');

    expect(low.message).not.toContain('Lithium serum concentration range context');
    expect(low.message).toContain('may be below common therapeutic targets');
    expect(low.message).toContain('Do not make an automatic dose change from one lab value alone');
    expect(low.message).not.toContain('Lithium renal-safety candidacy framework');
  });

  it('does not automatically increase for low Depakote levels', async () => {
    const payload = await ask('Depakote level 38, increase?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).not.toContain('Valproate / divalproex level range context');
    expect(payload.message).toContain('below common total-level reference range');
    expect(payload.message).toContain('may be below common target ranges');
    expect(payload.message).toContain('total or free level');
    expect(payload.message).toContain('timing of draw');
    expect(payload.message).toContain('adherence');
    expect(payload.message).toContain('albumin');
    expect(payload.message).toContain('LFTs');
    expect(payload.message).toContain('CBC/platelets');
    expect(payload.message).toContain('Do not make an automatic dose change');
    expect(sentenceCount(payload.message)).toBeLessThanOrEqual(7);
    expect(payload.message).not.toMatch(/\bincrease\b.*\bdose\b/i);
  });

  it('frames high/symptomatic valproate levels with toxicity context', async () => {
    const payload = await ask('Valproate level 110 and patient sedated');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('higher safety-review');
    expect(payload.message).toContain('free level');
    expect(payload.message).toContain('not routine titration');
    expect(payload.message).toContain('ammonia');
    expect(payload.message).toContain('LFTs');
    expect(payload.message).toContain('CBC/platelets');
    expect(payload.message).toContain('total versus free level');
    expect(payload.message).toContain('albumin');
    expect(payload.message).not.toContain('Valproate / divalproex level range context');
    expect(sentenceCount(payload.message)).toBeLessThanOrEqual(6);
  });

  it('uses hepatic caution for elevated LFTs on Depakote before titration', async () => {
    const payload = await ask('AST 95 ALT 140 on Depakote can I titrate?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).not.toContain('Medication-related liver test abnormalities range context');
    expect(payload.message).toContain('local lab ULN');
    expect(payload.message).toContain('hepatic/DILI safety concern');
    expect(payload.message).toContain('baseline/trend');
    expect(payload.message).toContain('bilirubin');
    expect(payload.message).toContain('INR');
    expect(payload.message).toContain('titration should not be treated as routine');
    expect(sentenceCount(payload.message)).toBeLessThanOrEqual(4);
  });

  it('routes sodium 128 on oxcarbazepine to hyponatremia safety framing', async () => {
    const payload = await ask('Sodium 128 on oxcarbazepine');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).not.toContain('Serum sodium range context');
    expect(payload.message).toContain('falls in the general moderate hyponatremia category');
    expect(payload.message).toContain('hyponatremia/SIADH concern');
    expect(payload.message).toContain('confusion');
    expect(payload.message).toContain('seizure');
    expect(payload.message).toContain('acuity/trend');
    expect(payload.message).toContain('repeat confirmation');
    expect(sentenceCount(payload.message)).toBeLessThanOrEqual(7);
  });

  it('routes low platelets on Depakote to thrombocytopenia caution', async () => {
    const payload = await ask('Platelets 85 on Depakote');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).not.toContain('Platelet count range context');
    expect(payload.message).toContain('falls in the general moderate thrombocytopenia category');
    expect(payload.message).toContain('thrombocytopenia');
    expect(payload.message).toContain('bleeding-risk concern');
    expect(payload.message).toContain('platelet trend');
    expect(payload.message).toContain('bleeding/bruising symptoms');
    expect(payload.message).toContain('repeat CBC');
    expect(payload.message).toContain('local protocol');
    expect(sentenceCount(payload.message)).toBeLessThanOrEqual(5);
  });

  it('routes creatinine increase on lithium to renal safety framing', async () => {
    const payload = await ask('Creatinine increased on lithium');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('renal safety');
    expect(payload.message).toContain('baseline and trend');
    expect(payload.message).toContain('hydration/illness');
    expect(payload.message).toContain('lithium level timing');
    expect(payload.message).toContain('NSAIDs, ACE inhibitors, ARBs, thiazides');
  });

  it('keeps low ANC on clozapine in REMS/current labeling lane', async () => {
    const payload = await ask('ANC low on clozapine');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('Clozapine ANC range context');
    expect(payload.message).toContain('Mild neutropenia category');
    expect(payload.message).toContain('Moderate neutropenia category');
    expect(payload.message).toContain('Severe neutropenia category');
    expect(payload.message).toContain('Low ANC/WBC on clozapine');
    expect(payload.message).toContain('baseline ANC');
    expect(payload.message).toContain('BEN status');
    expect(payload.message).toContain('REMS requirements have changed');
    expect(payload.message).toContain('current labeling/local protocol/pharmacy workflow');
    expect(payload.message).not.toMatch(/\bhold (the )?(medication|clozapine)\b/i);
  });

  it('routes abnormal A1c on olanzapine to metabolic risk-benefit framework', async () => {
    const payload = await ask('A1c 7.2 on olanzapine');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('metabolic-risk monitoring');
    expect(payload.message).toContain('risk-benefit review');
    expect(payload.message).toContain('baseline and trend');
    expect(payload.message).toContain('weight/BMI');
    expect(payload.message).toContain('primary care/pharmacy/local metabolic protocol');
  });

  it('classifies numeric clozapine ANC prompts without giving threshold-specific orders', async () => {
    const payload = await ask('ANC 900 on clozapine');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('falls in the general moderate neutropenia category');
    expect(payload.message).toContain('current labeling');
    expect(payload.message).toContain('local protocol');
    expect(payload.message).not.toMatch(/\bhold (the )?(medication|clozapine)\b/i);
    expect(payload.message).not.toMatch(/\bcontinue clozapine\b/i);
  });

  it('keeps QTc medication-context answers concise unless full reference is requested', async () => {
    const payload = await ask('QTc 520 on Haldol');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).not.toContain('QTc interval range context');
    expect(payload.message).toContain('falls in the general high-risk qtc context category');
    expect(payload.message).toMatch(/electrolyte|potassium/i);
    expect(payload.message).toContain('QT-prolonging medications');
    expect(payload.message).toMatch(/do not make a directive medication/i);
    expect(sentenceCount(payload.message)).toBeLessThanOrEqual(8);
    expect(payload.message).not.toMatch(/\bhold (the )?(medication|haldol|haloperidol)\b/i);
  });

  it('expands QTc range detail when the user asks for full reference', async () => {
    const payload = await ask('give full reference for QTc 520 on Haldol');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('QTc interval range context');
    expect(payload.message).toContain('Common upper-limit context');
    expect(payload.message).toContain('High-risk QTc context');
    expect(payload.message).toContain('>=500');
  });

  it('keeps lithium symptoms in urgent safety lane even when the numeric level is not frankly high', async () => {
    const payload = await ask('Lithium 1.2 with diarrhea and tremor, routine monitoring?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('This is not routine monitoring');
    expect(payload.message).toContain('Lithium toxicity is possible');
    expect(payload.message).toMatch(/urgent evaluation/i);
    expect(payload.message).toContain('level timing/trough');
    expect(payload.message).toContain('renal function/eGFR/creatinine');
    expect(payload.message).toContain('electrolytes/sodium');
    expect(payload.message).toContain('hydration/illness');
    expect(payload.message).toContain('NSAIDs, ACE inhibitors, ARBs, thiazides');
    expect(payload.message).not.toMatch(/\bincrease\b.*\bdose\b/i);
  });

  it('escalates high lithium level wording without a numeric level', async () => {
    const payload = await ask('Lithium level high but no number, what context matters?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('This is not routine monitoring');
    expect(payload.message).toContain('Lithium toxicity is possible');
    expect(payload.message).toContain('electrolytes/sodium');
    expect(payload.message).toContain('confusion');
    expect(payload.message).toContain('seizures');
  });

  it('routes vomiting with high valproate level into urgent review language', async () => {
    const payload = await ask('Valproic acid level 145 with vomiting');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('higher safety-review range');
    expect(payload.message).toContain('vomiting');
    expect(payload.message).toContain('urgent prescriber/pharmacy/local protocol review');
    expect(payload.message).toContain('ammonia');
    expect(payload.message).toContain('LFTs');
    expect(payload.message).toContain('CBC/platelets');
  });

  it('keeps pending Depakote level plus sleepiness in symptomatic lab review lane', async () => {
    const payload = await ask('Depakote level pending but patient is very sleepy, what labs matter?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('not routine titration');
    expect(payload.message).toContain('sleepiness');
    expect(payload.message).toContain('ammonia if sedated or altered');
    expect(payload.message).toContain('albumin');
    expect(payload.message).toContain('LFTs');
    expect(payload.message).toContain('CBC/platelets');
  });

  it('routes above-range Tegretol plus dizziness to neurologic toxicity context', async () => {
    const payload = await ask('Tegretol level 13.5 and dizzy');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).not.toContain('Carbamazepine level range context');
    expect(payload.message).toContain('above common reference range');
    expect(payload.message).toContain('neurologic toxicity symptoms');
    expect(payload.message).toContain('dizziness');
    expect(payload.message).toContain('ataxia');
    expect(payload.message).toContain('sodium and recheck/trend');
    expect(payload.message).toContain('autoinduction timing');
    expect(sentenceCount(payload.message)).toBeLessThanOrEqual(8);
  });

  it('routes carbamazepine with sodium drop to hyponatremia context', async () => {
    const payload = await ask('Carbamazepine level okay but sodium dropped, what do I watch?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('hyponatremia risk');
    expect(payload.message).toContain('sodium and recheck/trend');
    expect(payload.message).toContain('seizure');
    expect(payload.message).toContain('CBC');
    expect(payload.message).toContain('LFTs');
  });

  it('keeps clozapine pharmacy-fill questions away from definitive fill instructions', async () => {
    const payload = await ask('ANC low on clozapine, can pharmacy fill it?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('not be reduced to a generic medication profile or a definitive pharmacy-fill answer');
    expect(payload.message).toContain('pharmacy workflow');
    expect(payload.message).toContain('infection symptoms');
    expect(payload.message).not.toMatch(/\bpharmacy can fill\b/i);
  });

  it('routes WBC-low clozapine prompts with ANC pending to clozapine safety framing', async () => {
    const payload = await ask('Clozaril WBC low but ANC not back yet.');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('ANC/WBC concern on clozapine');
    expect(payload.message).toContain('current ANC');
    expect(payload.message).toContain('ANC pending after a low WBC signal');
    expect(payload.message).toContain('infection symptoms');
  });

  it('routes CK with rigidity and fever on antipsychotic to urgent medical assessment', async () => {
    const payload = await ask('CK high with rigidity and fever on antipsychotic, NMS or catatonia?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('Elevated CK with rigidity, fever');
    expect(payload.message).toContain('urgent medical assessment');
    expect(payload.message).toContain('NMS/catatonia overlap');
    expect(payload.message).toContain('vitals');
    expect(payload.message).toContain('renal function/creatinine');
  });

  it('recognizes lithium shorthand with random timing and sedation concern', async () => {
    const payload = await ask('li 0.4 drawn random pt very sedated can i inc?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).not.toContain('Lithium serum concentration range context');
    expect(payload.message).toContain('true trough');
    expect(payload.message).toContain('sedation');
    expect(payload.message).toMatch(/do not make a directive medication/i);
    expect(payload.message).not.toMatch(/\bincrease (the )?dose\b/i);
    expect(payload.message).not.toMatch(/\byou should increase\b/i);
  });

  it('recognizes low lithium level shorthand without automatic titration', async () => {
    const payload = await ask('lith lvl low but not sure when drawn manic still');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).not.toContain('Lithium serum concentration range context');
    expect(payload.message).toContain('Timing uncertainty');
    expect(payload.message).toContain('trough');
    expect(payload.message).toContain('adherence');
    expect(payload.message).not.toMatch(/\bincrease (the )?dose\b/i);
  });

  it('recognizes Li plus HCTZ as lithium-thiazide risk context', async () => {
    const payload = await ask('Li level high no number, also on HCTZ what do I ask?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('Lithium toxicity');
    expect(payload.message).toContain('thiazides');
    expect(payload.message).toContain('renal function/eGFR/creatinine');
    expect(payload.message).toContain('electrolytes/sodium');
  });

  it('does not over-trust lithium levels drawn soon after dose', async () => {
    const payload = await ask('Lithium 0.7 two hrs after dose, looks therapeutic?');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('Timing uncertainty');
    expect(payload.message).toContain('soon after a dose');
    expect(payload.message).toContain('true trough');
    expect(payload.message).not.toMatch(/\btherapeutic\b.*\bconfirmed\b/i);
  });

  it('prioritizes lithium dehydration and weakness while level is pending', async () => {
    const payload = await ask('lithium + dehydration but level pending, patient weak');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('This is not routine monitoring');
    expect(payload.message).toContain('dehydration');
    expect(payload.message).toContain('weakness');
    expect(payload.message).toContain('renal function/eGFR/creatinine');
    expect(payload.message).toContain('electrolytes/sodium');
  });

  it('routes Depakote numeric shorthand as level interpretation without direct increase', async () => {
    const payload = await ask('Depakote 38 increase? no idea if trough');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).not.toContain('Valproate / divalproex level range context');
    expect(payload.message).toContain('Timing uncertainty');
    expect(payload.message).toContain('adherence');
    expect(payload.message).toContain('CBC/platelets');
    expect(payload.message).not.toMatch(/\bincrease (the )?dose\b/i);
  });

  it('lets hepatic red flags override a low Depakote level', async () => {
    const payload = await ask('jaundice + malaise on depakote but level low');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('This is not routine monitoring');
    expect(payload.message).toContain('hepatic safety concern');
    expect(payload.message).toContain('jaundice');
    expect(payload.message).toContain('malaise');
    expect(payload.message).toContain('bilirubin');
    expect(payload.message).toContain('INR');
  });

  it('routes vague CBC abnormality on carbamazepine with sore throat to hematology safety context', async () => {
    const payload = await ask('CBC weird on carbamazepine, patient has sore throat');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('CBC');
    expect(payload.message).toContain('blood dyscrasia/infection concern');
    expect(payload.message).toContain('ANC');
    expect(payload.message).toContain('sore throat');
  });

  it('recognizes TG shorthand with quetiapine and abdominal pain', async () => {
    const payload = await ask('TG 500 on quetiapine mild abd pain');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('triglycerides');
    expect(payload.message).toContain('pancreatitis-risk concern');
    expect(payload.message).toContain('baseline and trend');
    expect(payload.message).toContain('fasting status');
  });

  it('recognizes carbamazepine OD shorthand with ataxia and missing EKG', async () => {
    const payload = await ask('carbamazepine OD ataxia ekg not done');

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.message).toContain('This is not routine monitoring');
    expect(payload.message).toContain('overdose');
    expect(payload.message).toContain('ataxia');
    expect(payload.message).toContain('EKG');
    expect(payload.message).toContain('co-ingestions');
  });
});
