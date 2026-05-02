import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/auth-middleware', () => ({
  requireAuth: async () => ({
    user: {
      id: 'atlas-direct-reference-provider',
      role: 'provider',
      email: 'atlas-direct-reference@veranote.local',
    },
    isAuthenticated: true,
    providerIdentityId: 'atlas-direct-reference-provider',
    tokenSource: 'header',
  }),
}));

vi.mock('@/lib/resilience/rate-limiter', () => ({
  checkRateLimit: async () => {},
}));

import { POST } from '@/app/api/assistant/respond/route';
import { answerDirectMedicationReferenceQuestion } from '@/lib/veranote/med-reference/direct-answers';

async function ask(
  message: string,
  recentMessages: Array<{ role: 'provider' | 'assistant'; content: string; answerMode?: string }> = [],
) {
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
      recentMessages,
    }),
  }));

  expect(response.status).toBe(200);
  return response.json() as Promise<{ message: string; answerMode?: string; eval?: { routePriority?: string } }>;
}

function expectConciseSafeDirectAnswer(message: string) {
  expect(message.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(120);
  expect(message).not.toContain('Common uses include');
  expect(message).not.toContain('Common psychiatric uses include');
  expect(message).not.toContain('Oral-to-LAI framework');
  expect(message).not.toContain('I do not have a confident medication match');
  expect(message).not.toContain('I don\'t have a safe Veranote answer');
  expect(message).not.toMatch(/\bincrease\s+(?:the\s+)?(?:dose|medication)\b/i);
  expect(message).not.toMatch(/\bhold\s+(?:the\s+)?(?:dose|medication|lithium|depakote|valproate|clozapine|haldol)\b/i);
  expect(message).not.toMatch(/\bcontinue\s+(?:the\s+)?(?:dose|medication|lithium|depakote|valproate|clozapine|haldol)\b/i);
  expect(message).not.toMatch(/\bstop\s+(?:the\s+)?(?:dose|medication|lithium|depakote|valproate|clozapine|haldol)\b/i);
  expect(message).not.toMatch(/\bpharmacy can fill\b/i);
  expect(message).not.toMatch(/\bsafe to combine\b/i);
}

function expectStrictFdaApprovalAnswer(message: string) {
  expectConciseSafeDirectAnswer(message);
  expect(message.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(100);
  expect(message).toMatch(/\b(FDA-approved|not FDA-approved)\b/i);
  expect(message).not.toMatch(/\b(common uses include|common psychiatric uses include)\b/i);
  expect(message).not.toMatch(/\b(oral dose|oral overlap|last injection date|missed-dose)\b/i);
  expect(message).not.toMatch(/\b(was this|do you have|tell me more|what context)\b/i);
}

function expectDirectInteractionAnswer(message: string) {
  expectConciseSafeDirectAnswer(message);
  expect(message.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(130);
  expect(message).toMatch(/\brisk\b/i);
  expect(message).toMatch(/\bverify\b/i);
  expect(message).not.toMatch(/\bmeds recognized\b/i);
  expect(message).not.toMatch(/\bhigh-yield monitoring includes\b/i);
  expect(message).not.toMatch(/\beating disorder involving restriction\b/i);
}

function expectUrgentProtocolAnswer(message: string) {
  expectConciseSafeDirectAnswer(message);
  expect(message.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(140);
  expect(message).toMatch(/\b(urgent|emergency|acute|protocol)\b/i);
  expect(message).not.toMatch(/\bgive\s+\d+/i);
  expect(message).not.toMatch(/\badminister\s+\d+/i);
  expect(message).not.toMatch(/\bstart\s+\d+/i);
}

describe('direct medication reference answer lanes', () => {
  it('keeps structured direct answers separate from generic medication profiles', () => {
    const approval = answerDirectMedicationReferenceQuestion('Is esketamine FDA-approved for treatment-resistant depression?');
    const adverse = answerDirectMedicationReferenceQuestion('Does ziprasidone cause QTc prolongation?');
    const interaction = answerDirectMedicationReferenceQuestion('Can linezolid cause serotonin syndrome with SSRIs?');
    const urgent = answerDirectMedicationReferenceQuestion('What is the treatment for a dystonic reaction?');

    expect(approval?.lane).toBe('approval_indication');
    expect(approval?.sourceRefs.some((source) => source.url.includes('dailymed.nlm.nih.gov') || source.url.includes('accessdata.fda.gov'))).toBe(true);
    expect(adverse?.lane).toBe('adverse_effect_yes_no');
    expect(interaction?.lane).toBe('interaction_safety');
    expect(urgent?.lane).toBe('urgent_protocol_reference');
  });

  it.each([
    ['What long-acting antipsychotic injections are approved for adolescents?', ['long-acting injectable antipsychotics', 'under 18', 'adult-focused', 'product-specific labeling']],
    ['Is esketamine FDA-approved for treatment-resistant depression?', ['esketamine', 'FDA', 'treatment-resistant depression']],
    ['Which stimulants are FDA-approved for binge eating disorder?', ['lisdexamfetamine', 'FDA', 'binge eating disorder']],
    ['Is paliperidone palmitate approved for schizoaffective disorder?', ['paliperidone palmitate', 'FDA', 'schizoaffective']],
    ['Which SSRIs are FDA-approved for OCD in children?', ['fluoxetine', 'sertraline', 'fluvoxamine', 'OCD', 'children']],
    ['Is clozapine approved for reducing suicidal behavior in schizophrenia?', ['clozapine', 'suicidal behavior', 'schizophrenia']],
    ['Which medications are approved for irritability associated with autism?', ['irritability', 'autism', 'risperidone', 'aripiprazole']],
    ['Is brexanolone approved for postpartum depression?', ['brexanolone', 'FDA', 'postpartum depression']],
    ['Which antipsychotics are FDA-approved for bipolar depression?', ['bipolar depression', 'FDA', 'label']],
    ['Is modafinil FDA-approved for ADHD?', ['modafinil', 'ADHD', 'not']],
    ['Which medications are FDA-approved for smoking cessation?', ['smoking cessation', 'varenicline', 'bupropion']],
    ['Is acamprosate FDA-approved for opioid use disorder?', ['acamprosate', 'not', 'opioid use disorder']],
    ['Which drugs are approved for Tardive Dyskinesia?', ['tardive dyskinesia', 'valbenazine', 'deutetrabenazine']],
    ['Is lithium approved for use in children under 7?', ['lithium', 'not FDA-approved', 'children under 7']],
    ['Which medications are approved for PMDD?', ['PMDD', 'fluoxetine', 'sertraline', 'paroxetine']],
    ['Which SSRIs are approved for PTSD?', ['PTSD', 'sertraline', 'paroxetine']],
  ])('answers FDA approval / indication question directly: %s', async (question, expectedParts) => {
    const payload = await ask(question);
    const normalized = payload.message.toLowerCase();

    expect(payload.answerMode).toBe('medication_reference_answer');
    for (const part of expectedParts) {
      expect(normalized).toContain(part.toLowerCase());
    }
    expectStrictFdaApprovalAnswer(payload.message);
  });

  it.each([
    ['Does ziprasidone cause QTc prolongation?', ['ziprasidone', 'QTc', 'prolongation']],
    ['What is the risk of agranulocytosis with clozapine?', ['clozapine', 'agranulocytosis', 'ANC']],
    ['Does olanzapine cause significant weight gain?', ['olanzapine', 'weight gain', 'metabolic']],
    ['Can SSRIs cause hyponatremia in the elderly?', ['SSRIs', 'hyponatremia', 'elderly']],
    ['Does venlafaxine increase blood pressure?', ['venlafaxine', 'blood pressure']],
    ['What are the symptoms of serotonin syndrome?', ['serotonin syndrome', 'mental status', 'autonomic', 'neuromuscular']],
    ['Does mirtazapine cause sedation?', ['mirtazapine', 'sedation']],
    ['Does lithium cause tremor?', ['lithium', 'tremor']],
    ['Does clozapine cause myocarditis?', ['clozapine', 'myocarditis']],
    ['Can benzodiazepines cause anterograde amnesia?', ['benzodiazepines', 'anterograde amnesia']],
  ])('answers adverse-effect yes/no question directly: %s', async (question, expectedParts) => {
    const payload = await ask(question);
    const normalized = payload.message.toLowerCase();

    expect(payload.answerMode).toBe('medication_reference_answer');
    for (const part of expectedParts) {
      expect(normalized).toContain(part.toLowerCase());
    }
    expectConciseSafeDirectAnswer(payload.message);
  });

  it.each([
    ['Is there a significant interaction between lithium and NSAIDs?', ['lithium', 'NSAIDs', 'toxicity']],
    ['Can you combine an MAOI with a triptan?', ['MAOI', 'triptan', 'serotonin']],
    ['Does fluoxetine inhibit CYP2D6?', ['fluoxetine', 'CYP2D6', 'inhibit']],
    ['Is valproate contraindicated in pregnancy?', ['valproate', 'pregnancy', 'contraindicated']],
    ['Can carbamazepine lower oral contraceptive effectiveness?', ['carbamazepine', 'oral contraceptive', 'effectiveness']],
    ['Is smoking an inducer of CYP1A2?', ['smoking', 'CYP1A2', 'clozapine']],
    ['Does St. John\'s Wort interact with SSRIs?', ['St. John', 'SSRI', 'serotonin']],
    ['Can grapefruit juice affect buspirone levels?', ['grapefruit', 'buspirone', 'CYP3A4']],
    ['Is there an interaction between clozapine and ciprofloxacin?', ['clozapine', 'ciprofloxacin', 'CYP1A2']],
    ['Should lithium be avoided in patients with renal failure?', ['lithium', 'renal', 'toxicity']],
    ['Is bupropion contraindicated in patients with eating disorders?', ['bupropion', 'contraindicated', 'seizure']],
    ['Does erythromycin increase levels of alprazolam?', ['erythromycin', 'alprazolam', 'CYP3A4']],
    ['Can linezolid cause serotonin syndrome with SSRIs?', ['linezolid', 'SSRI', 'serotonin syndrome']],
    ['Is pimozide contraindicated with QTc prolonging drugs?', ['pimozide', 'contraindicated', 'QT']],
    ['Does lamotrigine interact with oral contraceptives?', ['lamotrigine', 'contraceptive', 'levels']],
    ['Is thioridazine contraindicated with fluoxetine?', ['thioridazine', 'fluoxetine', 'contraindicated']],
    ['Can SSRIs increase bleeding risk with warfarin?', ['SSRI', 'warfarin', 'bleeding']],
    ['Can lithium and ACE inhibitors be taken together?', ['lithium', 'ACE inhibitor', 'toxicity']],
    ['Does rifampin decrease methadone levels?', ['rifampin', 'methadone', 'decrease']],
    ['Is there an interaction between disulfiram and alcohol?', ['disulfiram', 'alcohol', 'reaction']],
    ['Is clozapine contraindicated in patients with a history of seizures?', ['clozapine', 'seizure', 'caution']],
    ['Does omeprazole affect the metabolism of diazepam?', ['omeprazole', 'diazepam', 'CYP2C19']],
    ['Can lithium and diuretics be safely combined?', ['lithium', 'diuretics', 'toxicity']],
    ['Is high-dose aspirin contraindicated with valproate?', ['aspirin', 'valproate', 'free']],
    ['Does carbamazepine induce its own metabolism?', ['carbamazepine', 'autoinduction']],
    ['Can paroxetine be used with tamoxifen?', ['paroxetine', 'tamoxifen', 'CYP2D6']],
    ['Can tramadol and SSRIs be combined safely?', ['tramadol', 'SSRI', 'serotonin']],
    ['Does verapamil increase lithium toxicity?', ['verapamil', 'lithium', 'toxicity']],
    ['Can MAOIs be taken with pseudoephedrine?', ['MAOI', 'pseudoephedrine', 'hypertensive']],
    ['Is divalproex contraindicated in urea cycle disorders?', ['divalproex', 'urea cycle', 'contraindicated']],
    ['Can Wellbutrin and Celexa be taken together?', ['bupropion', 'citalopram', 'seizure', 'QTc']],
    ['Wellbutrin + Zoloft?', ['bupropion', 'sertraline', 'seizure']],
    ['Prozac and Wellbutrin interaction?', ['fluoxetine', 'bupropion', 'CYP2D6']],
    ['Celexa with trazodone?', ['citalopram', 'trazodone', 'QTc']],
    ['Lexapro plus NSAID?', ['escitalopram', 'NSAID', 'bleeding']],
    ['Depakote with Lamictal?', ['valproate', 'lamotrigine', 'rash']],
    ['Lamictal with birth control?', ['lamotrigine', 'contraceptive', 'levels']],
    ['Haldol with QTc 520?', ['QTc', 'haloperidol', 'potassium']],
    ['Suboxone with Lybalvi?', ['samidorphan', 'buprenorphine', 'withdrawal']],
    ['Ativan with alcohol?', ['lorazepam', 'alcohol', 'respiratory']],
  ])('answers interaction question directly: %s', async (question, expectedParts) => {
    const payload = await ask(question);
    const normalized = payload.message.toLowerCase();

    expect(payload.answerMode).toBe('medication_reference_answer');
    for (const part of expectedParts) {
      expect(normalized).toContain(part.toLowerCase());
    }
    expectDirectInteractionAnswer(payload.message);
  });

  it('corrects a recoverable prior clinical answer after a frustrated follow-up', async () => {
    const payload = await ask('That is why I am asking you. What kind of assistant are you?', [
      { role: 'provider', content: 'Can Wellbutrin and Celexa be taken together?' },
      { role: 'assistant', content: 'citalopram: interaction review should focus on MAOIs or linezolid.', answerMode: 'medication_reference_answer' },
    ]);
    const normalized = payload.message.toLowerCase();

    expect(payload.answerMode).toBe('medication_reference_answer');
    expect(payload.eval?.routePriority).toBe('frustrated-followup-correction');
    expect(normalized).toContain('too generic');
    expect(normalized).toContain('wellbutrin');
    expect(normalized).toContain('celexa');
    expect(normalized).toContain('bupropion');
    expect(normalized).toContain('citalopram');
    expect(normalized).toContain('seizure');
    expect(normalized).toContain('qtc');
    expect(normalized).not.toContain('source-bound');
    expect(normalized).not.toContain('send this through beta feedback');
    expectConciseSafeDirectAnswer(payload.message);
  });

  it.each([
    ['Is lithium safe during the first trimester?', ['lithium', 'pregnancy', 'risk-benefit']],
    ['Which SSRI is most associated with Ebstein\'s anomaly?', ['SSRI', 'Ebstein', 'risk-benefit']],
    ['Can valproate cause neural tube defects?', ['valproate', 'neural tube', 'risk-benefit']],
    ['Is sertraline considered safe during breastfeeding?', ['sertraline', 'lactation', 'risk-benefit']],
    ['What is the risk of PPHN with SSRI use in pregnancy?', ['PPHN', 'SSRI', 'risk-benefit']],
    ['Can ECT be performed during pregnancy?', ['ECT', 'pregnancy', 'risk-benefit']],
    ['Does lithium pass into breast milk?', ['lithium', 'breast milk', 'risk-benefit']],
    ['Can topiramate cause oral clefts in newborns?', ['topiramate', 'oral cleft', 'risk-benefit']],
  ])('answers pregnancy/lactation risk-benefit question directly: %s', async (question, expectedParts) => {
    const payload = await ask(question);
    const normalized = payload.message.toLowerCase();

    expect(payload.answerMode).toBe('medication_reference_answer');
    for (const part of expectedParts) {
      expect(normalized).toContain(part.toLowerCase());
    }
    expectDirectInteractionAnswer(payload.message);
    expect(payload.message).not.toMatch(/\bsafe in pregnancy\b/i);
  });

  it.each([
    ['What is the treatment for a dystonic reaction?', ['dystonic', 'diphenhydramine', 'benztropine', 'protocol']],
    ['What is the first-line treatment for NMS?', ['NMS', 'emergency', 'CK', 'protocol']],
    ['Can you give IM ziprasidone and IM lorazepam together?', ['ziprasidone', 'lorazepam', 'sedation', 'QTc']],
    ['How is an SSRI overdose managed?', ['SSRI overdose', 'toxicology', 'ECG', 'poison control']],
    ['What is the triage priority for a suicidal patient?', ['suicidal', 'triage', 'immediate safety', 'protocol']],
    ['Can physical restraints be used without a physician\'s order?', ['restraints', 'policy', 'monitoring', 'legal']],
    ['What is the gold standard for treating opioid withdrawal?', ['opioid withdrawal', 'buprenorphine', 'methadone', 'protocol']],
    ['Can buprenorphine be started if the patient is still intoxicated?', ['buprenorphine', 'intoxicated', 'COWS', 'protocol']],
    ['What is the dose of naloxone for an opioid overdose?', ['naloxone', 'opioid overdose', 'airway', 'protocol']],
    ['How is Wernicke-Korsakoff syndrome treated?', ['Wernicke', 'thiamine', 'protocol']],
  ])('answers urgent emergency / toxicology protocol question directly: %s', async (question, expectedParts) => {
    const payload = await ask(question);
    const normalized = payload.message.toLowerCase();

    expect(payload.answerMode).toBe('medication_reference_answer');
    for (const part of expectedParts) {
      expect(normalized).toContain(part.toLowerCase());
    }
    expectUrgentProtocolAnswer(payload.message);
  });

  it.each([
    ['What is the COWS scale used for?', ['Reference', 'opioid withdrawal', 'severity']],
    ['Is there a medication for cocaine use disorder?', ['Reference', 'no FDA-approved medication', 'cocaine use disorder']],
    ['Can methadone cause QTc prolongation?', ['Reference', 'methadone', 'QTc']],
    ['What is the half-life of heroin?', ['Reference', 'heroin', 'half-life']],
    ['Can clonidine be used for opioid withdrawal symptoms?', ['clonidine', 'opioid withdrawal', 'autonomic']],
    ['How does flumazenil work?', ['flumazenil', 'benzodiazepine receptor antagonist', 'seizures']],
  ])('answers substance / withdrawal reference questions without generic fallback: %s', async (question, expectedParts) => {
    const payload = await ask(question);
    const normalized = payload.message.toLowerCase();

    expect(payload.answerMode).toBe('medication_reference_answer');
    for (const part of expectedParts) {
      expect(normalized).toContain(part.toLowerCase());
    }
    expectConciseSafeDirectAnswer(payload.message);
  });
});
