import { normalizeMedReferenceText } from '@/lib/veranote/med-reference/psych-meds';
import type { MedReferenceSource } from '@/lib/veranote/med-reference/types';

export type MedicationFactIntent =
  | 'half_life'
  | 'max_dose'
  | 'starting_dose'
  | 'therapeutic_range'
  | 'food_requirement'
  | 'washout_period'
  | 'monitoring_cadence'
  | 'renal_adjustment'
  | 'hepatic_adjustment'
  | 'protocol_reference';

export type MedicationFactAnswer = {
  id: string;
  intent: MedicationFactIntent;
  medicationName: string;
  text: string;
  sourceRefs: MedReferenceSource[];
};

type MedicationFactEntry = MedicationFactAnswer & {
  matches: (normalizedPrompt: string) => boolean;
};

const DAILYMED_SEARCH = 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=';

function dailyMedSource(id: string, label: string, query: string): MedReferenceSource {
  return {
    id,
    label,
    url: `${DAILYMED_SEARCH}${encodeURIComponent(query)}`,
    type: 'labeling',
  };
}

function referenceSource(id: string, label: string, url: string): MedReferenceSource {
  return {
    id,
    label,
    url,
    type: 'reference',
  };
}

function hasAny(normalizedPrompt: string, aliases: string[]) {
  return aliases.some((alias) => {
    const normalizedAlias = normalizeMedReferenceText(alias);
    const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, 'i').test(normalizedPrompt);
  });
}

function has(normalizedPrompt: string, pattern: RegExp) {
  return pattern.test(normalizedPrompt);
}

const lithiumSource = dailyMedSource('dailymed-lithium-levels', 'DailyMed labeling: lithium therapeutic levels', 'lithium carbonate therapeutic serum levels');
const valproateSource = dailyMedSource('dailymed-divalproex-levels', 'DailyMed labeling: divalproex / valproate serum levels', 'divalproex valproate mania plasma concentration 125');
const carbamazepineSource = dailyMedSource('dailymed-carbamazepine-levels', 'DailyMed labeling: carbamazepine therapeutic levels', 'carbamazepine therapeutic plasma concentration 4 12');

export const STRUCTURED_MEDICATION_FACTS: MedicationFactEntry[] = [
  {
    id: 'lithium-therapeutic-range',
    intent: 'therapeutic_range',
    medicationName: 'lithium',
    text: 'Typical lithium therapeutic levels: Maintenance: 0.6-1.0 mEq/L; Acute mania: 0.8-1.2 mEq/L. Higher levels increase toxicity risk.',
    sourceRefs: [lithiumSource],
    matches: (prompt) => hasAny(prompt, ['lithium']) && has(prompt, /\b(normal|therapeutic|target|reference)\b.*\b(level|levels|range|ranges)\b|\b(level|levels|range|ranges)\b.*\b(normal|therapeutic|target|reference|usually)\b/),
  },
  {
    id: 'valproate-acute-mania-target-range',
    intent: 'therapeutic_range',
    medicationName: 'valproate/divalproex',
    text: 'Valproate/divalproex target plasma levels for acute mania are commonly 50-125 mcg/mL total valproate. Interpret with timing, albumin/free-level context, and symptoms.',
    sourceRefs: [valproateSource],
    matches: (prompt) => hasAny(prompt, ['valproate', 'valproic acid', 'divalproex', 'depakote', 'vpa']) && has(prompt, /\b(target|therapeutic|serum|plasma|level|levels|range)\b/) && has(prompt, /\b(acute mania|mania|manic)\b/),
  },
  {
    id: 'sertraline-maximum-dose',
    intent: 'max_dose',
    medicationName: 'sertraline',
    text: 'Sertraline maximum recommended daily dose is commonly 200 mg/day for labeled adult indications such as MDD/OCD/panic/PTSD/social anxiety.',
    sourceRefs: [dailyMedSource('dailymed-sertraline-max', 'DailyMed labeling: sertraline dosage', 'sertraline maximum dose 200 mg per day')],
    matches: (prompt) => hasAny(prompt, ['sertraline', 'zoloft']) && has(prompt, /\b(max|maximum|highest)\b.*\b(dose|daily)\b/),
  },
  {
    id: 'quetiapine-elderly-starting-dose',
    intent: 'starting_dose',
    medicationName: 'quetiapine',
    text: 'For quetiapine in elderly patients, use a start low / slow titration frame; labeling references a lower starting dose such as 50 mg/day, with orthostasis and sedation monitoring.',
    sourceRefs: [dailyMedSource('dailymed-quetiapine-geriatric', 'DailyMed labeling: quetiapine geriatric dosing', 'quetiapine elderly lower starting dose 50 mg orthostatic hypotension')],
    matches: (prompt) => hasAny(prompt, ['quetiapine', 'seroquel']) && has(prompt, /\b(start|starting|initial)\b/) && has(prompt, /\b(elderly|geriatric|older)\b/),
  },
  {
    id: 'clozapine-anc-after-first-year',
    intent: 'monitoring_cadence',
    medicationName: 'clozapine',
    text: 'For clozapine, stable ANC monitoring after the first year is commonly monthly / every 4 weeks under current labeling-style schedules. Verify current labeling, BEN context, and local protocol.',
    sourceRefs: [dailyMedSource('dailymed-clozapine-anc-cadence', 'DailyMed labeling: clozapine ANC monitoring cadence', 'clozapine ANC monthly after 12 months')],
    matches: (prompt) => hasAny(prompt, ['clozapine', 'clozaril']) && has(prompt, /\b(anc|absolute neutrophil|neutrophil)\b/) && has(prompt, /\b(after|beyond|following)\b.*\b(first year|1 year|12 months|year)\b|\bmonthly\b/),
  },
  {
    id: 'fluoxetine-half-life',
    intent: 'half_life',
    medicationName: 'fluoxetine',
    text: 'Fluoxetine half-life is about 1-3 days after acute dosing and 4-6 days with chronic use; norfluoxetine, its active metabolite, is longer at about 4-16 days.',
    sourceRefs: [dailyMedSource('dailymed-fluoxetine-half-life', 'DailyMed labeling: fluoxetine / norfluoxetine half-life', 'fluoxetine norfluoxetine half-life 4 16 days')],
    matches: (prompt) => hasAny(prompt, ['fluoxetine', 'prozac']) && has(prompt, /\bhalf life\b/),
  },
  {
    id: 'duloxetine-gad-maximum-dose',
    intent: 'max_dose',
    medicationName: 'duloxetine',
    text: 'For GAD, duloxetine labeling references a maximum of 120 mg/day; many references note limited added benefit above 60 mg/day.',
    sourceRefs: [dailyMedSource('dailymed-duloxetine-gad-max', 'DailyMed labeling: duloxetine GAD dosing', 'duloxetine generalized anxiety disorder maximum dose 120 mg')],
    matches: (prompt) => hasAny(prompt, ['duloxetine', 'cymbalta']) && has(prompt, /\b(max|maximum|highest)\b/) && has(prompt, /\b(gad|generalized anxiety)\b/),
  },
  {
    id: 'gabapentin-renal-adjustment',
    intent: 'renal_adjustment',
    medicationName: 'gabapentin',
    text: 'Yes. Gabapentin requires renal dose adjustment based on kidney function, typically CrCl/eGFR, because it is renally eliminated.',
    sourceRefs: [dailyMedSource('dailymed-gabapentin-renal', 'DailyMed labeling: gabapentin renal adjustment', 'gabapentin renal dose adjustment creatinine clearance')],
    matches: (prompt) => hasAny(prompt, ['gabapentin', 'neurontin']) && has(prompt, /\b(renal|kidney|egfr|crcl)\b/) && has(prompt, /\b(adjust|adjustment|dose|dosing)\b/),
  },
  {
    id: 'nortriptyline-therapeutic-serum-concentration',
    intent: 'therapeutic_range',
    medicationName: 'nortriptyline',
    text: 'Nortriptyline therapeutic serum concentration is commonly referenced as 50-150 ng/mL. Interpret with indication, timing, ECG/cardiac risk, and toxicity symptoms.',
    sourceRefs: [dailyMedSource('dailymed-nortriptyline-level', 'DailyMed labeling: nortriptyline plasma concentration', 'nortriptyline plasma concentration 50 150 ng mL')],
    matches: (prompt) => hasAny(prompt, ['nortriptyline', 'pamelor']) && has(prompt, /\b(therapeutic|serum|plasma|concentration|level|levels|range)\b/),
  },
  {
    id: 'lamotrigine-valproate-starting-reference',
    intent: 'starting_dose',
    medicationName: 'lamotrigine',
    text: 'Lamotrigine with valproate needs a reduced, slow titration framework because valproate increases lamotrigine exposure and rash risk. Verify the exact indication/formulation schedule in current labeling before using a dose.',
    sourceRefs: [dailyMedSource('dailymed-lamotrigine-valproate', 'DailyMed labeling: lamotrigine with valproate', 'lamotrigine valproate titration rash risk')],
    matches: (prompt) => hasAny(prompt, ['lamotrigine', 'lamictal']) && hasAny(prompt, ['valproate', 'depakote', 'divalproex', 'vpa']) && has(prompt, /\b(start|starting|initial|co administered|coadministered|with)\b/),
  },
  {
    id: 'citalopram-over-60-maximum',
    intent: 'max_dose',
    medicationName: 'citalopram',
    text: 'For citalopram in patients over age 60, the maximum recommended dose is 20 mg/day because of QTc/exposure concerns.',
    sourceRefs: [dailyMedSource('dailymed-citalopram-over-60', 'DailyMed labeling: citalopram dose limit over age 60', 'citalopram maximum dose 20 mg patients greater than 60 QT prolongation')],
    matches: (prompt) => hasAny(prompt, ['citalopram', 'celexa']) && has(prompt, /\b(max|maximum|highest)\b/) && has(prompt, /\b(60|older|elderly|geriatric)\b/),
  },
  {
    id: 'alprazolam-half-life',
    intent: 'half_life',
    medicationName: 'alprazolam',
    text: 'Alprazolam half-life is about 11 hours on average in healthy adults, with a reported range around 6.3-26.9 hours; it can be longer in elderly patients.',
    sourceRefs: [dailyMedSource('dailymed-alprazolam-half-life', 'DailyMed labeling: alprazolam half-life', 'alprazolam half-life 11.2 hours 6.3 26.9')],
    matches: (prompt) => hasAny(prompt, ['alprazolam', 'xanax']) && has(prompt, /\bhalf life\b/),
  },
  {
    id: 'atomoxetine-40kg-child-start',
    intent: 'starting_dose',
    medicationName: 'atomoxetine',
    text: 'For atomoxetine in children/adolescents up to 70 kg, labeling uses weight-based dosing: initial reference about 0.5 mg/kg/day, so 40 kg corresponds to about 20 mg/day before patient-specific review.',
    sourceRefs: [dailyMedSource('dailymed-atomoxetine-weight-based', 'DailyMed labeling: atomoxetine weight-based dosing', 'atomoxetine 0.5 mg/kg/day children adolescents 70 kg')],
    matches: (prompt) => hasAny(prompt, ['atomoxetine', 'strattera']) && has(prompt, /\b(start|starting|initial|recommended)\b/) && has(prompt, /\b(child|pediatric|kg|40kg|40 kg)\b/),
  },
  {
    id: 'prazosin-ptsd-nightmare-max',
    intent: 'max_dose',
    medicationName: 'prazosin',
    text: 'For PTSD-related nightmares, prazosin does not have one universal FDA-labeled maximum; blood pressure, orthostasis, tolerability, and local/prescriber reference usually determine the ceiling.',
    sourceRefs: [dailyMedSource('dailymed-prazosin-bp', 'DailyMed labeling: prazosin blood-pressure/orthostasis cautions', 'prazosin orthostatic hypotension blood pressure capsule')],
    matches: (prompt) => hasAny(prompt, ['prazosin', 'minipress']) && has(prompt, /\b(max|maximum|highest)\b/) && has(prompt, /\b(ptsd|nightmare|nightmares)\b/),
  },
  {
    id: 'phenelzine-ssri-washout',
    intent: 'washout_period',
    medicationName: 'phenelzine',
    text: 'Phenelzine to an SSRI generally requires at least 14 days of washout (a 14-day washout). Combining MAOIs with SSRIs can cause serious serotonin syndrome/hypertensive-crisis risk, so verify product-specific guidance.',
    sourceRefs: [dailyMedSource('dailymed-phenelzine-ssri-washout', 'DailyMed labeling: phenelzine MAOI/SSRI washout', 'phenelzine SSRI washout 14 days')],
    matches: (prompt) => (hasAny(prompt, ['phenelzine', 'nardil']) || has(prompt, /\bmaoi\b/)) && has(prompt, /\b(ssri|sertraline|fluoxetine|paroxetine|citalopram|escitalopram)\b/) && has(prompt, /\b(washout|switch|switching|period|days)\b/),
  },
  {
    id: 'carbamazepine-target-serum-range',
    intent: 'therapeutic_range',
    medicationName: 'carbamazepine',
    text: 'Carbamazepine target serum levels are commonly referenced as 4-12 mcg/mL. Interpret with timing, autoinduction, symptoms, sodium, CBC, LFTs, and interactions.',
    sourceRefs: [carbamazepineSource],
    matches: (prompt) => hasAny(prompt, ['carbamazepine', 'tegretol'])
      && has(prompt, /\b(target|therapeutic|serum|level|levels|range)\b/)
      && !has(prompt, /\b\d+(?:\.\d+)?\b|sodium|dropped|drop|dizzy|dizziness|ataxia|sedated|sedation|confused|toxicity|toxic|high|low|what do i do|watch\b/),
  },
  {
    id: 'buspirone-maximum-dose',
    intent: 'max_dose',
    medicationName: 'buspirone',
    text: 'Buspirone maximum daily dosage is commonly referenced as 60 mg/day.',
    sourceRefs: [dailyMedSource('dailymed-buspirone-max', 'DailyMed labeling: buspirone maximum dose', 'buspirone maximum daily dosage 60 mg')],
    matches: (prompt) => hasAny(prompt, ['buspirone', 'buspar']) && has(prompt, /\b(max|maximum|highest)\b/),
  },
  {
    id: 'vilazodone-initial-dose',
    intent: 'starting_dose',
    medicationName: 'vilazodone',
    text: 'Vilazodone initial dosing is commonly 10 mg once daily with food for 7 days before label-based titration. Verify current labeling before applying clinically.',
    sourceRefs: [dailyMedSource('dailymed-vilazodone-initial', 'DailyMed labeling: vilazodone initial dosing', 'vilazodone initial dosage 10 mg once daily with food')],
    matches: (prompt) => hasAny(prompt, ['vilazodone', 'viibryd']) && has(prompt, /\b(initial|starting|start)\b/),
  },
  {
    id: 'lurasidone-food-requirement',
    intent: 'food_requirement',
    medicationName: 'lurasidone',
    text: 'Yes. Lurasidone should be taken with food, typically at least 350 calories, to improve absorption.',
    sourceRefs: [dailyMedSource('dailymed-lurasidone-food', 'DailyMed labeling: lurasidone food requirement', 'lurasidone at least 350 calories food absorption')],
    matches: (prompt) => hasAny(prompt, ['lurasidone', 'latuda']) && has(prompt, /\b(food|calorie|calories|absorption|taken with)\b/),
  },
  {
    id: 'ziprasidone-food-requirement',
    intent: 'food_requirement',
    medicationName: 'ziprasidone',
    text: 'Ziprasidone should be taken with food; about 500 calories is commonly cited for optimal and reproducible oral absorption.',
    sourceRefs: [
      dailyMedSource('dailymed-ziprasidone-food', 'DailyMed labeling: ziprasidone food interaction', 'ziprasidone take with food absorption'),
      referenceSource('pubmed-ziprasidone-calories', 'PubMed: calorie impact on ziprasidone absorption', 'https://pubmed.ncbi.nlm.nih.gov/19026256/'),
    ],
    matches: (prompt) => hasAny(prompt, ['ziprasidone', 'geodon']) && has(prompt, /\b(food|calorie|calories|caloric|absorption|taken with)\b/),
  },
  {
    id: 'diazepam-duration-active-metabolites',
    intent: 'half_life',
    medicationName: 'diazepam',
    text: 'Diazepam is long-acting and has active metabolites, including desmethyldiazepam; effects and accumulation can last longer than the parent drug alone.',
    sourceRefs: [dailyMedSource('dailymed-diazepam-metabolites', 'DailyMed labeling: diazepam active metabolites', 'diazepam active metabolite desmethyldiazepam half-life')],
    matches: (prompt) => hasAny(prompt, ['diazepam', 'valium']) && has(prompt, /\b(duration|half life|long acting|action)\b/),
  },
  {
    id: 'aripiprazole-autism-pediatric-start',
    intent: 'starting_dose',
    medicationName: 'aripiprazole',
    text: 'For pediatric irritability associated with autism, aripiprazole labeling includes a 2 mg/day starting reference before titration toward response/tolerability.',
    sourceRefs: [dailyMedSource('dailymed-aripiprazole-autism-start', 'DailyMed labeling: aripiprazole autism irritability pediatric dosing', 'aripiprazole pediatric irritability autistic disorder 2 mg')],
    matches: (prompt) => hasAny(prompt, ['aripiprazole', 'abilify']) && has(prompt, /\b(start|starting|initial)\b/) && has(prompt, /\b(autism|autistic|irritability|pediatric|child)\b/),
  },
  {
    id: 'bupropion-xl-maximum',
    intent: 'max_dose',
    medicationName: 'bupropion XL',
    text: 'Bupropion XL maximum recommended dose is commonly 450 mg/day; seizure risk is dose-related and patient-specific risk factors matter.',
    sourceRefs: [dailyMedSource('dailymed-bupropion-xl-max', 'DailyMed labeling: bupropion XL maximum dose and seizure risk', 'bupropion XL maximum dose 450 mg seizure')],
    matches: (prompt) => hasAny(prompt, ['bupropion', 'wellbutrin', 'wellbutrin xl']) && has(prompt, /\b(max|maximum|highest)\b/) && has(prompt, /\b(xl|extended release|extended)\b/),
  },
  {
    id: 'methadone-half-life',
    intent: 'half_life',
    medicationName: 'methadone',
    text: 'Methadone half-life is highly variable and long; labeling cites terminal half-life ranges such as 8-59 hours in studies, creating accumulation risk.',
    sourceRefs: [dailyMedSource('dailymed-methadone-half-life', 'DailyMed labeling: methadone half-life variability', 'methadone terminal half-life 8 59 hours')],
    matches: (prompt) => hasAny(prompt, ['methadone']) && has(prompt, /\bhalf life\b/),
  },
  {
    id: 'lorazepam-status-epilepticus-protocol',
    intent: 'protocol_reference',
    medicationName: 'lorazepam',
    text: 'Lorazepam for status epilepticus is emergency/protocol-based, not routine outpatient dosing. Labeling references 0.05 mg/kg IV up to 4 mg per dose; follow local emergency protocol.',
    sourceRefs: [dailyMedSource('dailymed-lorazepam-status', 'DailyMed labeling: lorazepam injection status epilepticus', 'lorazepam injection status epilepticus 0.05 mg/kg maximum 4 mg')],
    matches: (prompt) => hasAny(prompt, ['lorazepam', 'ativan']) && has(prompt, /\b(status epilepticus|seizure|seizures)\b/) && has(prompt, /\b(max|maximum|dose|dosing)\b/),
  },
  {
    id: 'guanfacine-er-adhd-start',
    intent: 'starting_dose',
    medicationName: 'guanfacine ER',
    text: 'Guanfacine ER for ADHD commonly starts at 1 mg once daily; monitor blood pressure, pulse, sedation, and rebound hypertension risk with discontinuation.',
    sourceRefs: [dailyMedSource('dailymed-guanfacine-er-start', 'DailyMed labeling: guanfacine ER ADHD starting dose', 'guanfacine extended-release ADHD starting dose 1 mg')],
    matches: (prompt) => hasAny(prompt, ['guanfacine er', 'guanfacine extended release', 'intuniv']) && has(prompt, /\b(start|starting|initial)\b/) && has(prompt, /\b(adhd)\b/),
  },
  {
    id: 'buprenorphine-half-life',
    intent: 'half_life',
    medicationName: 'buprenorphine',
    text: 'Buprenorphine sublingual half-life is commonly around 31-35 hours in labeling, but varies by formulation and route.',
    sourceRefs: [dailyMedSource('dailymed-buprenorphine-half-life', 'DailyMed labeling: buprenorphine sublingual half-life', 'buprenorphine sublingual half-life 31 35 hours')],
    matches: (prompt) => hasAny(prompt, ['buprenorphine', 'suboxone', 'subutex']) && has(prompt, /\bhalf life\b/),
  },
  {
    id: 'mirtazapine-maximum-dose',
    intent: 'max_dose',
    medicationName: 'mirtazapine',
    text: 'Mirtazapine maximum recommended dose is commonly 45 mg/day.',
    sourceRefs: [dailyMedSource('dailymed-mirtazapine-max', 'DailyMed labeling: mirtazapine maximum dose', 'mirtazapine maximum recommended dose 45 mg')],
    matches: (prompt) => hasAny(prompt, ['mirtazapine', 'remeron']) && has(prompt, /\b(max|maximum|highest)\b/),
  },
  {
    id: 'desvenlafaxine-hepatic-adjustment',
    intent: 'hepatic_adjustment',
    medicationName: 'desvenlafaxine',
    text: 'Desvenlafaxine hepatic impairment guidance is product-specific; labeling commonly uses 50 mg/day for moderate to severe hepatic impairment. Verify current labeling.',
    sourceRefs: [dailyMedSource('dailymed-desvenlafaxine-hepatic', 'DailyMed labeling: desvenlafaxine hepatic impairment', 'desvenlafaxine hepatic impairment dose 50 mg')],
    matches: (prompt) => hasAny(prompt, ['desvenlafaxine', 'pristiq']) && has(prompt, /\b(hepatic|liver)\b/) && has(prompt, /\b(adjust|adjustment|dose|dosing)\b/),
  },
  {
    id: 'brexpiprazole-mdd-start',
    intent: 'starting_dose',
    medicationName: 'brexpiprazole',
    text: 'For adjunctive MDD, brexpiprazole labeling commonly starts at 0.5 mg or 1 mg once daily. Verify current labeling and patient-specific risk factors.',
    sourceRefs: [dailyMedSource('dailymed-brexpiprazole-mdd-start', 'DailyMed labeling: brexpiprazole adjunctive MDD starting dose', 'brexpiprazole MDD starting dose 0.5 mg 1 mg')],
    matches: (prompt) => hasAny(prompt, ['brexpiprazole', 'rexulti']) && has(prompt, /\b(start|starting|initial)\b/) && has(prompt, /\b(mdd|major depressive|depression)\b/),
  },
];

export function answerStructuredMedicationFactQuestion(prompt: string): MedicationFactAnswer | null {
  const normalizedPrompt = normalizeMedReferenceText(prompt);

  for (const fact of STRUCTURED_MEDICATION_FACTS) {
    if (fact.matches(normalizedPrompt)) {
      const { matches: _matches, ...answer } = fact;
      return answer;
    }
  }

  return null;
}
