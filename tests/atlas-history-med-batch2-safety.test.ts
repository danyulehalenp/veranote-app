import { describe, expect, it } from 'vitest';
import { buildPsychMedicationReferenceHelp } from '@/lib/veranote/assistant-psych-med-knowledge';

function ask(message: string) {
  const response = buildPsychMedicationReferenceHelp(message);
  expect(response?.answerMode).toBe('medication_reference_answer');
  return response?.message ?? '';
}

function expectMedicationReferenceLane(answer: string) {
  expect(answer).toContain('Medication');
  expect(answer).not.toContain('Urgent safety / tox-withdrawal framework');
  expect(answer).not.toContain('Clinical lab reference framework');
  expect(answer).not.toContain('Interaction safety framework');
  expect(answer).not.toContain('Oral-to-LAI framework');
}

describe('Atlas history med repair batch 2 safety and formulation routing', () => {
  it('answers aripiprazole akathisia as an adverse-effect reference', () => {
    const answer = ask('Is akathisia associated with aripiprazole?');

    expectMedicationReferenceLane(answer);
    expect(answer).toContain('Aripiprazole can cause akathisia');
    expect(answer).toContain('Distinguish akathisia from anxiety');
    expect(answer).toContain('timing');
    expect(answer).toContain('suicidality risk');
  });

  it('covers aripiprazole insomnia and blood pressure without overclaiming causality', () => {
    const answer = ask('Can aripiprazole cause insomnia or elevated blood pressure?');

    expectMedicationReferenceLane(answer);
    expect(answer).toContain('activation and insomnia can occur');
    expect(answer).toContain('Blood pressure changes are possible');
    expect(answer).toContain('rather than assuming causality');
    expect(answer).toContain('dose change');
  });

  it('handles cariprazine slurred speech with neurologic and sedative differential', () => {
    const answer = ask('Can cariprazine cause slurred speech?');

    expectMedicationReferenceLane(answer);
    expect(answer).toContain('Do not assume slurred speech is definitely from cariprazine');
    expect(answer).toContain('neurologic or sedative causes');
    expect(answer).toContain('CNS or EPS adverse effects');
    expect(answer).toContain('focal neurologic deficits');
  });

  it('answers quetiapine weight and sexual dysfunction questions with metabolic nuance', () => {
    const answer = ask('Is quetiapine associated with weight gain or sexual dysfunction?');

    expectMedicationReferenceLane(answer);
    expect(answer).toContain('metabolic risk and weight gain');
    expect(answer).toContain('Sexual dysfunction can occur');
    expect(answer).toContain('less prolactin-mediated than with agents such as risperidone');
    expect(answer).toContain('Monitor weight, lipids, and glucose');
  });

  it('answers olanzapine LFT questions without automatic stop or continue instructions', () => {
    const answer = ask('Can olanzapine cause elevated liver enzymes?');

    expectMedicationReferenceLane(answer);
    expect(answer).toContain('transaminase or LFT elevation');
    expect(answer).toContain('alcohol, viral hepatitis');
    expect(answer).toContain('bilirubin');
    expect(answer).toContain('do not turn this into an automatic stop/continue instruction');
  });

  it('answers lurasidone metabolic risk without saying no weight gain', () => {
    const answer = ask('Does lurasidone have metabolic side effects or weight gain risk?');

    expectMedicationReferenceLane(answer);
    expect(answer).toContain('lower metabolic risk than olanzapine or quetiapine');
    expect(answer).toContain('risk is not zero');
    expect(answer).toContain('Individual response varies');
    expect(answer).not.toMatch(/\bno weight gain\b/i);
  });

  it('covers oxcarbazepine hyponatremia and neurologic adverse effects', () => {
    const answer = ask('Is oxcarbazepine associated with hyponatremia, dizziness, blurred vision, or daytime sedation?');

    expectMedicationReferenceLane(answer);
    expect(answer).toContain('hyponatremia risk');
    expect(answer).toContain('Dizziness, diplopia, blurred vision, and daytime sedation can occur');
    expect(answer).toContain('Check chemistry when symptoms or risk factors are present');
    expect(answer).toContain('worsening neurologic symptoms');
  });

  it('answers SSRI tremor in an adolescent with activation and medical-context checks', () => {
    const answer = ask('Can an SSRI such as escitalopram cause fine hand tremor in an adolescent?');

    expectMedicationReferenceLane(answer);
    expect(answer).toContain('SSRI-associated tremor or activation can occur');
    expect(answer).toContain('caffeine, anxiety, thyroid context');
    expect(answer).toContain('adolescents');
    expect(answer).toContain('clonus');
  });

  it('answers bupropion stuttering as rare possible speech change without overclaiming', () => {
    const answer = ask('Can bupropion cause stuttering?');

    expectMedicationReferenceLane(answer);
    expect(answer).toContain('rare neuropsychiatric speech changes such as stuttering');
    expect(answer).toContain('Avoid overclaiming causality');
    expect(answer).toContain('neurologic differential');
    expect(answer).toContain('lowered convulsion-threshold risk');
  });

  it('answers valproate excess symptoms with level, ammonia, LFT, and CBC context', () => {
    const answer = ask('What physical symptoms suggest excessive valproate levels?');

    expectMedicationReferenceLane(answer);
    expect(answer).toContain('sedation, tremor, GI symptoms, dizziness, ataxia, confusion, or weakness');
    expect(answer).toContain('valproate level, ammonia, LFTs, CBC');
    expect(answer).toContain('albumin or free level context');
    expect(answer).toContain('severe vomiting');
  });

  it('answers trazodone sleep apnea questions without blanket safe/unsafe reassurance', () => {
    const answer = ask('Can trazodone be used safely in a patient with sleep apnea?');

    expectMedicationReferenceLane(answer);
    expect(answer).toContain('Avoid a blanket safe/unsafe answer');
    expect(answer).toContain('untreated OSA');
    expect(answer).toContain('other sedatives, alcohol, opioids');
    expect(answer).toContain('prescriber review');
  });

  it('answers lithium orotate kidney risk without presenting it as a safe alternative', () => {
    const answer = ask('Is lithium orotate associated with kidney risk similar to lithium carbonate?');

    expectMedicationReferenceLane(answer);
    expect(answer).toContain('Lithium orotate still contains lithium');
    expect(answer).toContain('kidney risk cannot be assumed absent');
    expect(answer).toContain('safe alternative');
    expect(answer).toContain('renal and thyroid concerns should not be dismissed');
  });

  it('answers oxcarbazepine extended-release formulation availability', () => {
    const answer = ask('Is there an extended-release formulation of oxcarbazepine?');

    expectMedicationReferenceLane(answer);
    expect(answer).toContain('immediate-release products and an extended-release product');
    expect(answer).toContain('Immediate-release versus extended-release distinction matters');
    expect(answer).toContain('indication, age, product, and substitution rules');
  });

  it('answers fluvoxamine ER capsule division with product-labeling caveat', () => {
    const answer = ask('Can extended-release fluvoxamine capsules be divided?');

    expectMedicationReferenceLane(answer);
    expect(answer).toContain('Extended-release fluvoxamine capsule administration is product-specific');
    expect(answer).toContain('Do not crush, chew, split, open, or divide');
    expect(answer).toContain('immediate-release alternatives');
  });

  it('keeps loxapine maximum-dose shorthand useful without inventing a dose', () => {
    const answer = ask('Maximum daily loxapine dose?');

    expectMedicationReferenceLane(answer);
    expect(answer).toContain('Loxapine oral maximum dose reference');
    expect(answer).toContain('route and formulation matter');
    expect(answer).toContain('Monitor EPS, sedation, anticholinergic effects');
    expect(answer).toContain('verify the exact maximum');
  });
});
