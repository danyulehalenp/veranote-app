import type { AssistantReferenceSource, AssistantResponsePayload } from '@/types/assistant';

type PsychMedicationIntent =
  | 'overview'
  | 'side-effects'
  | 'monitoring'
  | 'warnings'
  | 'class';

type PsychMedicationProfile = {
  name: string;
  aliases: string[];
  className: string;
  mechanism: string;
  overview: string;
  commonSideEffects: string[];
  seriousWarnings: string[];
  monitoring: string[];
  counselingPoints: string[];
  references: AssistantReferenceSource[];
};

const PSYCH_MEDICATION_PROFILES: PsychMedicationProfile[] = [
  {
    name: 'sertraline',
    aliases: ['sertraline', 'zoloft'],
    className: 'SSRI antidepressant',
    mechanism: 'It increases serotonin signaling.',
    overview: 'Sertraline is an SSRI commonly used for depression, anxiety-spectrum conditions, OCD, PTSD, and related disorders.',
    commonSideEffects: ['nausea or GI upset', 'headache', 'insomnia or somnolence', 'sexual side effects'],
    seriousWarnings: ['serotonin syndrome risk', 'suicidality warning in children, adolescents, and young adults', 'withdrawal symptoms if stopped abruptly'],
    monitoring: ['watch for activation or worsening suicidality early in treatment', 'review sexual side effects and GI tolerance', 'track adherence and symptom response over several weeks'],
    counselingPoints: ['benefit may take a few weeks', 'do not stop abruptly without a taper plan', 'review other serotonergic medications'],
    references: [{ label: 'Sertraline: MedlinePlus Drug Information', url: 'https://medlineplus.gov/druginfo/meds/a697048.html' }],
  },
  {
    name: 'escitalopram',
    aliases: ['escitalopram', 'lexapro'],
    className: 'SSRI antidepressant',
    mechanism: 'It increases serotonin signaling.',
    overview: 'Escitalopram is an SSRI used for depression and generalized anxiety disorder.',
    commonSideEffects: ['nausea', 'headache', 'sleep disturbance', 'sexual side effects'],
    seriousWarnings: ['suicidality warning in younger patients', 'serotonin syndrome risk', 'withdrawal symptoms if stopped abruptly'],
    monitoring: ['track mood and anxiety response', 'watch for activation, agitation, or worsening suicidality', 'review tolerance and adherence'],
    counselingPoints: ['benefit may take several weeks', 'do not stop abruptly', 'review serotonergic drug combinations'],
    references: [{ label: 'Escitalopram: MedlinePlus Drug Information', url: 'https://medlineplus.gov/druginfo/meds/a603005.html' }],
  },
  {
    name: 'bupropion',
    aliases: ['bupropion', 'wellbutrin', 'zyban'],
    className: 'NDRI antidepressant',
    mechanism: 'It affects norepinephrine and dopamine signaling.',
    overview: 'Bupropion is an antidepressant also used for smoking cessation. It is often chosen when avoiding sexual side effects or sedation matters.',
    commonSideEffects: ['insomnia', 'dry mouth', 'anxiety or jitteriness', 'headache'],
    seriousWarnings: ['seizure risk at higher doses or in predisposed patients', 'suicidality warning in younger patients', 'activation or worsening anxiety in some patients'],
    monitoring: ['review seizure risk factors and eating disorder history', 'track sleep, anxiety, and blood pressure when clinically relevant', 'monitor adherence and mood response'],
    counselingPoints: ['avoid duplicate bupropion-containing products', 'take earlier in the day if insomnia is a problem', 'do not exceed prescribed dose'],
    references: [{ label: 'Bupropion: MedlinePlus Drug Information', url: 'https://medlineplus.gov/druginfo/meds/a695033.html' }],
  },
  {
    name: 'venlafaxine',
    aliases: ['venlafaxine', 'effexor', 'effexor xr'],
    className: 'SNRI antidepressant',
    mechanism: 'It increases serotonin and norepinephrine signaling.',
    overview: 'Venlafaxine is an SNRI used for depression and several anxiety disorders.',
    commonSideEffects: ['nausea', 'sweating', 'dry mouth', 'sexual side effects'],
    seriousWarnings: ['suicidality warning in younger patients', 'withdrawal symptoms can be prominent if stopped abruptly', 'blood pressure can increase in some patients'],
    monitoring: ['track blood pressure when clinically relevant', 'monitor withdrawal risk if doses are missed or changed', 'review mood, anxiety, and tolerability'],
    counselingPoints: ['take consistently', 'do not stop abruptly', 'report significant blood pressure issues or severe withdrawal symptoms'],
    references: [{ label: 'Venlafaxine: MedlinePlus Drug Information', url: 'https://medlineplus.gov/druginfo/meds/a694020.html' }],
  },
  {
    name: 'duloxetine',
    aliases: ['duloxetine', 'cymbalta', 'drizalma'],
    className: 'SNRI antidepressant',
    mechanism: 'It increases serotonin and norepinephrine signaling.',
    overview: 'Duloxetine is an SNRI used for depression, anxiety, and some pain conditions.',
    commonSideEffects: ['nausea', 'dry mouth', 'fatigue', 'sweating'],
    seriousWarnings: ['suicidality warning in younger patients', 'withdrawal symptoms if stopped abruptly', 'hepatic caution and blood pressure concerns in some patients'],
    monitoring: ['track mood, anxiety, pain response, and tolerability', 'review blood pressure and liver-related risk when clinically relevant', 'watch for discontinuation symptoms'],
    counselingPoints: ['swallow delayed-release product as directed', 'do not stop abruptly', 'review alcohol and liver history when relevant'],
    references: [{ label: 'Duloxetine: MedlinePlus Drug Information', url: 'https://medlineplus.gov/druginfo/meds/a604030.html' }],
  },
  {
    name: 'trazodone',
    aliases: ['trazodone', 'desyrel'],
    className: 'serotonin modulator antidepressant',
    mechanism: 'It increases serotonin activity with additional receptor effects that often make it sedating.',
    overview: 'Trazodone is an antidepressant that is also commonly used off-label for insomnia because of its sedating properties.',
    commonSideEffects: ['sedation', 'dizziness', 'dry mouth', 'orthostasis'],
    seriousWarnings: ['suicidality warning in younger patients', 'priapism risk', 'serotonin syndrome risk'],
    monitoring: ['review daytime sedation, falls risk, and orthostasis', 'monitor mood response if being used for depression', 'watch for serotonin-related interactions'],
    counselingPoints: ['sedation can be substantial', 'use caution with other sedating medications', 'seek urgent care for priapism'],
    references: [{ label: 'Trazodone: MedlinePlus Drug Information', url: 'https://medlineplus.gov/druginfo/meds/a681038.html' }],
  },
  {
    name: 'lithium',
    aliases: ['lithium', 'lithobid'],
    className: 'mood stabilizer / antimanic agent',
    mechanism: 'It decreases abnormal brain activity through several intracellular signaling effects.',
    overview: 'Lithium is a mood stabilizer used in bipolar-spectrum illness, especially for mania maintenance and relapse prevention.',
    commonSideEffects: ['tremor', 'GI upset', 'thirst or polyuria', 'weight gain'],
    seriousWarnings: ['toxicity risk', 'renal and thyroid concerns', 'dehydration and sodium shifts can raise levels'],
    monitoring: ['serum lithium levels', 'renal function', 'thyroid function', 'clinical toxicity symptoms'],
    counselingPoints: ['keep hydration and salt intake steady', 'watch NSAID and interacting medication use', 'report vomiting, diarrhea, worsening tremor, or confusion promptly'],
    references: [{ label: 'Lithium: MedlinePlus Drug Information', url: 'https://medlineplus.gov/druginfo/meds/a681039.html' }],
  },
  {
    name: 'lamotrigine',
    aliases: ['lamotrigine', 'lamictal'],
    className: 'mood stabilizer / anticonvulsant',
    mechanism: 'It decreases abnormal electrical activity in the brain.',
    overview: 'Lamotrigine is used in bipolar I disorder maintenance and in seizure disorders. It is often valued for bipolar depression prevention rather than acute mania treatment.',
    commonSideEffects: ['dizziness', 'blurred or double vision', 'headache', 'nausea'],
    seriousWarnings: ['serious rash including Stevens-Johnson syndrome', 'higher rash risk with rapid titration or valproate coadministration'],
    monitoring: ['watch closely for rash', 'review titration schedule carefully', 'monitor adherence because restarting after interruptions can require retitration'],
    counselingPoints: ['slow titration matters', 'new rash needs urgent review', 'do not restart at the previous full dose after a prolonged gap without guidance'],
    references: [{ label: 'Lamotrigine: MedlinePlus Drug Information', url: 'https://medlineplus.gov/druginfo/meds/a695007.html' }],
  },
  {
    name: 'valproic acid',
    aliases: ['valproic acid', 'divalproex', 'depakote', 'valproate'],
    className: 'mood stabilizer / anticonvulsant',
    mechanism: 'It increases levels of a natural substance in the brain involved in calming neuronal activity.',
    overview: 'Valproic acid and divalproex are mood stabilizing anticonvulsants used in bipolar mania and seizure disorders.',
    commonSideEffects: ['GI upset', 'tremor', 'sedation', 'weight gain'],
    seriousWarnings: ['hepatotoxicity risk', 'pancreatitis risk', 'teratogenicity concern'],
    monitoring: ['liver-related monitoring', 'CBC and platelets when clinically indicated', 'drug level monitoring when relevant'],
    counselingPoints: ['review pregnancy-related risk carefully', 'report severe abdominal pain or marked lethargy', 'do not assume formulations are interchangeable without checking'],
    references: [{ label: 'Valproic Acid: MedlinePlus Drug Information', url: 'https://medlineplus.gov/druginfo/meds/a682412.html' }],
  },
  {
    name: 'quetiapine',
    aliases: ['quetiapine', 'seroquel'],
    className: 'atypical antipsychotic',
    mechanism: 'It changes the activity of several natural substances in the brain.',
    overview: 'Quetiapine is an atypical antipsychotic used across schizophrenia, bipolar-spectrum illness, and as an adjunct in some depressive disorders.',
    commonSideEffects: ['sedation', 'dry mouth', 'constipation', 'weight gain'],
    seriousWarnings: ['metabolic risk', 'orthostasis and falls risk', 'boxed warning regarding mortality in older adults with dementia-related psychosis'],
    monitoring: ['weight and metabolic monitoring', 'sedation and orthostasis', 'EPS or akathisia when clinically relevant'],
    counselingPoints: ['sedation can be prominent', 'XR tablets should not be crushed', 'review metabolic monitoring expectations'],
    references: [{ label: 'Quetiapine: MedlinePlus Drug Information', url: 'https://medlineplus.gov/druginfo/meds/a698019.html' }],
  },
  {
    name: 'olanzapine',
    aliases: ['olanzapine', 'zyprexa'],
    className: 'atypical antipsychotic',
    mechanism: 'It changes the activity of certain natural substances in the brain.',
    overview: 'Olanzapine is an atypical antipsychotic used for schizophrenia and bipolar-spectrum illness.',
    commonSideEffects: ['weight gain', 'sedation', 'increased appetite', 'dry mouth'],
    seriousWarnings: ['high metabolic burden', 'boxed warning regarding mortality in older adults with dementia-related psychosis'],
    monitoring: ['weight and metabolic monitoring', 'sedation', 'EPS when clinically relevant'],
    counselingPoints: ['metabolic effects can be substantial', 'daily adherence matters', 'review sedation and weight-change counseling early'],
    references: [{ label: 'Olanzapine: MedlinePlus Drug Information', url: 'https://medlineplus.gov/druginfo/meds/a601213.html' }],
  },
  {
    name: 'aripiprazole',
    aliases: ['aripiprazole', 'abilify'],
    className: 'atypical antipsychotic',
    mechanism: 'It changes the activity of several natural substances in the brain.',
    overview: 'Aripiprazole is an atypical antipsychotic used in schizophrenia, bipolar-spectrum illness, irritability related to autism, and as augmentation in depression.',
    commonSideEffects: ['akathisia or restlessness', 'headache', 'GI upset', 'weight gain'],
    seriousWarnings: ['impulse-control problems in some patients', 'boxed warning regarding mortality in older adults with dementia-related psychosis'],
    monitoring: ['watch for akathisia or activation', 'weight and metabolic monitoring', 'review behavioral or impulse-control changes'],
    counselingPoints: ['restlessness can be a major reason patients stop it', 'daily hydration and adherence still matter', 'review any new gambling or impulsive behaviors promptly'],
    references: [{ label: 'Aripiprazole: MedlinePlus Drug Information', url: 'https://medlineplus.gov/druginfo/meds/a603012.html' }],
  },
  {
    name: 'risperidone',
    aliases: ['risperidone', 'risperdal'],
    className: 'atypical antipsychotic',
    mechanism: 'It changes the activity of certain natural substances in the brain.',
    overview: 'Risperidone is an atypical antipsychotic used in schizophrenia, bipolar-spectrum illness, and irritability related to autism.',
    commonSideEffects: ['sedation', 'dizziness', 'weight gain', 'EPS or prolactin-related effects'],
    seriousWarnings: ['boxed warning regarding mortality in older adults with dementia-related psychosis', 'metabolic and extrapyramidal risks'],
    monitoring: ['weight and metabolic monitoring', 'EPS', 'prolactin-related symptoms when relevant'],
    counselingPoints: ['daily adherence matters', 'ODT and liquid formulations require correct administration', 'report stiffness, tremor, or major menstrual/sexual side effects'],
    references: [{ label: 'Risperidone: MedlinePlus Drug Information', url: 'https://medlineplus.gov/druginfo/meds/a694015.html' }],
  },
  {
    name: 'clozapine',
    aliases: ['clozapine', 'clozaril', 'fazaclo', 'versacloz'],
    className: 'atypical antipsychotic',
    mechanism: 'It changes the activity of certain natural substances in the brain.',
    overview: 'Clozapine is an atypical antipsychotic generally reserved for treatment-resistant schizophrenia or related high-need situations because of its monitoring burden.',
    commonSideEffects: ['sedation', 'constipation', 'sialorrhea', 'weight gain'],
    seriousWarnings: ['severe neutropenia risk', 'seizure risk', 'myocarditis concern', 'boxed warning regarding mortality in older adults with dementia-related psychosis'],
    monitoring: ['ANC monitoring', 'constipation burden', 'metabolic monitoring', 'watch for myocarditis symptoms early in treatment'],
    counselingPoints: ['this medication has major monitoring requirements', 'constipation can be serious and should not be minimized', 'fever or infection symptoms need prompt evaluation'],
    references: [{ label: 'Clozapine: MedlinePlus Drug Information', url: 'https://medlineplus.gov/druginfo/meds/a691001.html' }],
  },
  {
    name: 'lorazepam',
    aliases: ['lorazepam', 'ativan'],
    className: 'benzodiazepine',
    mechanism: 'It slows activity in the brain to allow for relaxation.',
    overview: 'Lorazepam is a benzodiazepine used for anxiety, sedation, insomnia, and some acute agitation contexts.',
    commonSideEffects: ['sedation', 'dizziness', 'impaired coordination', 'memory or concentration problems'],
    seriousWarnings: ['respiratory depression with some combinations', 'dependence and withdrawal risk', 'misuse risk'],
    monitoring: ['sedation and falls risk', 'concurrent opioid or other sedative use', 'dependence or escalating use patterns'],
    counselingPoints: ['avoid mixing with other sedatives unless specifically directed', 'use caution with driving', 'do not stop abruptly after regular use'],
    references: [{ label: 'Lorazepam: MedlinePlus Drug Information', url: 'https://medlineplus.gov/druginfo/meds/a682053.html' }],
  },
];

function hasKeyword(message: string, keywords: string[]) {
  return keywords.some((keyword) => message.includes(keyword));
}

function findPsychMedicationProfile(normalizedMessage: string) {
  return PSYCH_MEDICATION_PROFILES.find((profile) => (
    profile.aliases.some((alias) => new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i').test(normalizedMessage))
  ));
}

function inferPsychMedicationIntent(normalizedMessage: string): PsychMedicationIntent {
  if (/(side effects?|adverse effects?|what should i watch|common effects?)/i.test(normalizedMessage)) {
    return 'side-effects';
  }

  if (/(monitor|monitoring|labs?|levels?|anc|blood work|ekg|ecg|check)/i.test(normalizedMessage)) {
    return 'monitoring';
  }

  if (/(warning|warnings|boxed|black box|serious risk|major risk)/i.test(normalizedMessage)) {
    return 'warnings';
  }

  if (/(class|mechanism|how does|what kind of medication|what kind of med)/i.test(normalizedMessage)) {
    return 'class';
  }

  return 'overview';
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildPsychMedicationReferenceHelp(normalizedMessage: string): AssistantResponsePayload | null {
  const profile = findPsychMedicationProfile(normalizedMessage);

  if (!profile) {
    return null;
  }

  const intent = inferPsychMedicationIntent(normalizedMessage);

  if (intent === 'side-effects') {
    return {
      message: `${profile.name[0]?.toUpperCase()}${profile.name.slice(1)} commonly causes ${profile.commonSideEffects.join(', ')}. Important higher-risk concerns include ${profile.seriousWarnings.join(', ')}.`,
      suggestions: [
        `If you want, I can also summarize monitoring points for ${profile.name}.`,
        'Use medication reference answers as general reference support, not as patient-specific prescribing decisions.',
      ],
      references: profile.references,
    };
  }

  if (intent === 'monitoring') {
    return {
      message: `For ${profile.name}, key monitoring themes include ${profile.monitoring.join(', ')}.`,
      suggestions: [
        `If you want, I can also summarize common side effects or major warnings for ${profile.name}.`,
        'Use medication reference answers as general reference support, not as patient-specific prescribing decisions.',
      ],
      references: profile.references,
    };
  }

  if (intent === 'warnings') {
    return {
      message: `Major warning themes for ${profile.name} include ${profile.seriousWarnings.join(', ')}.`,
      suggestions: [
        `If you want, I can also summarize monitoring or counseling points for ${profile.name}.`,
        'Use medication reference answers as general reference support, not as patient-specific prescribing decisions.',
      ],
      references: profile.references,
    };
  }

  if (intent === 'class') {
    return {
      message: `${profile.name[0]?.toUpperCase()}${profile.name.slice(1)} is a ${profile.className}. ${profile.mechanism}`,
      suggestions: [
        `If you want, I can also summarize side effects, warnings, or monitoring for ${profile.name}.`,
        'Use medication reference answers as general reference support, not as patient-specific prescribing decisions.',
      ],
      references: profile.references,
    };
  }

  return {
    message: `${profile.overview} It is a ${profile.className}. Common side-effect themes include ${profile.commonSideEffects.join(', ')}.`,
    suggestions: [
      `If you want, I can narrow this to side effects, monitoring, warnings, or counseling points for ${profile.name}.`,
      `Counseling points often include: ${profile.counselingPoints.join('; ')}.`,
    ],
    references: profile.references,
  };
}
