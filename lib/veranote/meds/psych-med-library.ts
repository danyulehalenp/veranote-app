import { listPsychMedications } from '@/lib/medications/seed-loader';
import type { PsychMedicationEntry } from '@/types/medication';
import type { PsychMedicationProfile } from '@/lib/veranote/meds/psych-med-types';

type MedicationOverride = Partial<PsychMedicationProfile> & {
  typicalAdultStartingDose?: string;
  typicalAdultRange?: string;
  maxDoseNotes?: string;
  availableStrengths?: string[];
  dosageForms?: string[];
  routeForms?: string[];
  keyAdverseEffects?: string[];
  highRiskWarnings?: string[];
  majorContraindicationsOrCautions?: string[];
  monitoring?: string[];
  highYieldInteractions?: string[];
  clinicalPearls?: string[];
  documentationPearls?: string[];
  verificationRequiredFor?: string[];
};

const CLASS_LABELS: Record<string, string> = {
  SSRI: 'Antidepressant',
  SNRI: 'Antidepressant',
  NDRI: 'Antidepressant',
  NaSSA: 'Antidepressant',
  SARI: 'Antidepressant',
  serotonin_modulator: 'Antidepressant',
  tricyclic_antidepressant: 'Antidepressant',
  MAOI: 'Antidepressant',
  nmda_antagonist_antidepressant: 'Antidepressant',
  combination_antidepressant: 'Antidepressant',
  first_generation_antipsychotic: 'Antipsychotic',
  second_generation_antipsychotic: 'Antipsychotic',
  long_acting_injectable_antipsychotic: 'Antipsychotic',
  anticonvulsant_mood_stabilizer: 'Mood stabilizer / anticonvulsant',
  anticonvulsant_psych_adjunct: 'Mood stabilizer / anticonvulsant',
  anticonvulsant_off_label_psych_use: 'Mood stabilizer / anticonvulsant',
  lithium_salt: 'Mood stabilizer',
  stimulant_amphetamine_family: 'ADHD medication',
  stimulant_methylphenidate_family: 'ADHD medication',
  stimulant_related_agent: 'Wakefulness-promoting / stimulant-adjacent medication',
  nonstimulant_adhd_agent: 'ADHD medication',
  benzodiazepine: 'Anxiolytic / sedative',
  azapirone: 'Anxiolytic',
  antihistamine_prn_anxiolytic: 'Anxiolytic / sedating antihistamine',
  nonbenzodiazepine_hypnotic: 'Hypnotic',
  melatonin_receptor_agonist: 'Sleep medication',
  orexin_receptor_antagonist: 'Sleep medication',
  alpha1_antagonist: 'Adrenergic medication',
  alpha2_agonist: 'Adrenergic medication',
  opioid_antagonist: 'Substance use treatment medication',
  opioid_use_disorder_medication: 'Substance use treatment medication',
  alcohol_use_disorder_medication: 'Substance use treatment medication',
  smoking_cessation_medication: 'Smoking cessation medication',
  off_label_anxiolytic_adjunct: 'Other psych-supportive medication',
  anxiolytic_adjunct: 'Other psych-supportive medication',
};

const SUBCLASS_DEFAULTS: Record<string, MedicationOverride> = {
  SSRI: {
    routeForms: ['oral tablet or capsule', 'oral liquid when available'],
    keyAdverseEffects: ['GI upset', 'sexual side effects', 'headache', 'sleep disturbance'],
    highRiskWarnings: ['Serotonergic toxicity risk with interacting agents', 'Activation or mania-switch risk in susceptible patients'],
    majorContraindicationsOrCautions: ['Use caution with MAOIs or recent MAOI exposure', 'Bleeding risk may rise with NSAIDs, anticoagulants, or antiplatelets'],
    monitoring: ['Monitor mood response and adverse effects', 'Review suicidality, activation, and bleeding risk when relevant'],
    highYieldInteractions: ['MAOIs or linezolid', 'Other serotonergic agents', 'NSAIDs, anticoagulants, or antiplatelets'],
    clinicalPearls: ['Withdrawal risk varies by agent and half-life', 'Dose and titration should match indication and patient factors'],
    documentationPearls: ['Keep patient-reported benefit and adverse effects separate from inferred adherence or efficacy'],
    verificationRequiredFor: ['dosing', 'cross-tapering', 'pregnancy', 'high-risk interaction checks'],
  },
  SNRI: {
    routeForms: ['oral capsule or tablet'],
    keyAdverseEffects: ['GI upset', 'sweating', 'sexual side effects', 'blood pressure increase'],
    highRiskWarnings: ['Serotonergic toxicity risk', 'Activation or mania-switch risk'],
    majorContraindicationsOrCautions: ['Use caution with MAOIs or recent MAOI exposure', 'Blood pressure and discontinuation effects may be clinically important'],
    monitoring: ['Monitor mood response, blood pressure, and discontinuation symptoms when relevant'],
    highYieldInteractions: ['MAOIs or linezolid', 'Other serotonergic agents', 'NSAIDs, anticoagulants, or antiplatelets'],
    clinicalPearls: ['Abrupt discontinuation can be clinically significant for some agents'],
    documentationPearls: ['Document benefit, adverse effects, and missed-dose concerns without overstating response'],
    verificationRequiredFor: ['dosing', 'discontinuation/tapering', 'renal or hepatic impairment', 'interaction checks'],
  },
  NDRI: {
    routeForms: ['oral tablet'],
    keyAdverseEffects: ['insomnia', 'anxiety or activation', 'dry mouth', 'headache'],
    highRiskWarnings: ['Seizure-threshold lowering risk', 'Activation or mania-switch risk'],
    majorContraindicationsOrCautions: ['Avoid or use extreme caution in seizure disorder, eating disorder, or alcohol/benzodiazepine withdrawal'],
    monitoring: ['Monitor activation, sleep, blood pressure when relevant, and seizure risk factors'],
    highYieldInteractions: ['Other seizure-threshold-lowering medications', 'MAOIs'],
    clinicalPearls: ['Duplicate bupropion-containing products can be overlooked'],
    documentationPearls: ['Document seizure risk factors and eating-disorder history if relevant to the question'],
    verificationRequiredFor: ['dosing', 'seizure-risk evaluation', 'bipolar context', 'interaction checks'],
  },
  NaSSA: {
    routeForms: ['oral tablet', 'orally disintegrating tablet when available'],
    keyAdverseEffects: ['sedation', 'increased appetite', 'weight gain', 'dry mouth'],
    highRiskWarnings: ['Activation or mania-switch risk'],
    majorContraindicationsOrCautions: ['Use caution with MAOIs or recent MAOI exposure'],
    monitoring: ['Monitor mood response, sedation, appetite, and weight'],
    highYieldInteractions: ['MAOIs', 'Other sedatives'],
    clinicalPearls: ['Sedation can vary with dose and patient sensitivity'],
    documentationPearls: ['Document appetite, sleep, and weight effects when relevant'],
    verificationRequiredFor: ['dosing', 'sedation counseling', 'pregnancy', 'interaction checks'],
  },
  SARI: {
    routeForms: ['oral tablet'],
    keyAdverseEffects: ['sedation', 'orthostasis', 'dizziness', 'dry mouth'],
    highRiskWarnings: ['Serotonergic toxicity risk with interacting agents', 'Falls risk in susceptible patients'],
    majorContraindicationsOrCautions: ['Use caution with other sedatives and with QT-risk combinations when relevant'],
    monitoring: ['Monitor sedation, orthostasis, and interaction burden'],
    highYieldInteractions: ['Other serotonergic agents', 'Other sedatives', 'QT-prolonging agents when relevant'],
    clinicalPearls: ['Commonly used at lower doses for sleep than for antidepressant indications'],
    documentationPearls: ['Document sedation, falls risk, and target symptom clearly'],
    verificationRequiredFor: ['dosing', 'QT-risk review', 'interaction checks'],
  },
  tricyclic_antidepressant: {
    routeForms: ['oral capsule or tablet'],
    keyAdverseEffects: ['sedation', 'anticholinergic effects', 'constipation', 'orthostasis'],
    highRiskWarnings: ['Cardiac conduction and overdose risk', 'Anticholinergic burden'],
    majorContraindicationsOrCautions: ['Use caution with overdose risk, arrhythmia risk, and anticholinergic burden'],
    monitoring: ['Monitor anticholinergic effects, orthostasis, and EKG when clinically indicated'],
    highYieldInteractions: ['Other anticholinergics', 'QT-prolonging or conduction-affecting agents', 'MAOIs'],
    clinicalPearls: ['Low-dose use for sleep or pain should not be conflated with antidepressant dosing'],
    documentationPearls: ['Document target symptom and rationale for lower-dose off-label use when relevant'],
    verificationRequiredFor: ['dosing', 'EKG or cardiac risk review', 'older-adult use', 'interaction checks'],
  },
  MAOI: {
    routeForms: ['oral tablet', 'transdermal patch for some products'],
    keyAdverseEffects: ['orthostasis', 'insomnia', 'headache', 'dry mouth'],
    highRiskWarnings: ['Serious interaction risk with serotonergic or sympathomimetic agents', 'Tyramine-related hypertensive reaction risk'],
    majorContraindicationsOrCautions: ['Avoid combining with serotonergic antidepressants, linezolid, many stimulants, and other contraindicated agents'],
    monitoring: ['Monitor blood pressure, interaction burden, and washout timing'],
    highYieldInteractions: ['SSRIs or SNRIs', 'Linezolid', 'Sympathomimetic agents and tyramine exposure'],
    clinicalPearls: ['Washout intervals matter and depend on the medication involved'],
    documentationPearls: ['Document recent serotonergic exposure when interaction questions arise'],
    verificationRequiredFor: ['all dosing', 'cross-tapering', 'washout timing', 'interaction checks'],
  },
  first_generation_antipsychotic: {
    routeForms: ['oral tablet or liquid', 'intramuscular injection for some products', 'long-acting injection for selected agents'],
    keyAdverseEffects: ['EPS', 'akathisia', 'sedation', 'orthostasis'],
    highRiskWarnings: ['QT or conduction risk for selected agents', 'Neuroleptic malignant syndrome risk', 'Tardive dyskinesia risk'],
    majorContraindicationsOrCautions: ['Use caution with parkinsonism, dementia-related psychosis, and QT-risk combinations'],
    monitoring: ['Monitor EPS, akathisia, tardive symptoms, sedation, and EKG when relevant'],
    highYieldInteractions: ['Other dopamine blockers', 'QT-prolonging agents', 'Other sedatives'],
    clinicalPearls: ['Potency influences EPS versus sedation burden'],
    documentationPearls: ['Document observed EPS, sedation, or QT concern rather than assuming class effects'],
    verificationRequiredFor: ['dosing', 'PRN route equivalence', 'QT-risk review', 'LAI conversion questions'],
  },
  second_generation_antipsychotic: {
    routeForms: ['oral tablet or capsule', 'orally disintegrating tablet when available', 'intramuscular injection for some products'],
    keyAdverseEffects: ['metabolic adverse effects', 'sedation', 'akathisia or EPS', 'orthostasis'],
    highRiskWarnings: ['Metabolic syndrome risk', 'Neuroleptic malignant syndrome risk', 'Tardive dyskinesia risk'],
    majorContraindicationsOrCautions: ['Use caution with dementia-related psychosis, metabolic risk, QT-risk combinations for selected agents, and antipsychotic polypharmacy'],
    monitoring: ['Monitor weight, glucose/A1c, lipids, EPS, and EKG when clinically indicated'],
    highYieldInteractions: ['Other antipsychotics', 'QT-prolonging agents', 'Other sedatives'],
    clinicalPearls: ['Akathisia, sedation, and metabolic burden vary substantially by agent'],
    documentationPearls: ['Document target symptom, side-effect burden, and monitoring needs rather than using generic antipsychotic wording'],
    verificationRequiredFor: ['dosing', 'cross-titration', 'LAI conversion', 'pregnancy', 'interaction checks'],
  },
  long_acting_injectable_antipsychotic: {
    routeForms: ['intramuscular long-acting injection'],
    keyAdverseEffects: ['injection-site issues', 'EPS or akathisia', 'metabolic adverse effects', 'sedation'],
    highRiskWarnings: ['Monitoring and oral overlap requirements may differ by product'],
    majorContraindicationsOrCautions: ['Do not assume interchangeable loading, overlap, or interval schedules across products'],
    monitoring: ['Monitor oral overlap status when applicable, missed-dose timing, EPS, and metabolic parameters'],
    highYieldInteractions: ['Other antipsychotics', 'QT-prolonging agents', 'Other sedatives'],
    clinicalPearls: ['Missed-dose management is product specific'],
    documentationPearls: ['Document the exact LAI product rather than only the generic family when possible'],
    verificationRequiredFor: ['all dosing', 'loading schedules', 'missed-dose guidance', 'oral overlap', 'conversion questions'],
  },
  lithium_salt: {
    routeForms: ['oral capsule or tablet', 'extended-release tablet'],
    keyAdverseEffects: ['tremor', 'GI upset', 'polyuria or polydipsia', 'weight gain'],
    highRiskWarnings: ['Lithium toxicity risk', 'Renal and thyroid effects', 'Dehydration or sodium shifts can raise levels'],
    majorContraindicationsOrCautions: ['Use caution with dehydration, acute kidney injury, and interacting medications'],
    monitoring: ['Monitor serum lithium level, renal function, thyroid function, and toxicity symptoms'],
    highYieldInteractions: ['NSAIDs', 'ACE inhibitors or ARBs', 'Diuretics'],
    clinicalPearls: ['Hydration, salt intake, and intercurrent illness can matter clinically'],
    documentationPearls: ['Document level timing if known and keep toxicity symptoms explicit'],
    verificationRequiredFor: ['all dosing', 'level interpretation', 'renal or pregnancy questions', 'interaction checks'],
  },
  anticonvulsant_mood_stabilizer: {
    routeForms: ['oral tablet or capsule', 'liquid when available'],
    keyAdverseEffects: ['sedation', 'dizziness', 'GI upset', 'cognitive slowing or tremor depending on agent'],
    highRiskWarnings: ['Rash, hepatic, hematologic, or teratogenic risks vary by agent'],
    majorContraindicationsOrCautions: ['Use caution with hepatic disease, pregnancy, rash risk, and drug-drug interactions depending on agent'],
    monitoring: ['Monitor medication-specific labs or rash concerns when relevant'],
    highYieldInteractions: ['Lamotrigine-valproate combinations', 'CYP interactions for carbamazepine', 'Other sedatives'],
    clinicalPearls: ['These agents are not interchangeable across bipolar, seizure, and headache indications'],
    documentationPearls: ['Document the target symptom and the exact agent because class effects differ markedly'],
    verificationRequiredFor: ['dosing', 'titration', 'pregnancy', 'renal/hepatic impairment', 'interaction checks'],
  },
  anticonvulsant_psych_adjunct: {
    routeForms: ['oral tablet or capsule', 'liquid when available'],
    keyAdverseEffects: ['dizziness', 'sedation', 'cognitive slowing', 'GI upset'],
    highRiskWarnings: ['Hyponatremia or interaction burden may be clinically important depending on agent'],
    majorContraindicationsOrCautions: ['Use caution with renal or hepatic impairment depending on agent and with abrupt discontinuation'],
    monitoring: ['Monitor sodium or renal function when relevant, and watch sedation burden'],
    highYieldInteractions: ['Other sedatives', 'Enzyme-inducing or enzyme-inhibited combinations depending on agent'],
    clinicalPearls: ['Psychiatric use is often off-label and indication specific'],
    documentationPearls: ['Document that psychiatric use may be adjunctive or off-label when relevant'],
    verificationRequiredFor: ['dosing', 'off-label use questions', 'renal/hepatic impairment', 'interaction checks'],
  },
  benzodiazepine: {
    routeForms: ['oral tablet or liquid', 'intramuscular or intravenous for selected agents'],
    keyAdverseEffects: ['sedation', 'impaired coordination', 'memory impairment', 'falls risk'],
    highRiskWarnings: ['Respiratory depression with opioids, alcohol, or other sedatives', 'Dependence and withdrawal risk'],
    majorContraindicationsOrCautions: ['Use caution in substance use disorder, older adults, sleep apnea, and concurrent opioid use'],
    monitoring: ['Monitor sedation, respiratory suppression risk, misuse concerns, and withdrawal risk'],
    highYieldInteractions: ['Opioids', 'Alcohol', 'Other sedatives'],
    clinicalPearls: ['Short-acting versus long-acting effects can shape withdrawal and rebound symptoms'],
    documentationPearls: ['Document sedation, falls risk, and co-ingestants rather than using generic reassurance'],
    verificationRequiredFor: ['all dosing', 'equivalency', 'tapers', 'opioid co-use', 'older-adult use'],
  },
  azapirone: {
    routeForms: ['oral tablet'],
    keyAdverseEffects: ['dizziness', 'headache', 'nausea', 'restlessness'],
    highRiskWarnings: ['Serotonergic interaction caution is lower than SSRIs but still relevant with MAOIs'],
    majorContraindicationsOrCautions: ['Use caution with MAOIs and CYP3A4 interactions'],
    monitoring: ['Monitor dizziness, adherence, and delayed onset of benefit'],
    highYieldInteractions: ['MAOIs', 'Strong CYP3A4 inhibitors or inducers'],
    clinicalPearls: ['Often not effective as PRN anxiolysis because onset is delayed'],
    documentationPearls: ['Document target anxiety pattern and expectations for delayed effect'],
    verificationRequiredFor: ['dosing', 'interaction checks', 'hepatic impairment'],
  },
  antihistamine_prn_anxiolytic: {
    routeForms: ['oral capsule or tablet', 'liquid', 'intramuscular injection for some formulations'],
    keyAdverseEffects: ['sedation', 'dry mouth', 'dizziness', 'constipation'],
    highRiskWarnings: ['Anticholinergic burden and falls risk may be clinically important'],
    majorContraindicationsOrCautions: ['Use caution in older adults, glaucoma, urinary retention, and QT-risk combinations where relevant'],
    monitoring: ['Monitor sedation, anticholinergic effects, and falls risk'],
    highYieldInteractions: ['Other sedatives', 'Other anticholinergics', 'QT-risk agents when relevant'],
    clinicalPearls: ['PRN use may be limited by sedation and anticholinergic burden'],
    documentationPearls: ['Document sedation and anticholinergic effects explicitly when they drive the clinical question'],
    verificationRequiredFor: ['dosing', 'older-adult use', 'QT-risk review', 'interaction checks'],
  },
  alpha1_antagonist: {
    routeForms: ['oral capsule'],
    keyAdverseEffects: ['orthostasis', 'dizziness', 'syncope', 'headache'],
    highRiskWarnings: ['Falls and hypotension risk can be clinically significant'],
    majorContraindicationsOrCautions: ['Use caution with other blood-pressure-lowering medications and in patients with syncope risk'],
    monitoring: ['Monitor orthostasis, blood pressure, and daytime dizziness when relevant'],
    highYieldInteractions: ['Other antihypertensives', 'Other sedatives'],
    clinicalPearls: ['Bedtime dosing may reduce early orthostasis for some patients'],
    documentationPearls: ['Document orthostasis and trauma/falls risk when relevant'],
    verificationRequiredFor: ['dosing', 'blood-pressure questions', 'combination therapy review'],
  },
  alpha2_agonist: {
    routeForms: ['oral tablet', 'extended-release tablet', 'transdermal patch for some products'],
    keyAdverseEffects: ['sedation', 'hypotension', 'bradycardia', 'dry mouth'],
    highRiskWarnings: ['Abrupt discontinuation may cause rebound hypertension'],
    majorContraindicationsOrCautions: ['Use caution with baseline hypotension, bradycardia, and other sedatives'],
    monitoring: ['Monitor blood pressure, pulse, sedation, and rebound symptoms if doses are missed'],
    highYieldInteractions: ['Other antihypertensives', 'Other sedatives'],
    clinicalPearls: ['Immediate-release and extended-release formulations are not interchangeable'],
    documentationPearls: ['Document formulation and target symptom because IR and ER products are used differently'],
    verificationRequiredFor: ['dosing', 'formulation conversion', 'blood-pressure questions', 'tapering'],
  },
  stimulant_methylphenidate_family: {
    routeForms: ['oral immediate-release tablet', 'oral extended-release product', 'transdermal patch for selected products'],
    keyAdverseEffects: ['appetite suppression', 'insomnia', 'tachycardia', 'anxiety or irritability'],
    highRiskWarnings: ['Misuse potential', 'Mania or psychosis activation risk', 'Cardiovascular cautions'],
    majorContraindicationsOrCautions: ['Use caution with active psychosis, mania, uncontrolled hypertension, or recent MAOI exposure'],
    monitoring: ['Monitor blood pressure, pulse, appetite, sleep, and misuse/diversion concerns'],
    highYieldInteractions: ['MAOIs', 'Other sympathomimetics'],
    clinicalPearls: ['Product-specific release profiles matter more than milligram-for-milligram comparisons'],
    documentationPearls: ['Document formulation and daily timing, not only the ingredient name'],
    verificationRequiredFor: ['all dosing', 'product conversion', 'cardiac risk questions', 'interaction checks'],
  },
  stimulant_amphetamine_family: {
    routeForms: ['oral immediate-release tablet or liquid', 'oral extended-release product'],
    keyAdverseEffects: ['appetite suppression', 'insomnia', 'tachycardia', 'anxiety or irritability'],
    highRiskWarnings: ['Misuse potential', 'Mania or psychosis activation risk', 'Cardiovascular cautions'],
    majorContraindicationsOrCautions: ['Use caution with active psychosis, mania, uncontrolled hypertension, or recent MAOI exposure'],
    monitoring: ['Monitor blood pressure, pulse, appetite, sleep, and misuse/diversion concerns'],
    highYieldInteractions: ['MAOIs', 'Other sympathomimetics'],
    clinicalPearls: ['Mixed amphetamine salts, lisdexamfetamine, and dextroamphetamine are not interchangeable by simple ratio'],
    documentationPearls: ['Document formulation and timing because these strongly affect duration and insomnia burden'],
    verificationRequiredFor: ['all dosing', 'product conversion', 'cardiac risk questions', 'interaction checks'],
  },
  nonstimulant_adhd_agent: {
    routeForms: ['oral capsule or tablet', 'extended-release tablet when applicable'],
    keyAdverseEffects: ['GI upset', 'fatigue or sedation', 'blood pressure or pulse changes', 'sleep disturbance'],
    highRiskWarnings: ['Suicidality warning for atomoxetine', 'Blood pressure or liver concerns vary by agent'],
    majorContraindicationsOrCautions: ['Use caution with MAOIs, cardiovascular disease, and hepatic impairment depending on agent'],
    monitoring: ['Monitor blood pressure, pulse, mood, and agent-specific adverse effects'],
    highYieldInteractions: ['MAOIs', 'CYP interactions for selected agents', 'Other blood-pressure-lowering agents for alpha-agonist products'],
    clinicalPearls: ['Onset and adverse-effect profile differ substantially from stimulants'],
    documentationPearls: ['Document the exact formulation and target symptom rather than using broad ADHD-med wording'],
    verificationRequiredFor: ['dosing', 'pediatric use', 'hepatic or cardiac questions', 'interaction checks'],
  },
  opioid_use_disorder_medication: {
    routeForms: ['oral tablet or liquid', 'sublingual film or tablet', 'long-acting injection when applicable'],
    keyAdverseEffects: ['sedation', 'constipation', 'nausea', 'respiratory suppression risk'],
    highRiskWarnings: ['Respiratory suppression with other sedatives', 'QT risk for methadone', 'Precipitated withdrawal risk for buprenorphine induction timing'],
    majorContraindicationsOrCautions: ['Use caution with benzodiazepines, alcohol, other sedatives, and in overdose-risk settings'],
    monitoring: ['Monitor sedation, overdose risk, constipation, and formulation-specific safety concerns'],
    highYieldInteractions: ['Benzodiazepines', 'Alcohol', 'Other sedatives'],
    clinicalPearls: ['Formulation and induction context matter clinically'],
    documentationPearls: ['Document which product is active and whether the question is about maintenance, induction, or pain use'],
    verificationRequiredFor: ['all dosing', 'induction guidance', 'QT review for methadone', 'interaction checks'],
  },
  opioid_antagonist: {
    routeForms: ['oral tablet', 'intramuscular injection when applicable'],
    keyAdverseEffects: ['nausea', 'headache', 'dizziness', 'hepatotoxicity concern depending on dose and context'],
    highRiskWarnings: ['Opioid-free interval and hepatic considerations may matter clinically'],
    majorContraindicationsOrCautions: ['Use caution if opioid dependence or acute hepatitis is suspected'],
    monitoring: ['Monitor liver-related concerns when relevant and confirm opioid-free status for appropriate contexts'],
    highYieldInteractions: ['Opioids'],
    clinicalPearls: ['Different products serve overdose reversal versus relapse-prevention roles'],
    documentationPearls: ['Document whether the use case is alcohol use disorder, opioid use disorder, or overdose reversal'],
    verificationRequiredFor: ['dosing', 'initiation timing', 'hepatic questions'],
  },
  alcohol_use_disorder_medication: {
    routeForms: ['oral tablet', 'delayed-release tablet when applicable'],
    keyAdverseEffects: ['GI upset', 'headache', 'sedation or dizziness depending on agent'],
    highRiskWarnings: ['Adherence and hepatic or renal cautions vary by agent'],
    majorContraindicationsOrCautions: ['Use caution with ongoing alcohol exposure for disulfiram and with hepatic or renal impairment depending on agent'],
    monitoring: ['Monitor adherence, liver function or renal function when relevant, and relapse context'],
    highYieldInteractions: ['Alcohol for disulfiram', 'Opioids for naltrexone'],
    clinicalPearls: ['Choose the answer around the specific agent because use-case and safety profile differ markedly'],
    documentationPearls: ['Document the patient’s treatment goal and current alcohol use context'],
    verificationRequiredFor: ['dosing', 'hepatic or renal impairment', 'initiation timing'],
  },
  smoking_cessation_medication: {
    routeForms: ['oral tablet', 'transdermal patch', 'gum', 'lozenge', 'inhaler', 'nasal spray'],
    keyAdverseEffects: ['nausea', 'vivid dreams', 'insomnia', 'local irritation depending on product'],
    highRiskWarnings: ['Neuropsychiatric or nicotine-toxicity questions require product-specific review'],
    majorContraindicationsOrCautions: ['Use caution with seizure risk for bupropion and with renal impairment for varenicline'],
    monitoring: ['Monitor quit attempt progress, adverse effects, sleep, and nicotine-replacement duplication'],
    highYieldInteractions: ['Duplicate nicotine-replacement products', 'Other seizure-threshold-lowering agents for bupropion'],
    clinicalPearls: ['Patch plus short-acting replacement may be intentional, but duplicative nicotine products still need review'],
    documentationPearls: ['Document which tobacco-cessation product and target quit strategy are being discussed'],
    verificationRequiredFor: ['dosing', 'combination NRT use', 'pregnancy', 'renal impairment'],
  },
};

const FLAG_WARNINGS: Record<string, string> = {
  serotonergic: 'Serotonergic toxicity risk rises with stacked serotonergic agents or MAOI exposure.',
  suicidality_boxed_warning_age_dependent: 'Monitor for worsening depression or suicidality especially early in treatment and in younger patients.',
  activation_risk: 'May worsen anxiety, insomnia, or agitation early in treatment.',
  mania_switch_risk: 'Can contribute to mania or hypomania activation in susceptible patients.',
  discontinuation_risk: 'Abrupt discontinuation may cause clinically significant withdrawal symptoms.',
  qt_risk: 'QT prolongation risk may increase with other QT-risk drugs or cardiac/electrolyte risk.',
  qt_risk_high: 'Higher-concern QT risk; review EKG and interacting agents when relevant.',
  seizure_risk: 'Can lower seizure threshold or worsen seizure risk in susceptible patients.',
  agranulocytosis_neutropenia: 'CBC/ANC monitoring is required because neutropenia risk can be serious.',
  myocarditis_risk: 'Myocarditis or cardiomyopathy concerns require urgent review if symptoms arise.',
  severe_constipation_ileus_risk: 'Constipation and ileus risk may be clinically dangerous and should be monitored proactively.',
  hyponatremia_risk: 'Hyponatremia risk is clinically relevant, especially in older adults or with diuretics.',
  metabolic_risk: 'Weight, glucose, and lipid monitoring may be clinically important.',
  respiratory_depression_risk: 'Respiratory suppression risk increases with opioids, alcohol, or other sedatives.',
  misuse_diversion_risk: 'Misuse or diversion risk should be considered.',
  dependence_withdrawal_risk: 'Dependence and withdrawal risk can be clinically significant.',
  hepatic_risk: 'Hepatic toxicity or dose adjustment concerns may apply.',
  renal_risk: 'Renal clearance or toxicity concerns may apply.',
};

const DOSE_OVERRIDES: Record<string, MedicationOverride> = {
  sertraline: {
    typicalAdultStartingDose: '25-50 mg/day',
    typicalAdultRange: '50-200 mg/day',
    availableStrengths: ['25 mg', '50 mg', '100 mg'],
    dosageForms: ['tablet', 'oral concentrate'],
  },
  fluoxetine: {
    typicalAdultStartingDose: '10-20 mg/day',
    typicalAdultRange: '20-80 mg/day',
    availableStrengths: ['10 mg', '20 mg', '40 mg', '90 mg'],
    dosageForms: ['capsule', 'tablet', 'delayed-release capsule', 'oral solution'],
  },
  paroxetine: {
    typicalAdultStartingDose: '10-20 mg/day',
    typicalAdultRange: '20-60 mg/day',
    availableStrengths: ['10 mg', '20 mg', '30 mg', '40 mg', '12.5 mg', '25 mg', '37.5 mg'],
    dosageForms: ['tablet', 'controlled-release tablet', 'oral suspension'],
  },
  citalopram: {
    typicalAdultStartingDose: '10-20 mg/day',
    typicalAdultRange: '20-40 mg/day',
    maxDoseNotes: 'QT-related limits may apply, especially in older adults or with hepatic impairment.',
    availableStrengths: ['10 mg', '20 mg', '40 mg'],
    dosageForms: ['tablet', 'oral solution'],
  },
  escitalopram: {
    typicalAdultStartingDose: '5-10 mg/day',
    typicalAdultRange: '10-20 mg/day',
    availableStrengths: ['5 mg', '10 mg', '20 mg'],
    dosageForms: ['tablet', 'oral solution'],
  },
  fluvoxamine: { typicalAdultStartingDose: '25-50 mg/day', typicalAdultRange: '100-300 mg/day' },
  vilazodone: { typicalAdultStartingDose: '10 mg/day with food', typicalAdultRange: '20-40 mg/day' },
  vortioxetine: { typicalAdultStartingDose: '5-10 mg/day', typicalAdultRange: '10-20 mg/day' },
  venlafaxine: {
    typicalAdultStartingDose: '37.5-75 mg/day',
    typicalAdultRange: '75-225 mg/day',
    availableStrengths: ['25 mg', '37.5 mg', '50 mg', '75 mg', '100 mg', '150 mg', '225 mg'],
    dosageForms: ['tablet', 'extended-release capsule', 'extended-release tablet'],
  },
  desvenlafaxine: { typicalAdultStartingDose: '50 mg/day', typicalAdultRange: '50-100 mg/day' },
  duloxetine: { typicalAdultStartingDose: '30-60 mg/day', typicalAdultRange: '60-120 mg/day' },
  levomilnacipran: { typicalAdultStartingDose: '20 mg/day', typicalAdultRange: '40-120 mg/day' },
  bupropion: { typicalAdultStartingDose: '150 mg/day', typicalAdultRange: '150-450 mg/day' },
  trazodone: {
    typicalAdultStartingDose: '25-50 mg at bedtime for sleep or 150 mg/day for antidepressant use',
    typicalAdultRange: '50-400 mg/day depending on indication',
    availableStrengths: ['50 mg', '100 mg', '150 mg', '300 mg'],
    dosageForms: ['tablet'],
  },
  mirtazapine: { typicalAdultStartingDose: '7.5-15 mg at bedtime', typicalAdultRange: '15-45 mg/day' },
  clomipramine: { typicalAdultStartingDose: '25 mg/day', typicalAdultRange: '100-250 mg/day' },
  amitriptyline: { typicalAdultStartingDose: '10-25 mg at bedtime', typicalAdultRange: '25-150 mg/day' },
  nortriptyline: { typicalAdultStartingDose: '10-25 mg at bedtime', typicalAdultRange: '25-150 mg/day' },
  doxepin: { typicalAdultStartingDose: '3-10 mg at bedtime for insomnia or 25 mg/day for antidepressant use', typicalAdultRange: '3-150 mg/day depending on indication' },
  phenelzine: { typicalAdultStartingDose: '15 mg three times daily', typicalAdultRange: '45-90 mg/day' },
  tranylcypromine: { typicalAdultStartingDose: '10 mg twice daily', typicalAdultRange: '20-60 mg/day' },
  selegiline_transdermal: { typicalAdultStartingDose: '6 mg/24 hours patch', typicalAdultRange: '6-12 mg/24 hours' },
  esketamine: { typicalAdultStartingDose: '56 mg intranasal', typicalAdultRange: '56-84 mg per supervised treatment session', maxDoseNotes: 'REMS, blood pressure, dissociation, and observation requirements apply.' },
  lithium: {
    typicalAdultStartingDose: '300 mg one to three times daily',
    typicalAdultRange: '600-1800 mg/day in divided or ER dosing',
    maxDoseNotes: 'Dose should be guided by indication, serum level targets, renal function, and tolerability.',
    availableStrengths: ['150 mg', '300 mg', '450 mg'],
    dosageForms: ['capsule', 'tablet', 'extended-release tablet', 'oral solution'],
  },
  divalproex: {
    typicalAdultStartingDose: '250-500 mg/day',
    typicalAdultRange: '500-2000 mg/day',
    maxDoseNotes: 'Dose selection often depends on indication, level targets, and formulation.',
    availableStrengths: ['125 mg', '250 mg', '500 mg'],
    dosageForms: ['delayed-release tablet', 'extended-release tablet', 'sprinkle capsule'],
  },
  valproic_acid: { typicalAdultStartingDose: '250-500 mg/day', typicalAdultRange: '500-2000 mg/day', maxDoseNotes: 'Dose selection often depends on indication, level targets, and formulation.' },
  lamotrigine: { typicalAdultStartingDose: '25 mg/day', typicalAdultRange: '100-200 mg/day for many bipolar maintenance regimens', maxDoseNotes: 'Titration changes substantially with valproate or enzyme inducers.' },
  carbamazepine: { typicalAdultStartingDose: '100-200 mg twice daily', typicalAdultRange: '400-1200 mg/day' },
  oxcarbazepine: { typicalAdultStartingDose: '150-300 mg twice daily', typicalAdultRange: '600-2400 mg/day', maxDoseNotes: 'Dosing depends on indication, patient factors, interactions, and current prescribing references.' },
  topiramate: { typicalAdultStartingDose: '25 mg/day', typicalAdultRange: '50-400 mg/day depending on indication' },
  gabapentin: { typicalAdultStartingDose: '100-300 mg at night or three times daily', typicalAdultRange: '300-3600 mg/day depending on indication and renal function' },
  pregabalin: { typicalAdultStartingDose: '25-75 mg/day', typicalAdultRange: '75-600 mg/day depending on indication and renal function' },
  quetiapine: { typicalAdultStartingDose: '25-50 mg at bedtime or divided', typicalAdultRange: '50-800 mg/day depending on indication' },
  olanzapine: {
    typicalAdultStartingDose: '2.5-10 mg/day',
    typicalAdultRange: '5-20 mg/day',
    keyAdverseEffects: ['weight gain', 'sedation', 'increased appetite', 'dry mouth', 'metabolic adverse effects'],
  },
  risperidone: { typicalAdultStartingDose: '0.5-1 mg/day', typicalAdultRange: '1-6 mg/day' },
  paliperidone: { typicalAdultStartingDose: '3-6 mg/day', typicalAdultRange: '3-12 mg/day' },
  aripiprazole: {
    typicalAdultStartingDose: '2-10 mg/day depending on indication',
    typicalAdultRange: '5-30 mg/day',
    availableStrengths: ['2 mg', '5 mg', '10 mg', '15 mg', '20 mg', '30 mg'],
    dosageForms: ['tablet', 'orally disintegrating tablet', 'oral solution', 'injection'],
  },
  lurasidone: { typicalAdultStartingDose: '20-40 mg/day with food', typicalAdultRange: '20-160 mg/day' },
  ziprasidone: { typicalAdultStartingDose: '20 mg twice daily with food', typicalAdultRange: '40-160 mg/day' },
  clozapine: { typicalAdultStartingDose: '12.5 mg once or twice daily', typicalAdultRange: '100-900 mg/day', maxDoseNotes: 'Slow titration and REMS-related monitoring requirements apply.' },
  haloperidol: { typicalAdultStartingDose: '0.5-5 mg/day depending on use case', typicalAdultRange: '1-20 mg/day' },
  chlorpromazine: { typicalAdultStartingDose: '25-50 mg/day', typicalAdultRange: '100-800 mg/day' },
  perphenazine: { typicalAdultStartingDose: '4-8 mg/day', typicalAdultRange: '8-64 mg/day' },
  pimozide: { typicalAdultStartingDose: '1-2 mg/day', typicalAdultRange: '2-10 mg/day', maxDoseNotes: 'QT and interaction constraints require careful verification.' },
  methylphenidate: { typicalAdultStartingDose: '5-10 mg once or twice daily', typicalAdultRange: '10-60 mg/day depending on product' },
  dexmethylphenidate: { typicalAdultStartingDose: '2.5-5 mg/day', typicalAdultRange: '5-40 mg/day depending on product' },
  mixed_amphetamine_salts: { typicalAdultStartingDose: '5-10 mg/day', typicalAdultRange: '10-60 mg/day depending on product' },
  lisdexamfetamine: { typicalAdultStartingDose: '20-30 mg/day', typicalAdultRange: '30-70 mg/day' },
  dextroamphetamine: { typicalAdultStartingDose: '5 mg/day', typicalAdultRange: '5-40 mg/day depending on product' },
  atomoxetine: { typicalAdultStartingDose: '40 mg/day', typicalAdultRange: '40-100 mg/day' },
  guanfacine_er: { typicalAdultStartingDose: '1 mg/day', typicalAdultRange: '1-7 mg/day' },
  clonidine_er: { typicalAdultStartingDose: '0.1 mg at bedtime', typicalAdultRange: '0.1-0.4 mg/day' },
  alprazolam: { typicalAdultStartingDose: '0.25-0.5 mg/day', typicalAdultRange: '0.5-4 mg/day' },
  clonazepam: { typicalAdultStartingDose: '0.25-0.5 mg/day', typicalAdultRange: '0.5-4 mg/day' },
  lorazepam: { typicalAdultStartingDose: '0.5-1 mg per dose', typicalAdultRange: '0.5-6 mg/day depending on use case' },
  diazepam: { typicalAdultStartingDose: '2-5 mg per dose', typicalAdultRange: '2-40 mg/day depending on use case' },
  temazepam: { typicalAdultStartingDose: '7.5-15 mg at bedtime', typicalAdultRange: '7.5-30 mg at bedtime' },
  triazolam: { typicalAdultStartingDose: '0.125-0.25 mg at bedtime', typicalAdultRange: '0.125-0.5 mg at bedtime' },
  buspirone: { typicalAdultStartingDose: '5-7.5 mg twice daily', typicalAdultRange: '15-60 mg/day' },
  hydroxyzine: { typicalAdultStartingDose: '10-25 mg up to four times daily as needed', typicalAdultRange: '25-100 mg/day or higher depending on indication' },
  prazosin: { typicalAdultStartingDose: '1 mg at bedtime', typicalAdultRange: '1-15 mg/day depending on target symptom and tolerability' },
  zolpidem: { typicalAdultStartingDose: '5-10 mg at bedtime depending on product and patient factors', typicalAdultRange: '5-12.5 mg at bedtime depending on product' },
  eszopiclone: { typicalAdultStartingDose: '1 mg at bedtime', typicalAdultRange: '1-3 mg at bedtime' },
  zaleplon: { typicalAdultStartingDose: '5-10 mg at bedtime', typicalAdultRange: '5-20 mg at bedtime' },
  ramelteon: { typicalAdultStartingDose: '8 mg at bedtime', typicalAdultRange: '8 mg at bedtime' },
  suvorexant: { typicalAdultStartingDose: '10 mg at bedtime', typicalAdultRange: '5-20 mg at bedtime' },
  lemborexant: { typicalAdultStartingDose: '5 mg at bedtime', typicalAdultRange: '5-10 mg at bedtime' },
  daridorexant: { typicalAdultStartingDose: '25-50 mg at bedtime', typicalAdultRange: '25-50 mg at bedtime' },
  naltrexone: { typicalAdultStartingDose: '25-50 mg/day', typicalAdultRange: '50 mg/day oral or long-acting injection per product guidance' },
  acamprosate: { typicalAdultStartingDose: '666 mg three times daily', typicalAdultRange: '666 mg three times daily', maxDoseNotes: 'Renal adjustment is required in reduced kidney function.' },
  disulfiram: { typicalAdultStartingDose: '250 mg/day', typicalAdultRange: '250-500 mg/day' },
  buprenorphine_naloxone: { typicalAdultStartingDose: 'Product- and induction-specific', typicalAdultRange: 'Induction and maintenance require product-specific verification' },
  buprenorphine: { typicalAdultStartingDose: 'Product- and indication-specific', typicalAdultRange: 'Maintenance range depends on formulation and indication' },
  methadone: { typicalAdultStartingDose: 'Highly setting- and indication-specific', typicalAdultRange: 'Requires specialized verification and QT-risk review' },
  varenicline: { typicalAdultStartingDose: '0.5 mg/day', typicalAdultRange: '1 mg twice daily after titration' },
  aripiprazole_monohydrate_lai: { typicalAdultStartingDose: 'Product-specific loading schedule', typicalAdultRange: 'Injection interval depends on product guidance' },
  aripiprazole_lauroxil: { typicalAdultStartingDose: 'Product-specific loading schedule', typicalAdultRange: 'Injection interval depends on product guidance' },
  risperidone_lai: { typicalAdultStartingDose: 'Product-specific loading schedule', typicalAdultRange: 'Injection interval depends on product guidance' },
  paliperidone_palmitate_lai: { typicalAdultStartingDose: 'Product-specific loading schedule', typicalAdultRange: 'Monthly or longer interval depending on product' },
  olanzapine_pamoate_lai: { typicalAdultStartingDose: 'Product-specific dosing', typicalAdultRange: 'Injection interval depends on product guidance', maxDoseNotes: 'Post-injection observation requirements apply.' },
  haloperidol_decanoate: { typicalAdultStartingDose: 'Conversion from oral regimen is required', typicalAdultRange: 'Dose and interval are product and patient specific' },
  fluphenazine_decanoate: { typicalAdultStartingDose: 'Conversion from oral regimen is required', typicalAdultRange: 'Dose and interval are product and patient specific' },
};

type SupplementalMedicationProfile = Omit<PsychMedicationProfile, 'availableStrengths' | 'dosageForms'> & {
  availableStrengths?: string[];
  dosageForms?: string[];
};

const SUPPLEMENTAL_MEDICATIONS: SupplementalMedicationProfile[] = [
  {
    id: 'clonidine',
    genericName: 'clonidine',
    brandNames: ['Catapres', 'Kapvay'],
    aliases: ['clonidine ir', 'catapres'],
    class: 'Adrenergic medication',
    subclass: 'alpha2_agonist',
    commonUses: ['anxiety or hyperarousal adjunct', 'ADHD adjunct', 'sleep-related hyperarousal', 'withdrawal symptom support'],
    typicalAdultStartingDose: '0.05-0.1 mg at bedtime or twice daily',
    typicalAdultRange: '0.1-0.6 mg/day depending on indication and formulation',
    routeForms: ['oral tablet', 'transdermal patch'],
    keyAdverseEffects: ['sedation', 'hypotension', 'bradycardia', 'dry mouth'],
    highRiskWarnings: ['Abrupt discontinuation may cause rebound hypertension'],
    majorContraindicationsOrCautions: ['Use caution with baseline hypotension, bradycardia, and other sedatives'],
    monitoring: ['Monitor blood pressure, pulse, and sedation'],
    highYieldInteractions: ['Other antihypertensives', 'Other sedatives'],
    specialPopulations: {
      geriatric: 'Sedation, falls, and hypotension may be more pronounced.',
      renal: 'Dose adjustment or slower titration may be needed in reduced kidney function.',
    },
    clinicalPearls: ['Immediate-release and extended-release products are not interchangeable.'],
    documentationPearls: ['Document formulation and target symptom because IR and ER clonidine are used differently.'],
    verificationRequiredFor: ['dosing', 'tapering', 'formulation conversion', 'blood-pressure questions'],
  },
  {
    id: 'guanfacine',
    genericName: 'guanfacine',
    brandNames: ['Tenex', 'Intuniv'],
    aliases: ['guanfacine ir', 'tenex'],
    class: 'Adrenergic medication',
    subclass: 'alpha2_agonist',
    commonUses: ['ADHD', 'impulsivity or hyperarousal adjunct', 'sleep-related hyperarousal'],
    typicalAdultStartingDose: '0.5-1 mg at bedtime',
    typicalAdultRange: '1-4 mg/day depending on formulation and indication',
    routeForms: ['oral tablet', 'extended-release tablet'],
    keyAdverseEffects: ['sedation', 'hypotension', 'dizziness', 'dry mouth'],
    highRiskWarnings: ['Abrupt discontinuation may cause rebound hypertension'],
    majorContraindicationsOrCautions: ['Use caution with bradycardia, hypotension, and other sedatives'],
    monitoring: ['Monitor blood pressure, pulse, and sedation'],
    highYieldInteractions: ['Other antihypertensives', 'Other sedatives'],
    specialPopulations: {
      pediatric: 'Often used in ADHD, but formulation-specific titration matters.',
      geriatric: 'Sedation and orthostasis may be more problematic.',
    },
    clinicalPearls: ['Immediate-release and extended-release guanfacine are not interchangeable.'],
    documentationPearls: ['Document formulation and target symptom rather than using generic guanfacine wording.'],
    verificationRequiredFor: ['dosing', 'formulation conversion', 'pediatric use', 'tapering'],
  },
  {
    id: 'propranolol',
    genericName: 'propranolol',
    brandNames: ['Inderal', 'InnoPran XL'],
    aliases: ['inderal'],
    class: 'Beta-blocker',
    subclass: 'beta_blocker',
    commonUses: ['akathisia support', 'performance anxiety', 'tremor support'],
    typicalAdultStartingDose: '10-20 mg once to three times daily',
    typicalAdultRange: '10-120 mg/day depending on indication',
    routeForms: ['oral tablet or capsule', 'extended-release capsule'],
    keyAdverseEffects: ['bradycardia', 'hypotension', 'fatigue', 'depression or vivid dreams in some patients'],
    highRiskWarnings: ['Can mask hypoglycemia and worsen bronchospasm in susceptible patients'],
    majorContraindicationsOrCautions: ['Use caution in asthma, bradycardia, hypotension, or decompensated heart failure'],
    monitoring: ['Monitor pulse, blood pressure, dizziness, and target symptom response'],
    highYieldInteractions: ['Other blood-pressure-lowering agents', 'Sedatives when falls risk is relevant'],
    specialPopulations: {
      geriatric: 'Falls, bradycardia, and orthostasis may be more clinically significant.',
      hepatic: 'Hepatic impairment may increase exposure.',
    },
    clinicalPearls: ['Often used in psychiatry for akathisia or performance anxiety rather than primary cardiac indications.'],
    documentationPearls: ['Document the specific target symptom such as akathisia or tremor.'],
    verificationRequiredFor: ['dosing', 'cardiopulmonary contraindications', 'interaction checks'],
  },
  {
    id: 'melatonin',
    genericName: 'melatonin',
    brandNames: ['Melatonin'],
    aliases: [],
    class: 'Sleep medication',
    subclass: 'melatonin_agent',
    commonUses: ['sleep onset support', 'circadian rhythm support'],
    typicalAdultStartingDose: '1-3 mg at bedtime',
    typicalAdultRange: '1-10 mg at bedtime depending on product and use case',
    routeForms: ['oral tablet, capsule, liquid, or gummy'],
    keyAdverseEffects: ['daytime sedation', 'vivid dreams', 'headache', 'dizziness'],
    highRiskWarnings: ['Product quality and content consistency may vary across supplements'],
    majorContraindicationsOrCautions: ['Use caution with heavy daytime sedation and with anticoagulants when clinically relevant'],
    monitoring: ['Monitor sleep timing, daytime sedation, and target symptom response'],
    highYieldInteractions: ['Other sedatives', 'Anticoagulants when bleeding risk is a concern'],
    specialPopulations: {
      geriatric: 'May still contribute to morning sedation or falls in susceptible patients.',
      hepatic: 'Use caution if severe hepatic impairment is present.',
    },
    clinicalPearls: ['Timing can matter as much as dose for circadian complaints.'],
    documentationPearls: ['Document the target sleep problem because melatonin may help timing more than sleep maintenance.'],
    verificationRequiredFor: ['product-specific dosing', 'supplement quality questions', 'pregnancy'],
  },
  {
    id: 'nicotine_patch',
    genericName: 'nicotine transdermal patch',
    brandNames: ['Nicoderm CQ'],
    aliases: ['nicotine patch'],
    class: 'Smoking cessation medication',
    subclass: 'nicotine_replacement',
    commonUses: ['tobacco cessation'],
    typicalAdultStartingDose: 'Patch strength depends on baseline tobacco exposure',
    typicalAdultRange: 'Single-patch or combination NRT strategies are product specific',
    routeForms: ['transdermal patch'],
    keyAdverseEffects: ['skin irritation', 'vivid dreams', 'nausea', 'insomnia'],
    highRiskWarnings: ['Nicotine toxicity can occur if multiple products are stacked without intent or review'],
    majorContraindicationsOrCautions: ['Use caution with significant skin sensitivity and duplicated nicotine products'],
    monitoring: ['Monitor quit progress, skin irritation, sleep disruption, and total nicotine exposure'],
    highYieldInteractions: ['Other nicotine replacement products'],
    specialPopulations: {
      pregnancy: 'Use should be individualized and verified with current references.',
    },
    clinicalPearls: ['Patch plus short-acting nicotine replacement may be intentional rather than duplicative.'],
    documentationPearls: ['Document whether combination nicotine replacement is planned or accidental.'],
    verificationRequiredFor: ['dose selection', 'combination NRT use', 'pregnancy', 'cardiovascular questions'],
  },
  {
    id: 'nicotine_gum',
    genericName: 'nicotine gum',
    brandNames: ['Nicorette'],
    aliases: ['nicotine gum'],
    class: 'Smoking cessation medication',
    subclass: 'nicotine_replacement',
    commonUses: ['tobacco cessation', 'breakthrough craving support'],
    typicalAdultStartingDose: '2-4 mg per piece depending on baseline tobacco exposure',
    typicalAdultRange: 'Use pattern depends on craving frequency and total nicotine plan',
    routeForms: ['oral gum'],
    keyAdverseEffects: ['mouth irritation', 'hiccups', 'nausea', 'jaw discomfort'],
    highRiskWarnings: ['Nicotine toxicity can occur if multiple products are stacked without intent or review'],
    majorContraindicationsOrCautions: ['Use caution with TMJ issues or accidental overuse'],
    monitoring: ['Monitor craving response, local irritation, and total nicotine exposure'],
    highYieldInteractions: ['Other nicotine replacement products'],
    specialPopulations: {},
    clinicalPearls: ['Chew-and-park technique affects tolerability and absorption.'],
    documentationPearls: ['Document whether it is stand-alone or adjunctive to a patch.'],
    verificationRequiredFor: ['dose selection', 'combination NRT use', 'pregnancy'],
  },
  {
    id: 'nicotine_lozenge',
    genericName: 'nicotine lozenge',
    brandNames: ['Commit', 'Nicorette lozenge'],
    aliases: ['nicotine lozenge'],
    class: 'Smoking cessation medication',
    subclass: 'nicotine_replacement',
    commonUses: ['tobacco cessation', 'breakthrough craving support'],
    typicalAdultStartingDose: '2-4 mg per lozenge depending on baseline tobacco exposure',
    typicalAdultRange: 'Use pattern depends on craving frequency and total nicotine plan',
    routeForms: ['oral lozenge'],
    keyAdverseEffects: ['nausea', 'hiccups', 'throat irritation', 'heartburn'],
    highRiskWarnings: ['Nicotine toxicity can occur if multiple products are stacked without intent or review'],
    majorContraindicationsOrCautions: ['Use caution with frequent GI upset or accidental overuse'],
    monitoring: ['Monitor craving response, GI effects, and total nicotine exposure'],
    highYieldInteractions: ['Other nicotine replacement products'],
    specialPopulations: {},
    clinicalPearls: ['Patients may unintentionally exceed recommended frequency when craving is high.'],
    documentationPearls: ['Document whether it is stand-alone or adjunctive to a patch.'],
    verificationRequiredFor: ['dose selection', 'combination NRT use', 'pregnancy'],
  },
  {
    id: 'donepezil',
    genericName: 'donepezil',
    brandNames: ['Aricept'],
    aliases: ['aricept'],
    class: 'Cognitive medication',
    subclass: 'acetylcholinesterase_inhibitor',
    commonUses: ['major neurocognitive disorder due to Alzheimer disease'],
    typicalAdultStartingDose: '5 mg at bedtime',
    typicalAdultRange: '5-10 mg/day; some patients use 23 mg/day extended-release',
    routeForms: ['oral tablet', 'orally disintegrating tablet'],
    keyAdverseEffects: ['nausea', 'diarrhea', 'bradycardia', 'vivid dreams'],
    highRiskWarnings: ['Syncope and bradycardia risk can be clinically important'],
    majorContraindicationsOrCautions: ['Use caution with conduction disease, falls risk, and significant weight loss'],
    monitoring: ['Monitor cognition or function trend, pulse, GI tolerance, and weight'],
    highYieldInteractions: ['Other bradycardia-promoting agents', 'Anticholinergic medications that may oppose effect'],
    specialPopulations: {
      geriatric: 'Falls, bradycardia, weight loss, and syncope deserve attention.',
      hepatic: 'Severe hepatic questions should be verified with current references.',
    },
    clinicalPearls: ['Nighttime dosing can worsen vivid dreams for some patients.'],
    documentationPearls: ['Document observed cognition/function trajectory rather than promising cognitive improvement.'],
    verificationRequiredFor: ['dosing', 'geriatric falls questions', 'bradycardia risk', 'interaction checks'],
  },
  {
    id: 'rivastigmine',
    genericName: 'rivastigmine',
    brandNames: ['Exelon'],
    aliases: ['exelon'],
    class: 'Cognitive medication',
    subclass: 'acetylcholinesterase_inhibitor',
    commonUses: ['major neurocognitive disorder due to Alzheimer disease', 'Parkinson disease dementia'],
    typicalAdultStartingDose: '1.5 mg twice daily oral or low-dose patch',
    typicalAdultRange: '3-12 mg/day oral or product-specific patch strengths',
    routeForms: ['oral capsule or solution', 'transdermal patch'],
    keyAdverseEffects: ['nausea', 'vomiting', 'weight loss', 'bradycardia'],
    highRiskWarnings: ['Bradycardia, syncope, and dehydration risk may be clinically important'],
    majorContraindicationsOrCautions: ['Use caution with frailty, low weight, and conduction disease'],
    monitoring: ['Monitor pulse, weight, GI tolerance, and patch-site reactions when relevant'],
    highYieldInteractions: ['Other bradycardia-promoting agents', 'Anticholinergics'],
    specialPopulations: {
      geriatric: 'Frailty, weight loss, and falls risk deserve attention.',
    },
    clinicalPearls: ['Patch formulations may be better tolerated gastrointestinally for some patients.'],
    documentationPearls: ['Document formulation because oral and patch use patterns differ.'],
    verificationRequiredFor: ['dosing', 'formulation conversion', 'weight-loss risk', 'interaction checks'],
  },
  {
    id: 'galantamine',
    genericName: 'galantamine',
    brandNames: ['Razadyne'],
    aliases: ['razadyne'],
    class: 'Cognitive medication',
    subclass: 'acetylcholinesterase_inhibitor',
    commonUses: ['major neurocognitive disorder due to Alzheimer disease'],
    typicalAdultStartingDose: '4 mg twice daily or 8 mg extended-release daily',
    typicalAdultRange: '8-24 mg/day depending on formulation',
    routeForms: ['oral tablet', 'oral solution', 'extended-release capsule'],
    keyAdverseEffects: ['nausea', 'diarrhea', 'dizziness', 'bradycardia'],
    highRiskWarnings: ['Syncope and bradycardia risk can be clinically important'],
    majorContraindicationsOrCautions: ['Use caution with conduction disease and lower body weight'],
    monitoring: ['Monitor cognition/function trend, pulse, and GI tolerance'],
    highYieldInteractions: ['Other bradycardia-promoting agents', 'Strong CYP inhibitors or inducers when relevant'],
    specialPopulations: {
      renal: 'Moderate to severe renal impairment requires verification.',
      hepatic: 'Moderate to severe hepatic impairment requires verification.',
    },
    clinicalPearls: ['Formulation-specific titration matters.'],
    documentationPearls: ['Document functional goals and tolerability rather than claiming disease modification.'],
    verificationRequiredFor: ['dosing', 'renal/hepatic impairment', 'interaction checks'],
  },
  {
    id: 'memantine',
    genericName: 'memantine',
    brandNames: ['Namenda'],
    aliases: ['namenda'],
    class: 'Cognitive medication',
    subclass: 'nmda_receptor_antagonist',
    commonUses: ['major neurocognitive disorder due to Alzheimer disease'],
    typicalAdultStartingDose: '5 mg/day',
    typicalAdultRange: '10 mg twice daily or 28 mg extended-release daily',
    routeForms: ['oral tablet', 'oral solution', 'extended-release capsule'],
    keyAdverseEffects: ['dizziness', 'headache', 'constipation', 'confusion'],
    highRiskWarnings: ['Renal impairment can alter exposure'],
    majorContraindicationsOrCautions: ['Use caution with reduced kidney function and with dizziness/falls risk'],
    monitoring: ['Monitor cognition/function trend, dizziness, bowel function, and renal status when relevant'],
    highYieldInteractions: ['Other NMDA-affecting or alkalinizing regimens when clinically relevant'],
    specialPopulations: {
      renal: 'Dose verification is needed in moderate to severe renal impairment.',
      geriatric: 'Dizziness and falls risk remain clinically relevant.',
    },
    clinicalPearls: ['Often used in later-stage cognitive symptom management rather than rapid symptomatic rescue.'],
    documentationPearls: ['Document functional goals and tolerability rather than promising clear cognitive improvement.'],
    verificationRequiredFor: ['dosing', 'renal impairment', 'combination therapy questions'],
  },
  {
    id: 'benztropine',
    genericName: 'benztropine',
    brandNames: ['Cogentin'],
    aliases: ['cogentin'],
    class: 'EPS treatment medication',
    subclass: 'anticholinergic_eps_treatment',
    commonUses: ['drug-induced parkinsonism', 'acute dystonia support'],
    typicalAdultStartingDose: '0.5-1 mg once or twice daily',
    typicalAdultRange: '1-6 mg/day depending on indication',
    routeForms: ['oral tablet', 'intramuscular or intravenous injection'],
    keyAdverseEffects: ['dry mouth', 'constipation', 'urinary retention', 'confusion'],
    highRiskWarnings: ['Anticholinergic burden can worsen delirium, constipation, glaucoma, or urinary retention'],
    majorContraindicationsOrCautions: ['Use caution in older adults, delirium, constipation, glaucoma, and urinary retention'],
    monitoring: ['Monitor target EPS response and anticholinergic adverse effects'],
    highYieldInteractions: ['Other anticholinergics', 'Constipating regimens', 'Cognitive medications'],
    specialPopulations: {
      geriatric: 'Confusion, delirium, constipation, and falls risk may increase.',
    },
    clinicalPearls: ['Often helpful for dystonia or parkinsonism but not reliably for akathisia.'],
    documentationPearls: ['Document the exact EPS target rather than using generic side-effect wording.'],
    verificationRequiredFor: ['dosing', 'delirium risk', 'anticholinergic burden review'],
  },
  {
    id: 'diphenhydramine',
    genericName: 'diphenhydramine',
    brandNames: ['Benadryl'],
    aliases: ['benadryl'],
    class: 'EPS treatment medication',
    subclass: 'antihistamine_anticholinergic',
    commonUses: ['acute dystonia support', 'sedation adjunct', 'allergy symptoms'],
    typicalAdultStartingDose: '25-50 mg per dose',
    typicalAdultRange: '25-100 mg/day or more depending on indication',
    routeForms: ['oral capsule or liquid', 'intramuscular or intravenous injection'],
    keyAdverseEffects: ['sedation', 'dry mouth', 'confusion', 'urinary retention'],
    highRiskWarnings: ['Anticholinergic burden and falls risk may be clinically significant'],
    majorContraindicationsOrCautions: ['Use caution in older adults, delirium, glaucoma, urinary retention, and constipation'],
    monitoring: ['Monitor sedation, delirium risk, and anticholinergic adverse effects'],
    highYieldInteractions: ['Other sedatives', 'Other anticholinergics'],
    specialPopulations: {
      geriatric: 'Anticholinergic burden, delirium, and falls risk are significant concerns.',
    },
    clinicalPearls: ['Can relieve acute dystonia but may worsen delirium or confusion.'],
    documentationPearls: ['Document the target problem, especially when using it for EPS rather than allergy symptoms.'],
    verificationRequiredFor: ['dosing', 'older-adult use', 'anticholinergic burden review'],
  },
  {
    id: 'amantadine',
    genericName: 'amantadine',
    brandNames: ['Gocovri', 'Osmolex ER'],
    aliases: [],
    class: 'EPS treatment medication',
    subclass: 'dopaminergic_eps_treatment',
    commonUses: ['drug-induced parkinsonism', 'movement symptom adjunct'],
    typicalAdultStartingDose: '100 mg once or twice daily',
    typicalAdultRange: '100-300 mg/day depending on formulation and indication',
    routeForms: ['oral capsule or tablet', 'extended-release product'],
    keyAdverseEffects: ['dizziness', 'insomnia', 'confusion', 'livedo reticularis'],
    highRiskWarnings: ['Can worsen psychosis or confusion in susceptible patients'],
    majorContraindicationsOrCautions: ['Use caution in psychosis, delirium, and renal impairment'],
    monitoring: ['Monitor mental status, target symptom response, and renal function when relevant'],
    highYieldInteractions: ['Other activating or dopaminergic medications'],
    specialPopulations: {
      renal: 'Dose adjustment may be required in reduced kidney function.',
      geriatric: 'Confusion and hallucinations may be more likely.',
    },
    clinicalPearls: ['May help some parkinsonian symptoms but can worsen psychosis or confusion.'],
    documentationPearls: ['Document whether the clinical question is EPS relief versus delirium or psychosis risk.'],
    verificationRequiredFor: ['dosing', 'renal impairment', 'psychosis risk questions'],
  },
  {
    id: 'valbenazine',
    genericName: 'valbenazine',
    brandNames: ['Ingrezza'],
    aliases: ['ingrezza'],
    class: 'EPS treatment medication',
    subclass: 'vmat2_inhibitor',
    commonUses: ['tardive dyskinesia'],
    typicalAdultStartingDose: '40 mg/day',
    typicalAdultRange: '40-80 mg/day',
    routeForms: ['oral capsule'],
    keyAdverseEffects: ['somnolence', 'akathisia', 'dry mouth', 'QT concern in selected contexts'],
    highRiskWarnings: ['Somnolence and QT-risk review may be relevant depending on the patient and regimen'],
    majorContraindicationsOrCautions: ['Use caution with strong CYP interactions and QT-risk stacking'],
    monitoring: ['Monitor tardive symptom response, sedation, and interaction burden'],
    highYieldInteractions: ['Strong CYP inhibitors or inducers', 'QT-prolonging agents when relevant'],
    specialPopulations: {
      hepatic: 'Hepatic impairment may require verification.',
    },
    clinicalPearls: ['Improvement may be gradual rather than immediate.'],
    documentationPearls: ['Document the abnormal movement target and response trend.'],
    verificationRequiredFor: ['dosing', 'hepatic impairment', 'QT-risk review', 'interaction checks'],
  },
  {
    id: 'deutetrabenazine',
    genericName: 'deutetrabenazine',
    brandNames: ['Austedo'],
    aliases: ['austedo'],
    class: 'EPS treatment medication',
    subclass: 'vmat2_inhibitor',
    commonUses: ['tardive dyskinesia', 'Huntington chorea'],
    typicalAdultStartingDose: '6 mg twice daily or product-specific once-daily product guidance',
    typicalAdultRange: '12-48 mg/day depending on formulation and indication',
    routeForms: ['oral tablet', 'extended-release tablet'],
    keyAdverseEffects: ['somnolence', 'depression', 'akathisia', 'parkinsonism'],
    highRiskWarnings: ['Depression or suicidality concerns require caution in susceptible populations'],
    majorContraindicationsOrCautions: ['Use caution with hepatic impairment, depression risk, and strong CYP2D6 interactions'],
    monitoring: ['Monitor movement symptom response, mood, sedation, and interaction burden'],
    highYieldInteractions: ['Strong CYP2D6 inhibitors', 'Other QT-prolonging agents when relevant'],
    specialPopulations: {
      hepatic: 'Use in hepatic impairment requires current-reference verification.',
    },
    clinicalPearls: ['Different formulations are not interchangeable without checking current product guidance.'],
    documentationPearls: ['Document target abnormal movement and mood history when relevant.'],
    verificationRequiredFor: ['dosing', 'hepatic impairment', 'mood-risk review', 'interaction checks'],
  },
  {
    id: 'trihexyphenidyl',
    genericName: 'trihexyphenidyl',
    brandNames: ['Artane'],
    aliases: ['artane'],
    class: 'EPS treatment medication',
    subclass: 'anticholinergic_eps_treatment',
    commonUses: ['drug-induced parkinsonism'],
    typicalAdultStartingDose: '1 mg/day',
    typicalAdultRange: '2-15 mg/day depending on indication and tolerance',
    routeForms: ['oral tablet', 'oral elixir'],
    keyAdverseEffects: ['dry mouth', 'constipation', 'blurred vision', 'confusion'],
    highRiskWarnings: ['Anticholinergic burden can worsen delirium, constipation, glaucoma, or urinary retention'],
    majorContraindicationsOrCautions: ['Use caution in older adults, delirium, glaucoma, urinary retention, and constipation'],
    monitoring: ['Monitor target EPS response and anticholinergic adverse effects'],
    highYieldInteractions: ['Other anticholinergics', 'Constipating regimens'],
    specialPopulations: {
      geriatric: 'Confusion and anticholinergic burden may be more problematic.',
    },
    clinicalPearls: ['Useful for parkinsonian symptoms but not reliably for akathisia.'],
    documentationPearls: ['Document the exact EPS target and anticholinergic burden.'],
    verificationRequiredFor: ['dosing', 'older-adult use', 'anticholinergic burden review'],
  },
];

function unique(items: (string | undefined)[]) {
  return [...new Set(items.filter(Boolean).map((item) => item!.trim()).filter(Boolean))];
}

function sentenceCase(text: string) {
  return text.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildRouteForms(entry: PsychMedicationEntry) {
  if (entry.id === 'esketamine') {
    return ['intranasal supervised administration'];
  }

  if (entry.id === 'selegiline_transdermal') {
    return ['transdermal patch'];
  }

  if (entry.id === 'buprenorphine_naloxone') {
    return ['sublingual film or tablet'];
  }

  if (entry.isLai) {
    return ['intramuscular long-acting injection'];
  }

  const subclassDefaults = entry.subclass ? SUBCLASS_DEFAULTS[entry.subclass]?.routeForms : undefined;
  if (subclassDefaults?.length) {
    return subclassDefaults;
  }

  if (entry.categories.includes('hypnotic-sedative') || entry.categories.includes('antidepressant')) {
    return ['oral tablet or capsule'];
  }

  return ['oral formulation'];
}

function buildSpecialPopulations(entry: PsychMedicationEntry) {
  const special: PsychMedicationProfile['specialPopulations'] = {};

  if (entry.pregnancyRisk !== 'unknown') {
    special.pregnancy = sentenceCase(entry.pregnancyRisk);
  }

  if (entry.lactationSummary) {
    special.lactation = entry.lactationSummary;
  }

  if (entry.renalConsiderations) {
    special.renal = entry.renalConsiderations;
  }

  if (entry.hepaticConsiderations) {
    special.hepatic = entry.hepaticConsiderations;
  }

  if (entry.categories.includes('antipsychotic') || entry.categories.includes('anxiolytic')) {
    special.geriatric = 'Sedation, falls, anticholinergic burden, or delirium risk may be more clinically important in older adults depending on the agent.';
  } else if (entry.categories.includes('antidepressant')) {
    special.geriatric = 'Hyponatremia, falls, bleeding risk, or QT concerns may deserve closer review in older adults depending on the agent.';
  }

  if (entry.categories.includes('stimulant') || entry.categories.includes('non-stimulant-adhd')) {
    special.pediatric = 'Pediatric dosing and monitoring should be verified against current references and the specific formulation.';
  }

  return special;
}

function buildWarnings(entry: PsychMedicationEntry) {
  const subclassWarnings = entry.subclass ? SUBCLASS_DEFAULTS[entry.subclass]?.highRiskWarnings ?? [] : [];
  return unique([
    ...subclassWarnings,
    ...entry.highRiskFlags.map((flag) => FLAG_WARNINGS[flag]),
    'Verify major interactions, patient factors, and current prescribing references before using this information for a real patient.',
  ]);
}

function buildAdverseEffects(entry: PsychMedicationEntry) {
  const subclassAdverse = entry.subclass ? SUBCLASS_DEFAULTS[entry.subclass]?.keyAdverseEffects ?? [] : [];
  return unique([
    ...entry.commonAdverseEffects,
    ...entry.highRiskAdverseEffects,
    ...subclassAdverse,
    'agent-specific adverse effects vary and should be verified if the question is high risk',
  ]);
}

function buildMonitoring(entry: PsychMedicationEntry) {
  const subclassMonitoring = entry.subclass ? SUBCLASS_DEFAULTS[entry.subclass]?.monitoring ?? [] : [];
  const seedMonitoring = entry.monitoring.map((item) => item.label);
  return unique([
    ...subclassMonitoring,
    ...seedMonitoring,
    'Monitor response, tolerability, and clinically relevant safety concerns for the specific agent.',
  ]);
}

function buildCautions(entry: PsychMedicationEntry) {
  const subclassCautions = entry.subclass ? SUBCLASS_DEFAULTS[entry.subclass]?.majorContraindicationsOrCautions ?? [] : [];
  return unique([
    ...subclassCautions,
    entry.blackBoxSummary,
    entry.highRiskFlags.includes('renal_risk') ? 'Renal impairment may require dose verification.' : undefined,
    entry.highRiskFlags.includes('hepatic_risk') ? 'Hepatic impairment may require dose verification.' : undefined,
  ]);
}

function buildInteractions(entry: PsychMedicationEntry) {
  const subclassInteractions = entry.subclass ? SUBCLASS_DEFAULTS[entry.subclass]?.highYieldInteractions ?? [] : [];
  const seedInteractions = entry.interactionRules.flatMap((rule) => [
    ...(rule.withMedicationNames ?? []),
    ...(rule.withClasses ?? []),
  ]);
  return unique([
    ...subclassInteractions,
    ...seedInteractions,
    entry.highRiskFlags.includes('serotonergic') ? 'Other serotonergic agents' : undefined,
    entry.highRiskFlags.includes('qt_risk') || entry.highRiskFlags.includes('qt_risk_high') ? 'QT-prolonging agents' : undefined,
    entry.highRiskFlags.includes('seizure_risk') ? 'Other seizure-threshold-lowering medications' : undefined,
  ]);
}

function buildClinicalPearls(entry: PsychMedicationEntry) {
  const subclassPearls = entry.subclass ? SUBCLASS_DEFAULTS[entry.subclass]?.clinicalPearls ?? [] : [];
  return unique([
    ...subclassPearls,
    ...(entry.notesForDocumentation ?? []),
    entry.isLai ? 'Missed-dose guidance is product specific and should be verified.' : undefined,
    entry.id === 'clozapine' ? 'Constipation and myocarditis review should be proactive, not only reactive.' : undefined,
  ]);
}

function buildDocumentationPearls(entry: PsychMedicationEntry) {
  const subclassPearls = entry.subclass ? SUBCLASS_DEFAULTS[entry.subclass]?.documentationPearls ?? [] : [];
  return unique([
    ...subclassPearls,
    'Keep the answer source-faithful and avoid turning medication information into patient-specific orders.',
    entry.isLai ? 'Document the exact LAI formulation if known because schedules are product specific.' : undefined,
  ]);
}

function buildVerification(entry: PsychMedicationEntry) {
  const subclassVerification = entry.subclass ? SUBCLASS_DEFAULTS[entry.subclass]?.verificationRequiredFor ?? [] : [];
  return unique([
    ...subclassVerification,
    'dosing',
    'drug interactions',
    'pregnancy or lactation',
    'renal or hepatic impairment',
  ]);
}

function buildProfile(entry: PsychMedicationEntry): PsychMedicationProfile {
  const defaults = entry.subclass ? SUBCLASS_DEFAULTS[entry.subclass] ?? {} : {};
  const overrides = DOSE_OVERRIDES[entry.id] ?? {};

  return {
    id: entry.id,
    genericName: entry.genericName,
    brandNames: entry.brandNames,
    aliases: unique([entry.displayName, ...entry.commonAliases, ...entry.commonAbbreviations]),
    class: CLASS_LABELS[entry.subclass ?? ''] || sentenceCase(entry.classFamily || entry.seedPrimaryClass || 'Psych medication'),
    subclass: entry.subclass,
    commonUses: entry.indications,
    typicalAdultStartingDose: overrides.typicalAdultStartingDose,
    typicalAdultRange: overrides.typicalAdultRange,
    maxDoseNotes: overrides.maxDoseNotes,
    availableStrengths: overrides.availableStrengths ?? [],
    dosageForms: overrides.dosageForms ?? overrides.routeForms ?? buildRouteForms(entry),
    routeForms: overrides.routeForms ?? buildRouteForms(entry),
    keyAdverseEffects: unique([...(overrides.keyAdverseEffects ?? buildAdverseEffects(entry))]),
    highRiskWarnings: unique([...(overrides.highRiskWarnings ?? buildWarnings(entry))]),
    majorContraindicationsOrCautions: overrides.majorContraindicationsOrCautions ?? buildCautions(entry),
    monitoring: unique([...(overrides.monitoring ?? buildMonitoring(entry))]),
    highYieldInteractions: overrides.highYieldInteractions ?? buildInteractions(entry),
    specialPopulations: buildSpecialPopulations(entry),
    clinicalPearls: overrides.clinicalPearls ?? buildClinicalPearls(entry),
    documentationPearls: overrides.documentationPearls ?? buildDocumentationPearls(entry),
    verificationRequiredFor: overrides.verificationRequiredFor ?? buildVerification(entry),
  };
}

const SEED_PROFILES = listPsychMedications().map(buildProfile);

export const PSYCH_MEDICATION_LIBRARY: PsychMedicationProfile[] = [...SEED_PROFILES, ...SUPPLEMENTAL_MEDICATIONS].map((profile) => ({
  ...profile,
  availableStrengths: profile.availableStrengths ?? [],
  dosageForms: profile.dosageForms ?? profile.routeForms ?? ['oral formulation'],
}));

export const PSYCH_MEDICATION_LIBRARY_BY_ID = new Map(
  PSYCH_MEDICATION_LIBRARY.map((profile) => [profile.id, profile]),
);

export const PSYCH_MEDICATION_LOOKUP_TERMS = new Map<string, PsychMedicationProfile>();

for (const profile of PSYCH_MEDICATION_LIBRARY) {
  for (const term of unique([profile.id, profile.genericName, ...profile.brandNames, ...(profile.aliases ?? [])])) {
    PSYCH_MEDICATION_LOOKUP_TERMS.set(term.toLowerCase(), profile);
  }
}

export const PSYCH_MEDICATION_CLASSES = unique(PSYCH_MEDICATION_LIBRARY.map((profile) => profile.class)).sort();
