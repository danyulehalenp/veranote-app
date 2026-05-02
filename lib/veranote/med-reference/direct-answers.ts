import { normalizeMedReferenceText } from '@/lib/veranote/med-reference/psych-meds';
import type { MedReferenceSource } from '@/lib/veranote/med-reference/types';

export type DirectMedicationAnswerLane =
  | 'approval_indication'
  | 'adverse_effect_yes_no'
  | 'interaction_safety'
  | 'medication_safety_reference'
  | 'geriatric_reference'
  | 'monitoring_reference'
  | 'urgent_protocol_reference'
  | 'substance_reference';

export type DirectMedicationReferenceAnswer = {
  id: string;
  lane: DirectMedicationAnswerLane;
  topic: string;
  text: string;
  sourceRefs: MedReferenceSource[];
};

type DirectMedicationReferenceEntry = DirectMedicationReferenceAnswer & {
  matches: (normalizedPrompt: string) => boolean;
};

const DAILYMED_SEARCH = 'https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=';
const FDA_DRUGS_URL = 'https://www.accessdata.fda.gov/scripts/cder/daf/';

function dailyMedSource(id: string, label: string, query: string): MedReferenceSource {
  return {
    id,
    label,
    url: `${DAILYMED_SEARCH}${encodeURIComponent(query)}`,
    type: 'labeling',
  };
}

function fdaSource(id: string, label: string, query: string): MedReferenceSource {
  return {
    id,
    label,
    url: `${FDA_DRUGS_URL}?event=BasicSearch.process&searchterm=${encodeURIComponent(query)}`,
    type: 'reference',
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

function has(normalizedPrompt: string, pattern: RegExp) {
  return pattern.test(normalizedPrompt);
}

function hasAny(normalizedPrompt: string, aliases: string[]) {
  return aliases.some((alias) => {
    const normalizedAlias = normalizeMedReferenceText(alias);
    const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, 'i').test(normalizedPrompt);
  });
}

const BRAND_GENERIC_EXPANSIONS: Array<{ aliases: string[]; terms: string[] }> = [
  { aliases: ['wellbutrin', 'zyban'], terms: ['bupropion'] },
  { aliases: ['celexa'], terms: ['citalopram'] },
  { aliases: ['zoloft'], terms: ['sertraline'] },
  { aliases: ['prozac'], terms: ['fluoxetine'] },
  { aliases: ['lexapro'], terms: ['escitalopram'] },
  { aliases: ['paxil'], terms: ['paroxetine'] },
  { aliases: ['effexor'], terms: ['venlafaxine'] },
  { aliases: ['cymbalta'], terms: ['duloxetine'] },
  { aliases: ['seroquel'], terms: ['quetiapine'] },
  { aliases: ['zyprexa'], terms: ['olanzapine'] },
  { aliases: ['risperdal'], terms: ['risperidone'] },
  { aliases: ['abilify'], terms: ['aripiprazole'] },
  { aliases: ['depakote'], terms: ['divalproex', 'valproate', 'valproic acid'] },
  { aliases: ['lamictal'], terms: ['lamotrigine'] },
  { aliases: ['tegretol'], terms: ['carbamazepine'] },
  { aliases: ['trileptal'], terms: ['oxcarbazepine'] },
  { aliases: ['ativan'], terms: ['lorazepam'] },
  { aliases: ['xanax'], terms: ['alprazolam'] },
  { aliases: ['klonopin'], terms: ['clonazepam'] },
  { aliases: ['haldol'], terms: ['haloperidol'] },
  { aliases: ['suboxone'], terms: ['buprenorphine', 'naloxone'] },
  { aliases: ['vivitrol'], terms: ['naltrexone'] },
  { aliases: ['invega'], terms: ['paliperidone'] },
  { aliases: ['lybalvi'], terms: ['olanzapine', 'samidorphan'] },
];

const SSRI_ALIASES = [
  'ssri',
  'ssris',
  'sertraline',
  'zoloft',
  'fluoxetine',
  'prozac',
  'citalopram',
  'celexa',
  'escitalopram',
  'lexapro',
  'paroxetine',
  'paxil',
  'fluvoxamine',
];

function expandBrandGenericMedicationTerms(normalizedPrompt: string) {
  const additions = new Set<string>();

  for (const expansion of BRAND_GENERIC_EXPANSIONS) {
    if (!hasAny(normalizedPrompt, expansion.aliases)) {
      continue;
    }

    for (const term of expansion.terms) {
      additions.add(normalizeMedReferenceText(term));
    }
  }

  if (!additions.size) {
    return normalizedPrompt;
  }

  return normalizeMedReferenceText(`${normalizedPrompt} ${[...additions].join(' ')}`);
}

function hasMedicationPair(normalizedPrompt: string, firstAliases: string[], secondAliases: string[]) {
  return hasAny(normalizedPrompt, firstAliases) && hasAny(normalizedPrompt, secondAliases);
}

function isPlainReferenceQuestion(normalizedPrompt: string) {
  return !has(normalizedPrompt, /\b(my patient|this patient|pt\b|patient has|patient is|currently|right now|what should i do|what do i do|should i (increase|decrease|hold|stop|start|continue)|can i (increase|decrease|hold|stop|start|continue)|level\s+\d+(?:\.\d+)?|level pending|qtc\s+\d+(?:\.\d+)?|creatinine\s+\d+(?:\.\d+)?|a1c\s+\d+(?:\.\d+)?|hemoglobin a1c\s+\d+(?:\.\d+)?|anc\s+\d+(?:\.\d+)?|platelets?\s+\d+(?:\.\d+)?|sodium\s+\d+(?:\.\d+)?|low anc|anc low|low wbc|wbc low|neutropenia|pharmacy|fill|pending|sleepy|somnolent|sedated|confused|confusion|fever|clonus|rigidity|syncope|palpitations|overdose|took too much|poison control)\b/);
}

function isApprovalQuestion(normalizedPrompt: string) {
  return has(normalizedPrompt, /\b(fda approved|approved for|approved in|approved to|approved medication|approved medications|approved treatment|approval|indication|indicated|label|labeled|fda labeled|fda-labeled|under age|children under)\b/);
}

function isAdverseEffectQuestion(normalizedPrompt: string) {
  return has(normalizedPrompt, /\b(does|do|can|is|are|what)\b/)
    && has(normalizedPrompt, /\b(cause|side effect|risk|symptoms|signs|warning|syndrome|prolongation|weight gain|hyponatremia|blood pressure|sedation|tremor|myocarditis|amnesia|agranulocytosis|stevens-johnson|stevens johnson|sjs|rash|hair loss|alopecia|hepatotoxicity|hyperthyroidism|neuroleptic malignant|nms|akathisia|gingival|growth suppression|seizure threshold|extrapyramidal|eps|prolactin|birth defects|sudden cardiac death|cataracts|hypercalcemia|priapism)\b/);
}

function isInteractionQuestion(normalizedPrompt: string) {
  return has(normalizedPrompt, /\b(interaction|interact|combine|combined|combining|together|with|plus|and|safe together|okay together|ok together|increase|decrease|lower|inhibit|contraindicated|taken together)\b/);
}

function isMonitoringQuestion(normalizedPrompt: string) {
  return has(normalizedPrompt, /\b(labs?|monitor|monitoring|checked|frequency|baseline|ekg|ecg|a1c|lipids|cbc|anc|lft|lfts|liver function|kidney function|renal function|tsh|pregnancy test|urine drug screens?|drug screens?|uds|chest x ray|chest x-ray|x ray|xray|protocol)\b/);
}

function isUrgentProtocolQuestion(normalizedPrompt: string) {
  return has(normalizedPrompt, /\b(acute|urgent|emergency|er|ed|icu|overdose|toxicity|toxic|withdrawal|intoxicated|agitation|restraints?|triage|dystonic|hypertensive crisis|nms|neuroleptic malignant|serotonin syndrome|wernicke|ciwa|flumazenil|naloxone|charcoal|bowel obstruction|loaded intravenously|iv|im|eps|prophylaxis)\b/)
    || has(normalizedPrompt, /\b(what is the treatment|how is .* managed|first-line treatment|dose of .* acute|dose of im|treat .* in the er)\b/);
}

const approvalSource = fdaSource('fda-drugs-at-fda-labels', 'FDA Drugs@FDA labeling database', 'psychiatric medication approval indication');
const dailyMedApprovalSource = dailyMedSource('dailymed-current-product-labels', 'DailyMed current product labeling', 'FDA approved psychiatric medication indication label');
const auvelityAlzheimersAgitationSource = referenceSource('fda-auvelity-alzheimers-agitation-2026', 'FDA press announcement: Auvelity for agitation associated with dementia due to Alzheimer’s disease', 'https://www.fda.gov/news-events/press-announcements/fda-approves-first-non-antipsychotic-drug-treat-agitation-associated-dementia');
const beersSource = referenceSource('ags-2023-beers-criteria', 'American Geriatrics Society 2023 Beers Criteria', 'https://agsjournals.onlinelibrary.wiley.com/doi/10.1111/jgs.18372');
const dementiaAntipsychoticSource = dailyMedSource('dailymed-antipsychotic-dementia-boxed-warning', 'DailyMed labeling: antipsychotic dementia-related psychosis boxed warning', 'antipsychotic increased mortality elderly patients dementia-related psychosis boxed warning');
const citalopramFdaSource = referenceSource('fda-citalopram-older-adult-qtc', 'FDA citalopram dosing and QT warning clarification', 'https://www.fda.gov/drugs/special-features/clarification-dosing-and-warning-recommendations-celexa');
const mciGuidelineSource = referenceSource('aan-mci-guideline', 'AAN practice guideline update: mild cognitive impairment', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5772157/');
const postStrokeDepressionSource = referenceSource('post-stroke-depression-older-adults-review', 'Post-stroke depression in older adults overview', 'https://pubmed.ncbi.nlm.nih.gov/38396311/');
const ectOlderAdultSource = referenceSource('ect-older-adults-review', 'ECT and older adults safety/tolerability reference', 'https://pubmed.ncbi.nlm.nih.gov/34207157/');
const metabolicMonitoringSource = referenceSource('ada-apa-sga-metabolic-monitoring', 'ADA/APA consensus metabolic monitoring reference search', 'https://pubmed.ncbi.nlm.nih.gov/?term=ADA+APA+consensus+metabolic+monitoring+second+generation+antipsychotics+weight+glucose+lipids+blood+pressure');
const nmsReviewSource = referenceSource('nms-neurohospitalist-review', 'Neuroleptic malignant syndrome review', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3726098/');
const phenytoinSource = dailyMedSource('dailymed-phenytoin-gingival-hyperplasia', 'DailyMed labeling: phenytoin gingival hyperplasia', 'phenytoin gingival hyperplasia dental hygiene');
const poisonControlSource = referenceSource('poison-control-general', 'Poison Control emergency/toxicology guidance', 'https://www.poison.org/');
const samhsaTip63Source = referenceSource('samhsa-tip-63-oud', 'SAMHSA TIP 63: medications for opioid use disorder', 'https://library.samhsa.gov/product/TIP-63-Medications-for-Opioid-Use-Disorder-Full-Document/PEP21-02-01-002');
const agitationProtocolSource = referenceSource('project-beta-agitation-consensus', 'Project BETA agitation consensus reference search', 'https://pubmed.ncbi.nlm.nih.gov/?term=Project+BETA+agitation+consensus+emergency+psychiatry');
const restraintPolicySource = referenceSource('cms-restraint-seclusion-standards', 'CMS restraint and seclusion hospital standards reference', 'https://www.cms.gov/medicare/provider-enrollment-and-certification/surveycertificationgeninfo/downloads/scletter08-18.pdf');
const wernickeSource = referenceSource('wernicke-korsakoff-treatment-reference', 'Wernicke-Korsakoff treatment reference search', 'https://pubmed.ncbi.nlm.nih.gov/?term=Wernicke+Korsakoff+thiamine+treatment');

export const DIRECT_MEDICATION_REFERENCE_ANSWERS: DirectMedicationReferenceEntry[] = [
  {
    id: 'med-safety-stimulant-psychosis-history',
    lane: 'medication_safety_reference',
    topic: 'stimulant use with psychosis history',
    text: 'Stimulant/ADHD medication safety framing: use caution when there is current or prior psychosis. Review current mood stability, psychosis or paranoia, mania, substance use and diversion risk, sleep disruption, blood pressure, heart rate, cardiac history, and cardiovascular risk; this is not a patient-specific order, and do not treat this as a routine restart.',
    sourceRefs: [dailyMedSource('dailymed-stimulant-psychosis-warning', 'DailyMed labeling: stimulant psychosis/mania warnings', 'stimulant psychosis mania warning ADHD')],
    matches: (prompt) => has(prompt, /\bstimulant|methylphenidate|amphetamine|lisdexamfetamine\b/) && has(prompt, /\bpsychosis|psychotic|hallucination|mania|manic\b/) && has(prompt, /\b(can i|should i|could i|restart|start|use|give|prescribe)\b/),
  },
  {
    id: 'med-safety-antidepressant-bipolar-suspected',
    lane: 'medication_safety_reference',
    topic: 'antidepressant use with suspected bipolar disorder',
    text: 'If bipolar disorder is suspected, antidepressant use needs caution because activation or manic switch risk can matter. Review bipolar history, mixed/manic symptoms, family history, substance use, sleep change, current mood stabilizer/antipsychotic context, and current prescribing guidance before applying to a patient.',
    sourceRefs: [dailyMedSource('dailymed-antidepressant-mania-warning', 'DailyMed labeling: antidepressant mania/hypomania warning', 'antidepressant mania hypomania bipolar warning')],
    matches: (prompt) => has(prompt, /\bantidepressant|ssri|snri|sertraline|fluoxetine|escitalopram|citalopram|venlafaxine|duloxetine\b/) && has(prompt, /\bbipolar|mania|manic|hypomania|mixed\b/) && has(prompt, /\b(can i|should i|could i|start|use|give|prescribe)\b/),
  },
  {
    id: 'med-safety-antipsychotic-delirium-possible',
    lane: 'medication_safety_reference',
    topic: 'antipsychotic use when delirium is possible',
    text: 'When delirium is possible, antipsychotic use is a safety/risk-benefit question, not proof of a primary psychiatric diagnosis. Review medical causes, vitals, cognition/attention fluctuation, QTc/electrolytes, EPS/sedation risk, anticholinergic burden, and local protocol before applying to a patient.',
    sourceRefs: [dailyMedSource('dailymed-antipsychotic-delirium-safety', 'DailyMed labeling/reference: antipsychotic safety QT EPS sedation delirium', 'antipsychotic delirium QTc EPS sedation warning')],
    matches: (prompt) => has(prompt, /\bantipsychotic|haloperidol|haldol|olanzapine|quetiapine|risperidone|ziprasidone\b/) && has(prompt, /\bdelirium|confused|confusion|fluctuating attention|medical\b/) && has(prompt, /\b(can i|should i|could i|start|use|give|prescribe)\b/),
  },
  {
    id: 'med-safety-lamotrigine-rash',
    lane: 'medication_safety_reference',
    topic: 'lamotrigine rash safety',
    text: 'Lamotrigine rash can be clinically urgent because serious rash/SJS/TEN risk is label-significant. Assess rash features, mucosal involvement, fever/systemic symptoms, timing, titration speed, valproate co-use, and urgent prescriber/local-protocol review; do not treat it as routine bipolar symptom routing.',
    sourceRefs: [dailyMedSource('dailymed-lamotrigine-rash-warning', 'DailyMed labeling: lamotrigine serious rash warning', 'lamotrigine serious rash Stevens Johnson syndrome valproate titration')],
    matches: (prompt) => hasAny(prompt, ['lamotrigine', 'lamictal']) && has(prompt, /\brash|sjs|stevens-johnson|stevens johnson\b/),
  },
  {
    id: 'approval-aristada-bipolar-disorder',
    lane: 'approval_indication',
    topic: 'Aristada bipolar disorder approval',
    text: 'No. Aristada/aripiprazole lauroxil is FDA-approved for schizophrenia in adults, not bipolar disorder. Verify current product-specific labeling.',
    sourceRefs: [dailyMedSource('dailymed-aristada-approval', 'DailyMed labeling: Aristada indication', 'Aristada aripiprazole lauroxil schizophrenia indication')],
    matches: (prompt) => hasAny(prompt, ['aristada', 'aripiprazole lauroxil']) && has(prompt, /\bbipolar\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'urgent-dystonic-reaction',
    lane: 'urgent_protocol_reference',
    topic: 'acute dystonic reaction',
    text: 'This is an urgent acute dystonic medication-reaction scenario. Typical protocol management uses a rapid anticholinergic such as diphenhydramine or benztropine by an appropriate acute-care route, with airway, agitation, and recurrence monitoring. Follow local emergency protocol for dosing and administration.',
    sourceRefs: [agitationProtocolSource, dailyMedSource('dailymed-diphenhydramine-benztropine-dystonia', 'DailyMed/reference search: acute dystonic reaction anticholinergic treatment', 'acute dystonic reaction diphenhydramine benztropine')],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && has(prompt, /\bdystonic reaction|acute dystonia|dystonia\b/),
  },
  {
    id: 'urgent-maoi-hypertensive-crisis',
    lane: 'urgent_protocol_reference',
    topic: 'MAOI hypertensive crisis',
    text: 'MAOI-associated hypertensive crisis is an urgent emergency scenario. Typical management is immediate medical evaluation, BP/neurologic/cardiac monitoring, review of tyramine or sympathomimetic exposure, and protocol-based antihypertensive treatment. Use ED/local protocol and toxicology or pharmacy guidance.',
    sourceRefs: [poisonControlSource, dailyMedSource('dailymed-maoi-hypertensive-crisis', 'DailyMed labeling: MAOI hypertensive crisis', 'MAOI hypertensive crisis treatment protocol')],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && has(prompt, /\bmaoi|phenelzine|tranylcypromine|isocarboxazid|selegiline\b/) && has(prompt, /\bhypertensive crisis|crisis|hypertension\b/),
  },
  {
    id: 'urgent-nms-treatment',
    lane: 'urgent_protocol_reference',
    topic: 'neuroleptic malignant syndrome treatment',
    text: 'NMS is an urgent medical emergency. Typical protocol management includes removing the offending exposure, aggressive supportive care such as cooling/hydration, CK/renal/autonomic monitoring, and ICU-level escalation when severe. Dantrolene or dopamine agonists may be considered by severity and local protocol.',
    sourceRefs: [nmsReviewSource, dailyMedSource('dailymed-antipsychotic-nms-treatment', 'DailyMed labeling: antipsychotic NMS warning', 'neuroleptic malignant syndrome dantrolene bromocriptine supportive care')],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && has(prompt, /\bnms|neuroleptic malignant syndrome\b/) && has(prompt, /\btreatment|first-line|managed|management\b/),
  },
  {
    id: 'urgent-iv-haloperidol-icu',
    lane: 'urgent_protocol_reference',
    topic: 'IV haloperidol ICU use',
    text: 'IV haloperidol in ICU/acute agitation is an urgent protocol question, not a generic antipsychotic profile. Key issues are QTc/torsades risk, electrolytes, ECG monitoring, dose/route policy, delirium context, and sedation/EPS risk. Use ICU/local protocol and pharmacy guidance before applying.',
    sourceRefs: [agitationProtocolSource, dailyMedSource('dailymed-haloperidol-iv-qtc', 'DailyMed labeling: haloperidol QT/torsades and parenteral risk', 'haloperidol intravenous QT torsades ICU agitation')],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && hasAny(prompt, ['haloperidol', 'haldol']) && has(prompt, /\biv|intravenous|icu\b/),
  },
  {
    id: 'urgent-im-olanzapine-agitation-dose',
    lane: 'urgent_protocol_reference',
    topic: 'IM olanzapine acute agitation dosing framework',
    text: 'IM olanzapine for agitation is an urgent acute-care protocol question. Product labeling includes IM agitation dosing ranges, but actual dose/repeat timing should come from ED/local protocol and patient factors. Monitor hypotension, additive sedation, respiratory/CNS depression, respiratory status, and parenteral benzodiazepine timing risk. This should be verified against a current drug-interaction reference.',
    sourceRefs: [dailyMedSource('dailymed-im-olanzapine-agitation', 'DailyMed labeling: olanzapine IM agitation dosing and warnings', 'Zyprexa intramuscular agitation dose benzodiazepine cardiorespiratory depression'), agitationProtocolSource],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && hasAny(prompt, ['olanzapine', 'zyprexa']) && has(prompt, /\bim|intramuscular|agitation|dose\b/),
  },
  {
    id: 'urgent-im-ziprasidone-lorazepam',
    lane: 'urgent_protocol_reference',
    topic: 'IM ziprasidone plus lorazepam',
    text: 'This is an urgent agitation-protocol interaction question. IM ziprasidone with lorazepam raises sedation, respiratory, falls, and QTc-context concerns, so coadministration/timing should follow local protocol rather than a blanket yes/no. Monitor vitals, airway, sedation level, QTc risk, and other depressants.',
    sourceRefs: [agitationProtocolSource, dailyMedSource('dailymed-ziprasidone-lorazepam-agitation', 'DailyMed/reference search: ziprasidone IM lorazepam agitation interaction', 'ziprasidone intramuscular lorazepam agitation sedation respiratory QT')],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && hasAny(prompt, ['ziprasidone', 'geodon']) && hasAny(prompt, ['lorazepam', 'ativan']),
  },
  {
    id: 'urgent-ssri-overdose',
    lane: 'urgent_protocol_reference',
    topic: 'SSRI overdose',
    text: 'Treat as urgent medical/toxicology scenario. SSRI overdose is typically managed with supportive care and monitoring, with escalation for serotonin syndrome, seizures, cardiac effects, or co-ingestions. Confirm timing/amount and co-ingestions; typical protocol assessment includes vitals, neuromuscular findings, mental status, ECG, labs, and poison control or ED/local protocol guidance.',
    sourceRefs: [poisonControlSource, dailyMedSource('dailymed-ssri-overdose-serotonin', 'DailyMed labeling: SSRI overdose and serotonin syndrome', 'SSRI overdose serotonin syndrome ECG seizure')],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && has(prompt, /\bssri|ssris|sertraline|fluoxetine|paroxetine|citalopram|escitalopram|fluvoxamine\b/) && has(prompt, /\boverdose|ingestion|took too much|managed|management\b/),
  },
  {
    id: 'urgent-suicidal-patient-triage',
    lane: 'urgent_protocol_reference',
    topic: 'suicidal patient triage priority',
    text: 'A suicidal patient is an urgent safety-triage scenario. Typical protocol priorities are immediate safety, observation level, means/access assessment, current intent/plan, recent behavior, intoxication/withdrawal or psychosis, and escalation to emergency/crisis workflow when acute risk is possible. Follow local suicide-risk protocol.',
    sourceRefs: [referenceSource('suicide-triage-protocol-reference', 'Suicide triage and emergency protocol reference search', 'https://pubmed.ncbi.nlm.nih.gov/?term=suicide+risk+triage+emergency+department+protocol')],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && has(prompt, /\bsuicidal patient|suicide|suicidal ideation|acute suicidal\b/) && has(prompt, /\btriage|priority|acute|emergency\b/),
  },
  {
    id: 'urgent-ketamine-acute-suicidality',
    lane: 'urgent_protocol_reference',
    topic: 'ketamine acute suicidal ideation',
    text: 'Ketamine for acute suicidal ideation is an urgent specialty/protocol question, not routine outpatient advice. Evidence and local practice vary; assess monitoring setting, dissociation/sedation, BP, substance use, psychosis/mania risk, consent, and follow institutional protocol. Do not treat it as a stand-alone disposition decision.',
    sourceRefs: [referenceSource('ketamine-acute-suicidality-reference', 'Ketamine acute suicidal ideation reference search', 'https://pubmed.ncbi.nlm.nih.gov/?term=ketamine+acute+suicidal+ideation+emergency+department')],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && hasAny(prompt, ['ketamine']) && has(prompt, /\bsuicidal|suicide|acute suicidal\b/),
  },
  {
    id: 'urgent-diphenhydramine-eps-prophylaxis',
    lane: 'urgent_protocol_reference',
    topic: 'diphenhydramine EPS prophylaxis',
    text: 'Diphenhydramine for EPS prophylaxis in acute care is an urgent protocol-based medication question. Typical use depends on dystonia/EPS risk, antipsychotic choice, age, anticholinergic burden, delirium risk, and sedation risk. Use local protocol or pharmacy guidance for dose and route.',
    sourceRefs: [dailyMedSource('dailymed-diphenhydramine-eps', 'DailyMed/reference search: diphenhydramine EPS dystonia prophylaxis', 'diphenhydramine extrapyramidal symptoms dystonia prophylaxis'), agitationProtocolSource],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && hasAny(prompt, ['diphenhydramine', 'benadryl']) && has(prompt, /\beps|dystonia|prophylaxis|dose\b/),
  },
  {
    id: 'urgent-serotonin-syndrome-vs-nms',
    lane: 'urgent_protocol_reference',
    topic: 'serotonin syndrome vs NMS',
    text: 'Serotonin syndrome vs NMS is an urgent diagnostic-safety distinction. Serotonin syndrome usually has serotonergic exposure, rapid onset, clonus/hyperreflexia, agitation, and autonomic/GI findings; NMS usually has dopamine-blocker exposure, slower onset, lead-pipe rigidity, fever, altered mental status, and high CK. Use ED/local protocol and toxicology/neurology guidance when severe.',
    sourceRefs: [nmsReviewSource, dailyMedSource('dailymed-serotonin-nms-warning', 'DailyMed/reference search: serotonin syndrome vs NMS', 'serotonin syndrome neuroleptic malignant syndrome clonus rigidity')],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && has(prompt, /\bserotonin syndrome|serotonin toxicity\b/) && has(prompt, /\bnms|neuroleptic malignant\b/),
  },
  {
    id: 'urgent-benzodiazepine-overdose',
    lane: 'urgent_protocol_reference',
    topic: 'benzodiazepine overdose',
    text: 'Benzodiazepine overdose is an urgent toxicology scenario. Typical protocol management is supportive care with airway, breathing, sedation, vitals, co-ingestion, and respiratory-depression monitoring. Flumazenil is limited to selected situations and can precipitate seizures or withdrawal in chronic use; use poison control/local protocol.',
    sourceRefs: [poisonControlSource, dailyMedSource('dailymed-flumazenil-benzo-overdose', 'DailyMed labeling: flumazenil benzodiazepine overdose and seizure risk', 'flumazenil benzodiazepine overdose seizure chronic use')],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && has(prompt, /\bbenzodiazepine|benzodiazepines|benzo|benzos|alprazolam|lorazepam|diazepam|clonazepam\b/) && has(prompt, /\boverdose|toxicity|too much|treatment\b/),
  },
  {
    id: 'urgent-restraints-physician-order',
    lane: 'urgent_protocol_reference',
    topic: 'physical restraints order context',
    text: 'Physical restraints are an urgent safety/legal protocol issue, not a routine convenience intervention. Requirements depend on jurisdiction, facility policy, imminent danger, time-limited authorization, monitoring, documentation, and reassessment. Follow local restraint/seclusion protocol and legal/regulatory rules.',
    sourceRefs: [restraintPolicySource],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && has(prompt, /\bphysical restraints?|restraints?|seclusion\b/),
  },
  {
    id: 'urgent-im-midazolam-agitation',
    lane: 'urgent_protocol_reference',
    topic: 'IM midazolam acute agitation',
    text: 'IM midazolam for acute agitation is an urgent protocol question. Typical use depends on agitation cause, respiratory risk, intoxication, other sedatives, age/frailty, and monitoring capacity. Use ED/local protocol for dose/route and monitor airway, breathing, vitals, and sedation.',
    sourceRefs: [dailyMedSource('dailymed-midazolam-acute-agitation', 'DailyMed/reference search: midazolam acute agitation respiratory depression', 'midazolam intramuscular acute agitation respiratory depression'), agitationProtocolSource],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && hasAny(prompt, ['midazolam', 'versed']) && has(prompt, /\bim|intramuscular|acute agitation|agitation|dose\b/),
  },
  {
    id: 'urgent-flumazenil-chronic-benzo',
    lane: 'urgent_protocol_reference',
    topic: 'flumazenil chronic benzodiazepine caution',
    text: 'Flumazenil is a benzodiazepine receptor antagonist, and use in chronic benzodiazepine exposure is an urgent toxicology/protocol question. It can precipitate withdrawal or seizures, especially with dependence, seizure disorder, or pro-convulsant co-ingestions. Use poison control/local protocol rather than treating it as generally safe.',
    sourceRefs: [poisonControlSource, dailyMedSource('dailymed-flumazenil-chronic-benzo-seizure', 'DailyMed labeling: flumazenil seizure and withdrawal risk', 'flumazenil chronic benzodiazepine seizure withdrawal')],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && hasAny(prompt, ['flumazenil']) && (has(prompt, /\bchronic|benzo|benzodiazepine|safe|overdose|work|mechanism\b/) && !isApprovalQuestion(prompt)),
  },
  {
    id: 'urgent-panicked-patient-er',
    lane: 'urgent_protocol_reference',
    topic: 'panicked patient in ER',
    text: 'A “panicked” patient in the ER should be treated as an urgent assessment scenario until medical/substance causes and safety risks are screened. Typical protocol framing checks vitals, oxygenation, chest pain, intoxication/withdrawal, delirium, suicidality, agitation risk, and de-escalation needs. Follow ED/local protocol.',
    sourceRefs: [agitationProtocolSource, referenceSource('panic-er-medical-screening-reference', 'Emergency panic/anxiety medical screening reference search', 'https://pubmed.ncbi.nlm.nih.gov/?term=panic+attack+emergency+department+medical+screening')],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && has(prompt, /\bpanicked|panic attack|panic\b/) && has(prompt, /\ber|ed|emergency\b/),
  },
  {
    id: 'urgent-clozapine-bowel-obstruction',
    lane: 'urgent_protocol_reference',
    topic: 'clozapine bowel obstruction',
    text: 'Clozapine-induced constipation/ileus or bowel obstruction can be urgent and potentially fatal. Watch for abdominal pain/distension, vomiting, absent bowel movements, ileus signs, fever, or sepsis concern; use local protocol for urgent medical assessment. Prevention and bowel monitoring should be proactive.',
    sourceRefs: [dailyMedSource('dailymed-clozapine-constipation-ileus', 'DailyMed labeling: clozapine constipation ileus bowel obstruction', 'clozapine constipation ileus bowel obstruction fatal')],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && hasAny(prompt, ['clozapine', 'clozaril']) && has(prompt, /\bbowel obstruction|ileus|constipation|gi hypomotility\b/),
  },
  {
    id: 'urgent-valproate-iv-loading',
    lane: 'urgent_protocol_reference',
    topic: 'IV valproate loading acute mania',
    text: 'IV valproate loading for acute mania is an urgent inpatient/protocol question, not a routine outpatient instruction. Typical review includes indication, LFTs, platelets/CBC, pregnancy potential, ammonia/mental status risk, albumin/free level context, and drug interactions. Use local protocol and pharmacy guidance for any loading strategy.',
    sourceRefs: [dailyMedSource('dailymed-valproate-iv-loading', 'DailyMed labeling: valproate injection and safety monitoring', 'valproate injection acute mania loading LFT platelets ammonia pregnancy')],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && has(prompt, /\bvalproate|depakote|divalproex|vpa\b/) && has(prompt, /\bloaded|loading|intravenously|iv\b/),
  },
  {
    id: 'urgent-clonidine-opioid-withdrawal',
    lane: 'urgent_protocol_reference',
    topic: 'clonidine for opioid withdrawal symptoms',
    text: 'Clonidine use for opioid withdrawal symptoms is an urgent protocol-based withdrawal-care question. It can reduce autonomic symptoms such as sweating, anxiety, tachycardia, and hypertension, but it does not treat OUD itself. Monitor hypotension, bradycardia, sedation, and dehydration risk; verify local protocol.',
    sourceRefs: [samhsaTip63Source],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && hasAny(prompt, ['clonidine']) && has(prompt, /\bopioid withdrawal|withdrawal symptoms|used for\b/),
  },
  {
    id: 'urgent-opioid-withdrawal-treatment',
    lane: 'urgent_protocol_reference',
    topic: 'opioid withdrawal treatment standard',
    text: 'Opioid withdrawal treatment should follow urgent/local protocol when clinically significant. Evidence-based medications include buprenorphine or methadone for OUD, with COWS/withdrawal severity, intoxication, fentanyl exposure, pregnancy, sedation, and setting guiding timing. Verify SAMHSA/local protocol and prescriber requirements.',
    sourceRefs: [samhsaTip63Source],
    matches: (prompt) => isUrgentProtocolQuestion(prompt)
      && has(prompt, /\bopioid withdrawal|cows|buprenorphine|suboxone|methadone|clonidine\b/)
      && has(prompt, /\bgold standard|treating|treatment|started|intoxicated|symptoms|withdrawal\b/)
      && !has(prompt, /\bsamidorphan|lybalvi|naltrexone|opioid antagonist|kratom\b/)
      && !(hasAny(prompt, ['buprenorphine', 'suboxone']) && has(prompt, /\bintoxicated|start|started|initiation|precipitated\b/)),
  },
  {
    id: 'urgent-buprenorphine-intoxicated',
    lane: 'urgent_protocol_reference',
    topic: 'buprenorphine initiation while intoxicated',
    text: 'Buprenorphine initiation while intoxicated is an urgent protocol question. Typical protocols require objective opioid withdrawal and assessment for sedation, alcohol/benzodiazepine co-use, respiratory risk, fentanyl exposure, and precipitated-withdrawal risk. Verify COWS-based local protocol and prescriber/pharmacy guidance.',
    sourceRefs: [samhsaTip63Source],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && hasAny(prompt, ['buprenorphine', 'suboxone']) && has(prompt, /\bintoxicated|start|started|initiation|precipitated\b/),
  },
  {
    id: 'urgent-naloxone-opioid-overdose',
    lane: 'urgent_protocol_reference',
    topic: 'naloxone opioid overdose',
    text: 'Naloxone for opioid overdose is an urgent emergency protocol scenario. Typical protocols prioritize airway/ventilation, EMS/ED activation, naloxone by approved route, repeat assessment because renarcotization can occur, and monitoring for withdrawal/agitation. Use local overdose protocol for dose and route.',
    sourceRefs: [poisonControlSource, dailyMedSource('dailymed-naloxone-opioid-overdose', 'DailyMed labeling: naloxone opioid overdose', 'naloxone opioid overdose repeat dose respiratory depression')],
    matches: (prompt) => isUrgentProtocolQuestion(prompt)
      && hasAny(prompt, ['naloxone', 'narcan'])
      && has(prompt, /\boverdose|opioid|dose\b/)
      && !has(prompt, /\bsamidorphan|lybalvi|opioid antagonist\b/),
  },
  {
    id: 'urgent-wernicke-korsakoff-treatment',
    lane: 'urgent_protocol_reference',
    topic: 'Wernicke-Korsakoff treatment',
    text: 'Suspected Wernicke encephalopathy/Wernicke-Korsakoff is urgent because delayed treatment can cause permanent neurologic injury. Typical protocol treatment uses parenteral thiamine with glucose/nutrition/alcohol-withdrawal and magnesium context addressed. Follow ED/inpatient local protocol.',
    sourceRefs: [wernickeSource],
    matches: (prompt) => isUrgentProtocolQuestion(prompt) && has(prompt, /\bwernicke|korsakoff\b/),
  },
  {
    id: 'substance-disulfiram-after-alcohol',
    lane: 'substance_reference',
    topic: 'disulfiram timing after alcohol',
    text: 'Reference: disulfiram is generally started only after the patient has abstained from alcohol, commonly at least 12 hours, and has no alcohol intoxication. Verify labeling, hepatic status, consent, and local protocol.',
    sourceRefs: [dailyMedSource('dailymed-disulfiram-alcohol-timing', 'DailyMed labeling: disulfiram alcohol abstinence timing', 'disulfiram alcohol 12 hours abstinence')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['disulfiram', 'antabuse']) && has(prompt, /\blast drink|start|after alcohol|after the last drink\b/),
  },
  {
    id: 'substance-cows-scale',
    lane: 'substance_reference',
    topic: 'COWS scale',
    text: 'Reference: the Clinical Opiate Withdrawal Scale (COWS) is used to rate opioid withdrawal severity and guide protocol-based decisions such as buprenorphine timing. It does not replace clinical assessment.',
    sourceRefs: [samhsaTip63Source],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bcows\b|clinical opiate withdrawal scale/),
  },
  {
    id: 'substance-cocaine-use-disorder-medication',
    lane: 'substance_reference',
    topic: 'cocaine use disorder medication',
    text: 'Reference: there is no FDA-approved medication for cocaine use disorder; behavioral treatments such as contingency management have the strongest evidence base. Verify current addiction-medicine guidance.',
    sourceRefs: [referenceSource('cocaine-use-disorder-medication-reference', 'Cocaine use disorder medication treatment reference search', 'https://pubmed.ncbi.nlm.nih.gov/?term=cocaine+use+disorder+FDA-approved+medication+contingency+management')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bcocaine\b/) && has(prompt, /\bmedication|medicine|treatment\b/),
  },
  {
    id: 'substance-methadone-qtc',
    lane: 'substance_reference',
    topic: 'methadone QTc prolongation',
    text: 'Reference: yes, methadone can prolong QTc and torsades risk is higher with high exposure, electrolyte abnormalities, cardiac disease, or other QT-prolonging drugs. Verify ECG/electrolyte context and local protocol.',
    sourceRefs: [dailyMedSource('dailymed-methadone-qtc', 'DailyMed labeling: methadone QT prolongation', 'methadone QT prolongation torsades ECG electrolytes')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['methadone']) && has(prompt, /\bqtc|qt prolongation|prolonged qt\b/),
  },
  {
    id: 'substance-heroin-half-life',
    lane: 'substance_reference',
    topic: 'heroin half-life',
    text: 'Reference: heroin has a very short half-life, often only minutes, and is rapidly metabolized to 6-MAM and morphine. Clinical effect duration varies by route, dose, tolerance, and co-ingestions.',
    sourceRefs: [referenceSource('heroin-half-life-reference', 'Heroin pharmacokinetics reference search', 'https://pubmed.ncbi.nlm.nih.gov/?term=heroin+half-life+6-MAM+morphine+pharmacokinetics')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['heroin']) && has(prompt, /\bhalf-life|half life\b/),
  },
  {
    id: 'approval-lai-antipsychotics-adolescents',
    lane: 'approval_indication',
    topic: 'LAI antipsychotic adolescent approval',
    text: 'No. There are no broadly FDA-approved long-acting injectable antipsychotics for patients under 18; most LAI approvals are adult-focused. Verify product-specific labeling.',
    sourceRefs: [
      approvalSource,
      dailyMedSource('dailymed-lai-antipsychotics-labels', 'DailyMed labeling: LAI antipsychotic products', 'Abilify Maintena Aristada Invega Sustenna Risperdal Consta Perseris Uzedy adolescent'),
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt)
      && has(prompt, /\b(long acting|long-acting|\blai\b|injection|injectable|injections)\b/)
      && has(prompt, /\b(antipsychotic|antipsychotics)\b/)
      && has(prompt, /\b(adolescent|adolescents|pediatric|children|child|youth|teen)\b/)
      && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-esketamine-trd',
    lane: 'approval_indication',
    topic: 'esketamine treatment-resistant depression approval',
    text: 'Yes. Esketamine is FDA-approved for treatment-resistant depression in adults, used with an oral antidepressant. Verify product-specific labeling and administration requirements.',
    sourceRefs: [
      dailyMedSource('dailymed-spravato-trd', 'DailyMed labeling: Spravato / esketamine treatment-resistant depression', 'Spravato esketamine treatment-resistant depression'),
      approvalSource,
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['esketamine', 'spravato']) && has(prompt, /\btreatment resistant depression|trd\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-pediatric-ocd-ssris',
    lane: 'approval_indication',
    topic: 'pediatric OCD SSRI approvals',
    text: 'Fluoxetine, sertraline, and fluvoxamine are FDA-approved for OCD in children. Verify age ranges and product labeling for each agent.',
    sourceRefs: [
      dailyMedSource('dailymed-pediatric-ocd-ssris', 'DailyMed labeling: pediatric OCD SSRI indications', 'fluoxetine sertraline fluvoxamine pediatric obsessive compulsive disorder'),
      approvalSource,
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bssri|ssris\b/) && has(prompt, /\bocd|obsessive compulsive\b/) && has(prompt, /\b(child|children|pediatric|adolescent|youth)\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-clozapine-suicidal-behavior',
    lane: 'approval_indication',
    topic: 'clozapine suicidal behavior approval',
    text: 'Yes. Clozapine is FDA-approved for reducing recurrent suicidal behavior risk in schizophrenia or schizoaffective disorder. Verify product labeling and clozapine safety requirements.',
    sourceRefs: [dailyMedSource('dailymed-clozapine-suicidal-behavior', 'DailyMed labeling: clozapine recurrent suicidal behavior', 'clozapine recurrent suicidal behavior schizophrenia schizoaffective')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['clozapine', 'clozaril']) && has(prompt, /\bsuicidal behavior|suicidality|suicide\b/) && has(prompt, /\bschizophrenia|schizoaffective\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-autism-irritability',
    lane: 'approval_indication',
    topic: 'autism irritability approvals',
    text: 'Risperidone and aripiprazole are FDA-approved for irritability associated with autism/autistic disorder in pediatric age ranges. Verify exact age range and product labeling.',
    sourceRefs: [
      dailyMedSource('dailymed-risperidone-autism-irritability', 'DailyMed labeling: risperidone autism irritability', 'risperidone irritability associated with autistic disorder pediatric'),
      dailyMedSource('dailymed-aripiprazole-autism-irritability', 'DailyMed labeling: aripiprazole autism irritability', 'aripiprazole irritability associated with autistic disorder pediatric'),
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\birritability|aggression\b/) && has(prompt, /\bautism|autistic\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-bipolar-depression-antipsychotics',
    lane: 'approval_indication',
    topic: 'bipolar depression antipsychotic approvals',
    text: 'FDA-approved antipsychotic options for bipolar depression include quetiapine, lurasidone, cariprazine, lumateperone, and olanzapine/fluoxetine combination. Verify product-specific labeling, age, and bipolar I vs II indication.',
    sourceRefs: [
      dailyMedSource('dailymed-bipolar-depression-antipsychotics', 'DailyMed labeling: antipsychotics for bipolar depression', 'quetiapine lurasidone cariprazine lumateperone olanzapine fluoxetine bipolar depression'),
      approvalSource,
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bantipsychotic|antipsychotics\b/) && has(prompt, /\bbipolar depression|bipolar depressive\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-modafinil-adhd',
    lane: 'approval_indication',
    topic: 'modafinil ADHD approval',
    text: 'No. Modafinil is not FDA-approved for ADHD; labeled uses are sleep/wake indications such as narcolepsy, obstructive sleep apnea-related sleepiness, and shift-work disorder.',
    sourceRefs: [dailyMedSource('dailymed-modafinil-indications', 'DailyMed labeling: modafinil indications', 'modafinil indications narcolepsy obstructive sleep apnea shift work ADHD')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['modafinil', 'provigil']) && has(prompt, /\badhd|attention deficit\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-smoking-cessation',
    lane: 'approval_indication',
    topic: 'smoking cessation medication approvals',
    text: 'Varenicline, bupropion SR, and nicotine replacement therapies are FDA-approved for smoking cessation. Verify product labeling for contraindications and clinical cautions.',
    sourceRefs: [
      fdaSource('fda-smoking-cessation-products', 'FDA Drugs@FDA: smoking cessation products', 'smoking cessation varenicline bupropion nicotine'),
      dailyMedSource('dailymed-smoking-cessation', 'DailyMed labeling: varenicline and bupropion smoking cessation', 'varenicline bupropion smoking cessation'),
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\b(smoking cessation|tobacco cessation|quit smoking)\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-tardive-dyskinesia',
    lane: 'approval_indication',
    topic: 'tardive dyskinesia medication approvals',
    text: 'Valbenazine and deutetrabenazine are FDA-approved for tardive dyskinesia. Verify product labeling, interactions, hepatic status, and QT/CYP cautions.',
    sourceRefs: [
      dailyMedSource('dailymed-valbenazine-td', 'DailyMed labeling: valbenazine tardive dyskinesia', 'valbenazine Ingrezza tardive dyskinesia'),
      dailyMedSource('dailymed-deutetrabenazine-td', 'DailyMed labeling: deutetrabenazine tardive dyskinesia', 'deutetrabenazine Austedo tardive dyskinesia'),
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\btardive dyskinesia|td\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-ptsd-ssris',
    lane: 'approval_indication',
    topic: 'PTSD SSRI approvals',
    text: 'Sertraline and paroxetine are FDA-approved SSRIs for PTSD. Verify product-specific labeling, age, and formulation.',
    sourceRefs: [dailyMedSource('dailymed-ptsd-ssris', 'DailyMed labeling: sertraline and paroxetine PTSD indications', 'sertraline paroxetine PTSD indication')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bssri|ssris\b/) && has(prompt, /\bptsd|post traumatic stress\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-lisdexamfetamine-binge-eating',
    lane: 'approval_indication',
    topic: 'lisdexamfetamine binge eating disorder approval',
    text: 'Lisdexamfetamine/Vyvanse is FDA-approved for moderate-to-severe binge eating disorder in adults. Verify product labeling and stimulant safety cautions.',
    sourceRefs: [dailyMedSource('dailymed-lisdexamfetamine-binge-eating', 'DailyMed labeling: lisdexamfetamine binge eating disorder', 'lisdexamfetamine Vyvanse binge eating disorder adults')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bstimulant|stimulants|lisdexamfetamine|vyvanse\b/) && has(prompt, /\bbinge eating|bed\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-paliperidone-palmitate-schizoaffective',
    lane: 'approval_indication',
    topic: 'paliperidone palmitate schizoaffective disorder approval',
    text: 'Yes. Paliperidone palmitate/Invega Sustenna is FDA-approved for schizoaffective disorder in adults. If you mean oral paliperidone or another paliperidone product, verify the exact product-specific labeling.',
    sourceRefs: [dailyMedSource('dailymed-paliperidone-palmitate-schizoaffective', 'DailyMed labeling: paliperidone palmitate schizoaffective disorder', 'Invega Sustenna paliperidone palmitate schizoaffective disorder')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['paliperidone', 'paliperidone palmitate', 'invega sustenna']) && has(prompt, /\bschizoaffective\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-brexanolone-postpartum-depression',
    lane: 'approval_indication',
    topic: 'brexanolone postpartum depression approval',
    text: 'Yes. Brexanolone/Zulresso is FDA-approved for postpartum depression. Verify product labeling and REMS/administration requirements.',
    sourceRefs: [dailyMedSource('dailymed-brexanolone-postpartum-depression', 'DailyMed labeling: brexanolone postpartum depression', 'brexanolone Zulresso postpartum depression')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['brexanolone', 'zulresso']) && has(prompt, /\bpostpartum depression|ppd\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-acamprosate-oud',
    lane: 'approval_indication',
    topic: 'acamprosate opioid use disorder approval',
    text: 'No. Acamprosate is not FDA-approved for opioid use disorder; it is FDA-approved for maintenance of alcohol abstinence. Verify product labeling and renal cautions.',
    sourceRefs: [dailyMedSource('dailymed-acamprosate-indications', 'DailyMed labeling: acamprosate indications', 'acamprosate alcohol abstinence opioid use disorder')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['acamprosate', 'campral']) && has(prompt, /\bopioid use disorder|oud|opioid\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-lisdexamfetamine-pediatric-adhd',
    lane: 'approval_indication',
    topic: 'lisdexamfetamine pediatric ADHD approval',
    text: 'Yes. Lisdexamfetamine/Vyvanse is FDA-approved for ADHD in pediatric patients age 6 and older. Verify product labeling and stimulant safety cautions.',
    sourceRefs: [dailyMedSource('dailymed-lisdexamfetamine-pediatric-adhd', 'DailyMed labeling: lisdexamfetamine pediatric ADHD', 'lisdexamfetamine Vyvanse pediatric ADHD age 6')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lisdexamfetamine', 'vyvanse']) && has(prompt, /\bpediatric|child|children|adolescent|adhd\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-snris-fibromyalgia',
    lane: 'approval_indication',
    topic: 'SNRI fibromyalgia approvals',
    text: 'Duloxetine and milnacipran are FDA-approved SNRI options for fibromyalgia. Verify product labeling and renal/hepatic, BP, and interaction cautions.',
    sourceRefs: [dailyMedSource('dailymed-snri-fibromyalgia', 'DailyMed labeling: duloxetine and milnacipran fibromyalgia', 'duloxetine milnacipran fibromyalgia indication')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bsnri|snris\b/) && has(prompt, /\bfibromyalgia\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-vortioxetine-gad',
    lane: 'approval_indication',
    topic: 'vortioxetine generalized anxiety disorder approval',
    text: 'No. Vortioxetine/Trintellix is not FDA-approved for generalized anxiety disorder; it is FDA-approved for major depressive disorder in adults. Verify current product labeling.',
    sourceRefs: [dailyMedSource('dailymed-vortioxetine-indications', 'DailyMed labeling: vortioxetine indications', 'vortioxetine Trintellix generalized anxiety disorder major depressive disorder')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['vortioxetine', 'trintellix']) && has(prompt, /\bgeneralized anxiety disorder|gad\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-narcolepsy-medications',
    lane: 'approval_indication',
    topic: 'narcolepsy medication approvals',
    text: 'FDA-approved narcolepsy options include modafinil/armodafinil, solriamfetol, pitolisant, oxybate products, and selected stimulant labels. Verify product-specific labeling, age, and symptom target.',
    sourceRefs: [
      dailyMedSource('dailymed-narcolepsy-medications', 'DailyMed labeling: narcolepsy medications', 'modafinil armodafinil solriamfetol pitolisant sodium oxybate narcolepsy indication'),
      approvalSource,
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bnarcolepsy\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-valbenazine-huntington-chorea',
    lane: 'approval_indication',
    topic: 'valbenazine Huntington chorea approval',
    text: 'Yes. Valbenazine/Ingrezza is FDA-approved for chorea associated with Huntington’s disease in adults, in addition to tardive dyskinesia. Verify current product labeling.',
    sourceRefs: [dailyMedSource('dailymed-valbenazine-huntington-chorea', 'DailyMed labeling: valbenazine Huntington chorea', 'valbenazine Ingrezza chorea Huntington disease')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['valbenazine', 'ingrezza']) && has(prompt, /\bhuntington|chorea\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-parkinsons-disease-psychosis',
    lane: 'approval_indication',
    topic: 'Parkinson disease psychosis approval',
    text: 'Pimavanserin/Nuplazid is FDA-approved for hallucinations and delusions associated with Parkinson’s disease psychosis. Verify product labeling and QT warning context.',
    sourceRefs: [dailyMedSource('dailymed-pimavanserin-parkinsons-psychosis', 'DailyMed labeling: pimavanserin Parkinson disease psychosis', 'pimavanserin Nuplazid Parkinson disease psychosis hallucinations delusions')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bparkinson|parkinson's\b/) && has(prompt, /\bpsychosis|hallucinations|delusions|antipsychotic|antipsychotics\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-lithium-under-age-7',
    lane: 'approval_indication',
    topic: 'lithium pediatric age approval',
    text: 'Lithium is FDA-approved for bipolar disorder in children age 7 and older; it is not FDA-approved for children under 7. Verify product labeling and monitoring requirements.',
    sourceRefs: [dailyMedSource('dailymed-lithium-pediatric-age', 'DailyMed labeling: lithium pediatric age 7 bipolar I', 'lithium pediatric patients age 7 bipolar I disorder')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lithium']) && has(prompt, /\bchildren under 7|under age 7|under 7|younger than 7\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-pmdd-medications',
    lane: 'approval_indication',
    topic: 'PMDD medication approvals',
    text: 'Fluoxetine, sertraline, and paroxetine CR are FDA-approved options for PMDD; some drospirenone/ethinyl estradiol products also have PMDD labeling. Verify product-specific labeling.',
    sourceRefs: [dailyMedSource('dailymed-pmdd-medications', 'DailyMed labeling: PMDD fluoxetine sertraline paroxetine drospirenone', 'fluoxetine sertraline paroxetine drospirenone PMDD indication')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bpmdd|premenstrual dysphoric\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-topiramate-aud',
    lane: 'approval_indication',
    topic: 'topiramate alcohol use disorder approval',
    text: 'No. Topiramate is not FDA-approved for alcohol use disorder, though it may appear in off-label evidence discussions. Verify current product labeling.',
    sourceRefs: [dailyMedSource('dailymed-topiramate-indications', 'DailyMed labeling: topiramate indications', 'topiramate alcohol use disorder indication')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['topiramate', 'topamax']) && has(prompt, /\balcohol use disorder|aud|alcohol\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-guanfacine-adult-adhd',
    lane: 'approval_indication',
    topic: 'guanfacine adult ADHD approval',
    text: 'No. Guanfacine ER is not FDA-approved for adult ADHD; it is FDA-approved for ADHD in pediatric patients ages 6 to 17. Verify product labeling and BP/HR cautions.',
    sourceRefs: [dailyMedSource('dailymed-guanfacine-adhd-age', 'DailyMed labeling: guanfacine ER ADHD age range', 'guanfacine extended release ADHD ages 6 to 17 adults')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['guanfacine', 'intuniv']) && has(prompt, /\badult|adults|adhd\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-benzodiazepines-panic-disorder',
    lane: 'approval_indication',
    topic: 'benzodiazepine panic disorder approvals',
    text: 'Alprazolam and clonazepam are FDA-approved benzodiazepines for panic disorder. Verify product labeling and dependence, sedation, respiratory-depression, and substance-use risks.',
    sourceRefs: [dailyMedSource('dailymed-benzodiazepines-panic-disorder', 'DailyMed labeling: alprazolam clonazepam panic disorder', 'alprazolam clonazepam panic disorder indication')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bbenzodiazepine|benzodiazepines|benzo|benzos\b/) && has(prompt, /\bpanic disorder|panic\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-clonidine-tourette',
    lane: 'approval_indication',
    topic: 'clonidine Tourette syndrome approval',
    text: 'No. Clonidine is not FDA-approved for Tourette’s syndrome; clonidine ER is FDA-approved for pediatric ADHD. Verify product labeling and BP/HR cautions.',
    sourceRefs: [dailyMedSource('dailymed-clonidine-tourette-adhd', 'DailyMed labeling: clonidine ER ADHD and Tourette context', 'clonidine Tourette syndrome ADHD indication')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['clonidine', 'kapvay']) && has(prompt, /\btourette|tic\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-insomnia-medications',
    lane: 'approval_indication',
    topic: 'insomnia medication approvals',
    text: 'FDA-approved insomnia medications include zolpidem, eszopiclone, zaleplon, ramelteon, low-dose doxepin, orexin antagonists, and some benzodiazepine hypnotics. Verify product-specific labeling and safety cautions.',
    sourceRefs: [dailyMedSource('dailymed-insomnia-medications', 'DailyMed labeling: insomnia medications', 'zolpidem eszopiclone zaleplon ramelteon doxepin suvorexant lemborexant daridorexant temazepam insomnia')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\binsomnia|sleep\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-varenicline-pregnancy',
    lane: 'approval_indication',
    topic: 'varenicline pregnancy approval',
    text: 'No. Varenicline is FDA-approved for smoking cessation, but it is not specifically FDA-approved for use in pregnancy. Verify pregnancy labeling and obstetric/prescriber guidance.',
    sourceRefs: [dailyMedSource('dailymed-varenicline-pregnancy', 'DailyMed labeling: varenicline pregnancy', 'varenicline pregnancy smoking cessation label')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['varenicline', 'chantix']) && has(prompt, /\bpregnancy|pregnant\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-alzheimers-agitation',
    lane: 'approval_indication',
    topic: 'agitation associated with Alzheimer disease approval',
    text: 'Brexpiprazole/Rexulti and dextromethorphan-bupropion/Auvelity are FDA-approved for agitation associated with dementia due to Alzheimer’s disease in adults. Verify current product labeling.',
    sourceRefs: [
      dailyMedSource('dailymed-brexpiprazole-alzheimers-agitation', 'DailyMed labeling: brexpiprazole Alzheimer dementia agitation', 'brexpiprazole Rexulti agitation associated with dementia due to Alzheimer disease'),
      auvelityAlzheimersAgitationSource,
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bagitation\b/) && has(prompt, /\balzheimer|alzheimer's|dementia\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'approval-flumazenil-benzo-withdrawal',
    lane: 'approval_indication',
    topic: 'flumazenil long-term benzodiazepine withdrawal approval',
    text: 'No. Flumazenil is not FDA-approved for long-term benzodiazepine withdrawal treatment; labeling focuses on benzodiazepine reversal contexts and seizure/withdrawal risk. Verify toxicology/local protocol guidance.',
    sourceRefs: [dailyMedSource('dailymed-flumazenil-benzo-withdrawal', 'DailyMed labeling: flumazenil benzodiazepine reversal withdrawal seizures', 'flumazenil benzodiazepine withdrawal seizure indication')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['flumazenil']) && has(prompt, /\blong term|long-term|withdrawal|benzodiazepine|benzo\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'pediatric-fluoxetine-mdd-age-8',
    lane: 'approval_indication',
    topic: 'fluoxetine pediatric MDD approval',
    text: 'Yes. Fluoxetine is FDA-approved for pediatric major depressive disorder in patients ages 8 to 18. Verify product labeling and the boxed warning for suicidal thoughts and behaviors in youth.',
    sourceRefs: [dailyMedSource('dailymed-fluoxetine-pediatric-mdd', 'DailyMed labeling: fluoxetine pediatric MDD age 8', 'fluoxetine pediatric major depressive disorder age 8')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['fluoxetine', 'prozac']) && has(prompt, /\bmdd|major depressive|depression\b/) && has(prompt, /\bchild|children|pediatric|aged 8|age 8|youth\b/),
  },
  {
    id: 'pediatric-methylphenidate-max-dose',
    lane: 'approval_indication',
    topic: 'methylphenidate pediatric maximum dose reference',
    text: 'The pediatric label maximum for methylphenidate depends on the exact product and formulation, so there is no single universal maximum for a 10-year-old. Verify the product label, weight/age context, BP/HR, appetite/growth, and tic/substance-risk cautions.',
    sourceRefs: [dailyMedSource('dailymed-methylphenidate-pediatric-dose', 'DailyMed labeling: methylphenidate pediatric dose limits', 'methylphenidate pediatric maximum dose age 10 label')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['methylphenidate', 'ritalin', 'concerta']) && has(prompt, /\bmaximum|max\b/) && has(prompt, /\b10 year|10-year|child|children|pediatric\b/),
  },
  {
    id: 'pediatric-aripiprazole-tourette',
    lane: 'approval_indication',
    topic: 'aripiprazole pediatric Tourette approval',
    text: 'Yes. Aripiprazole is FDA-approved for Tourette’s disorder in pediatric patients ages 6 to 18. Verify product labeling and EPS/metabolic safety cautions.',
    sourceRefs: [dailyMedSource('dailymed-aripiprazole-tourette-pediatric', 'DailyMed labeling: aripiprazole pediatric Tourette disorder', 'aripiprazole Tourette disorder pediatric age 6')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['aripiprazole', 'abilify']) && has(prompt, /\btourette|tic\b/) && has(prompt, /\bchild|children|pediatric|youth\b/),
  },
  {
    id: 'pediatric-ssri-suicidality-risk',
    lane: 'approval_indication',
    topic: 'SSRI suicidality risk in youth',
    text: 'Pediatric antidepressant labels carry a boxed warning for increased risk of suicidal thoughts and behaviors in children, adolescents, and young adults. Risk review includes prior suicidality, activation/agitation, bipolar risk, dose changes, and close monitoring.',
    sourceRefs: [dailyMedSource('dailymed-antidepressant-youth-suicidality', 'DailyMed labeling: antidepressant boxed warning youth suicidality', 'SSRI pediatric suicidality boxed warning children adolescents')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bssri|ssris|antidepressant|antidepressants\b/) && has(prompt, /\bsuicidality|suicidal|suicide\b/) && has(prompt, /\byouth|child|children|pediatric|adolescent\b/),
  },
  {
    id: 'pediatric-lisdexamfetamine-starting-dose',
    lane: 'approval_indication',
    topic: 'lisdexamfetamine pediatric starting dose reference',
    text: 'The FDA-approved pediatric ADHD starting reference for lisdexamfetamine/Vyvanse age 6 and older is 30 mg once daily in the morning. Verify product labeling and stimulant safety cautions.',
    sourceRefs: [dailyMedSource('dailymed-lisdexamfetamine-pediatric-start', 'DailyMed labeling: lisdexamfetamine pediatric starting dose', 'lisdexamfetamine Vyvanse pediatric starting dose 30 mg age 6')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lisdexamfetamine', 'vyvanse']) && has(prompt, /\bstarting|initial|start\b/) && has(prompt, /\b6-year|6 year|age 6|pediatric|child\b/),
  },
  {
    id: 'pediatric-atomoxetine-controlled-substance',
    lane: 'approval_indication',
    topic: 'atomoxetine controlled substance status',
    text: 'No. Atomoxetine/Strattera is not a controlled substance; it is FDA-approved for pediatric ADHD. Verify product labeling for suicidality, liver injury, BP/HR, and CYP2D6 cautions.',
    sourceRefs: [dailyMedSource('dailymed-atomoxetine-controlled-substance', 'DailyMed labeling: atomoxetine controlled substance and pediatric ADHD', 'atomoxetine controlled substance pediatric ADHD label')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['atomoxetine', 'strattera']) && has(prompt, /\bcontrolled substance|controlled\b/),
  },
  {
    id: 'pediatric-risperidone-mania',
    lane: 'approval_indication',
    topic: 'risperidone pediatric mania approval',
    text: 'Yes. Risperidone is FDA-approved for short-term treatment of acute manic or mixed episodes of bipolar I disorder in pediatric patients ages 10 to 17. Verify product labeling and metabolic/EPS/prolactin risks.',
    sourceRefs: [dailyMedSource('dailymed-risperidone-pediatric-mania', 'DailyMed labeling: risperidone pediatric bipolar mania', 'risperidone pediatric bipolar mania ages 10 to 17')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['risperidone', 'risperdal']) && has(prompt, /\bpediatric|child|children|youth|mania|manic\b/) && has(prompt, /\bmania|manic|bipolar\b/),
  },
  {
    id: 'pediatric-dmdd-age-limit',
    lane: 'approval_indication',
    topic: 'DMDD pediatric diagnostic age range',
    text: 'DMDD is a pediatric diagnostic label with age-bound criteria; diagnosis is generally made for ages 6 through 18, with symptom onset before age 10. Use DSM/current diagnostic references rather than reproducing criteria verbatim.',
    sourceRefs: [referenceSource('nimh-dmdd-overview', 'NIMH overview: disruptive mood dysregulation disorder', 'https://www.nimh.nih.gov/health/publications/disruptive-mood-dysregulation-disorder')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bdmdd|disruptive mood dysregulation\b/) && has(prompt, /\bage limit|age range|diagnosing|diagnosis\b/),
  },
  {
    id: 'pediatric-gad-duloxetine',
    lane: 'approval_indication',
    topic: 'pediatric GAD medication approval',
    text: 'Duloxetine is FDA-approved for generalized anxiety disorder in pediatric patients ages 7 to 17. Verify product labeling and suicidality, BP, hepatic, renal, and interaction cautions.',
    sourceRefs: [dailyMedSource('dailymed-duloxetine-pediatric-gad', 'DailyMed labeling: duloxetine pediatric GAD', 'duloxetine pediatric generalized anxiety disorder ages 7 to 17')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bpediatric|child|children\b/) && has(prompt, /\bgad|generalized anxiety disorder\b/) && isApprovalQuestion(prompt),
  },
  {
    id: 'pediatric-guanfacine-rebound-hypertension',
    lane: 'approval_indication',
    topic: 'guanfacine rebound hypertension',
    text: 'Yes. Guanfacine ER is FDA-approved for pediatric ADHD, and its labeling warns that abrupt discontinuation can cause rebound hypertension. Verify BP/HR, sedation, and taper guidance.',
    sourceRefs: [dailyMedSource('dailymed-guanfacine-rebound-hypertension', 'DailyMed labeling: guanfacine rebound hypertension', 'guanfacine extended release rebound hypertension ADHD pediatric label')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['guanfacine', 'intuniv']) && has(prompt, /\brebound hypertension|stopped abruptly|abruptly\b/),
  },
  {
    id: 'pediatric-clonidine-adhd-sleep',
    lane: 'approval_indication',
    topic: 'clonidine ADHD sleep use',
    text: 'Clonidine ER is FDA-approved for pediatric ADHD, but clonidine for ADHD-related sleep is off-label. Verify product labeling and BP/HR, sedation, and rebound-hypertension cautions.',
    sourceRefs: [dailyMedSource('dailymed-clonidine-adhd-sleep', 'DailyMed labeling: clonidine ER pediatric ADHD', 'clonidine extended release pediatric ADHD sleep off label')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['clonidine', 'kapvay']) && has(prompt, /\badhd\b/) && has(prompt, /\bsleep|insomnia\b/),
  },
  {
    id: 'pediatric-separation-anxiety-symptoms',
    lane: 'approval_indication',
    topic: 'separation anxiety symptom summary',
    text: 'Separation anxiety disorder is a pediatric diagnostic label involving developmentally excessive fear or anxiety about separation, with worries, avoidance/refusal, sleep difficulty, nightmares, or physical complaints. Use DSM/current references for formal criteria.',
    sourceRefs: [referenceSource('nimh-anxiety-disorders-overview', 'NIMH overview: anxiety disorders', 'https://www.nimh.nih.gov/health/topics/anxiety-disorders')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bseparation anxiety\b/) && has(prompt, /\bsymptoms|signs|what are\b/),
  },
  {
    id: 'pediatric-stimulants-tics',
    lane: 'approval_indication',
    topic: 'stimulants and tics in children',
    text: 'Stimulant pediatric labels warn about tics/Tourette’s history, but evidence is mixed and tics are not automatically caused by stimulants. Review baseline tics, timing, dose changes, family history, and product label.',
    sourceRefs: [dailyMedSource('dailymed-stimulants-tics-pediatric', 'DailyMed labeling: stimulant tic warnings pediatric ADHD', 'methylphenidate amphetamine pediatric tics Tourette label')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bstimulant|stimulants|methylphenidate|amphetamine\b/) && has(prompt, /\btic|tics|tourette\b/) && has(prompt, /\bchild|children|pediatric\b/),
  },
  {
    id: 'pediatric-lithium-adolescent-bipolar',
    lane: 'approval_indication',
    topic: 'lithium adolescents bipolar approval and safety',
    text: 'Lithium is FDA-approved for acute manic or mixed episodes of bipolar I disorder in pediatric patients ages 7 to 17. Verify product labeling, levels, renal/thyroid/calcium monitoring, interactions, hydration/sodium, and toxicity risk.',
    sourceRefs: [dailyMedSource('dailymed-lithium-adolescent-bipolar', 'DailyMed labeling: lithium pediatric bipolar I ages 7 to 17', 'lithium pediatric bipolar I disorder ages 7 to 17')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lithium']) && has(prompt, /\badolescent|adolescents|pediatric|child|children\b/) && has(prompt, /\bbipolar\b/),
  },
  {
    id: 'pediatric-sertraline-ocd-dose',
    lane: 'approval_indication',
    topic: 'sertraline pediatric OCD dose reference',
    text: 'Sertraline is FDA-approved for pediatric OCD. Label starting references are commonly 25 mg daily for ages 6 to 12 and 50 mg daily for ages 13 to 17; verify product labeling.',
    sourceRefs: [dailyMedSource('dailymed-sertraline-pediatric-ocd-dose', 'DailyMed labeling: sertraline pediatric OCD dose', 'sertraline pediatric OCD starting dose 25 mg 50 mg')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['sertraline', 'zoloft']) && has(prompt, /\bpediatric|child|children|adolescent|ocd\b/) && has(prompt, /\bdose|dosing\b/),
  },
  {
    id: 'pediatric-imipramine-enuresis',
    lane: 'approval_indication',
    topic: 'imipramine enuresis approval',
    text: 'Yes. Imipramine is FDA-approved for pediatric enuresis in children age 6 and older. Verify product labeling and TCA toxicity, cardiac/QT, overdose, and anticholinergic risks.',
    sourceRefs: [dailyMedSource('dailymed-imipramine-enuresis', 'DailyMed labeling: imipramine enuresis children age 6', 'imipramine enuresis children age 6 label')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['imipramine', 'tofranil']) && has(prompt, /\benuresis|bedwetting\b/),
  },
  {
    id: 'pediatric-ssri-activation',
    lane: 'approval_indication',
    topic: 'SSRI activation in children',
    text: 'Yes. Pediatric SSRI labeling warns about activation-type symptoms such as agitation, irritability, insomnia, impulsivity, hypomania/mania, and suicidality signal changes. Review bipolar risk, dose changes, timing, and monitoring.',
    sourceRefs: [dailyMedSource('dailymed-ssri-pediatric-activation', 'DailyMed labeling: SSRI pediatric activation and suicidality', 'SSRI pediatric activation agitation mania suicidality label')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bssri|ssris\b/) && has(prompt, /\bactivation\b/) && has(prompt, /\bchild|children|pediatric\b/),
  },
  {
    id: 'pediatric-vanderbilt-assessment',
    lane: 'approval_indication',
    topic: 'Vanderbilt assessment tool',
    text: 'The Vanderbilt is a pediatric ADHD symptom and impairment rating scale used to gather parent/teacher observations; it is not a medication label or a standalone diagnosis. Interpret with clinical interview and school/developmental context.',
    sourceRefs: [referenceSource('nia-vanderbilt-adhd-scale-overview', 'NICHQ Vanderbilt assessment scale overview', 'https://nichq.org/downloadable/nichq-vanderbilt-assessment-scales/')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bvanderbilt\b/) && has(prompt, /\bassessment|tool|used for\b/),
  },
  {
    id: 'pediatric-fluvoxamine-ocd',
    lane: 'approval_indication',
    topic: 'fluvoxamine pediatric OCD approval',
    text: 'Yes. Fluvoxamine is FDA-approved for pediatric OCD, commonly ages 8 to 17 depending on product label. Verify product labeling, CYP interactions, suicidality warning, and titration limits.',
    sourceRefs: [dailyMedSource('dailymed-fluvoxamine-pediatric-ocd', 'DailyMed labeling: fluvoxamine pediatric OCD', 'fluvoxamine pediatric OCD age 8 label')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['fluvoxamine', 'luvox']) && has(prompt, /\bpediatric|child|children|ocd\b/),
  },
  {
    id: 'geriatric-start-low-go-slow',
    lane: 'geriatric_reference',
    topic: 'start low go slow in older adults',
    text: 'In older adults, "start low, go slow" means using lower initial doses and slower titration because adverse-effect risk is higher from falls, orthostasis, cognition, renal/hepatic clearance, and polypharmacy.',
    sourceRefs: [beersSource],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\b(start low|go slow|start low go slow)\b/) && has(prompt, /\b(elderly|older adult|older adults|geriatric)\b/),
  },
  {
    id: 'geriatric-beers-benzodiazepines',
    lane: 'geriatric_reference',
    topic: 'benzodiazepines on Beers Criteria',
    text: 'Yes. Benzodiazepines are generally listed as potentially inappropriate for older adults because sedation, delirium, cognitive impairment, falls/fractures, and motor-vehicle crash risk are higher.',
    sourceRefs: [beersSource, dailyMedSource('dailymed-benzodiazepine-geriatric-risk', 'DailyMed labeling: benzodiazepine geriatric cautions', 'benzodiazepine elderly sedation falls cognitive impairment')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bbeers\b/) && has(prompt, /\bbenzodiazepine|benzodiazepines|benzo|benzos\b/),
  },
  {
    id: 'geriatric-antipsychotics-dementia-psychosis',
    lane: 'geriatric_reference',
    topic: 'antipsychotic risk in dementia-related psychosis',
    text: 'Antipsychotics, including risperidone, carry a boxed warning for increased mortality in older adults with dementia-related psychosis; risk often involves cardiovascular events or infections such as pneumonia. They are not routine benign dementia-behavior medications.',
    sourceRefs: [dementiaAntipsychoticSource],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bantipsychotic|antipsychotics|risperidone|quetiapine|olanzapine|haloperidol\b/) && has(prompt, /\bdementia-related psychosis|dementia related psychosis|dementia|alzheimer|alzheimer's\b/) && has(prompt, /\brisk|boxed|warning|mortality|psychosis|aggression|behavior\b/),
  },
  {
    id: 'geriatric-post-stroke-depression-antidepressant',
    lane: 'geriatric_reference',
    topic: 'post-stroke depression antidepressant reference',
    text: 'There is no single universally preferred antidepressant for post-stroke depression. SSRIs are commonly used, but in older adults selection depends on bleeding, hyponatremia, fall, seizure, interaction, and tolerability risk.',
    sourceRefs: [postStrokeDepressionSource],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bpost-stroke depression|post stroke depression|poststroke depression\b/) && has(prompt, /\bpreferred|antidepressant|treatment|medication\b/),
  },
  {
    id: 'geriatric-donepezil-mci',
    lane: 'geriatric_reference',
    topic: 'donepezil for mild cognitive impairment',
    text: 'Donepezil is not generally established as effective for mild cognitive impairment alone. In older adults, cholinesterase-inhibitor risk includes GI effects, bradycardia/syncope, weight loss, sleep effects, and falls.',
    sourceRefs: [mciGuidelineSource, dailyMedSource('dailymed-donepezil-safety', 'DailyMed labeling: donepezil adverse effects', 'donepezil bradycardia syncope nausea weight loss insomnia')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['donepezil', 'aricept']) && has(prompt, /\bmild cognitive impairment|mci\b/),
  },
  {
    id: 'geriatric-memantine-galantamine-combination',
    lane: 'geriatric_reference',
    topic: 'memantine and galantamine combination',
    text: 'Memantine is sometimes combined with a cholinesterase inhibitor such as galantamine in dementia care, but it is not automatically "safe." In older adults, review bradycardia/syncope, GI effects, renal function, falls, and interaction risk.',
    sourceRefs: [
      dailyMedSource('dailymed-memantine-label', 'DailyMed labeling: memantine', 'memantine dementia renal adverse reactions'),
      dailyMedSource('dailymed-galantamine-label', 'DailyMed labeling: galantamine', 'galantamine bradycardia syncope dementia'),
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['memantine', 'namenda']) && hasAny(prompt, ['galantamine', 'razadyne']) && isInteractionQuestion(prompt),
  },
  {
    id: 'geriatric-lorazepam-very-elderly-dose',
    lane: 'geriatric_reference',
    topic: 'lorazepam dose in very elderly adults',
    text: 'Lorazepam dosing in an 85-year-old should be individualized and generally lower than routine adult dosing; benzodiazepines carry older-adult risk for sedation, delirium, falls, and respiratory depression. Verify indication and local geriatric guidance rather than using a default adult dose.',
    sourceRefs: [beersSource, dailyMedSource('dailymed-lorazepam-geriatric', 'DailyMed labeling: lorazepam geriatric use', 'lorazepam elderly geriatric dose sedation')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lorazepam', 'ativan']) && has(prompt, /\b(85|80|elderly|older adult|older adults|geriatric)\b/) && has(prompt, /\bdose|dosing\b/),
  },
  {
    id: 'geriatric-diphenhydramine-confusion',
    lane: 'geriatric_reference',
    topic: 'diphenhydramine confusion in older adults',
    text: 'Yes. Diphenhydramine has strong anticholinergic effects and can worsen confusion, delirium, urinary retention, constipation, and fall risk in older adults.',
    sourceRefs: [beersSource, dailyMedSource('dailymed-diphenhydramine-anticholinergic', 'DailyMed labeling: diphenhydramine anticholinergic effects', 'diphenhydramine elderly anticholinergic confusion delirium')],
    matches: (prompt) => !has(prompt, /\b(my patient|pt\b|patient has|currently|right now|what should i do|should i|can i give|can i start)\b/) && hasAny(prompt, ['diphenhydramine', 'benadryl']) && has(prompt, /\bconfusion|confused|delirium|elderly|older adult|older adults|geriatric\b/),
  },
  {
    id: 'geriatric-mirtazapine-appetite',
    lane: 'geriatric_reference',
    topic: 'mirtazapine appetite stimulation in geriatrics',
    text: 'Mirtazapine can increase appetite/weight and is sometimes considered when depression or insomnia coexist, but it is not a benign appetite stimulant in older adults. Sedation, orthostasis, falls, hyponatremia, and weight/metabolic risk matter.',
    sourceRefs: [dailyMedSource('dailymed-mirtazapine-appetite-weight', 'DailyMed labeling: mirtazapine appetite/weight and sedation', 'mirtazapine increased appetite weight gain somnolence geriatric')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['mirtazapine', 'remeron']) && has(prompt, /\bappetite|weight|stimulation|stimulate\b/) && has(prompt, /\bgeriatric|elderly|older adult|older adults\b/),
  },
  {
    id: 'geriatric-cholinesterase-inhibitor-side-effects',
    lane: 'geriatric_reference',
    topic: 'cholinesterase inhibitor side effects',
    text: 'Cholinesterase inhibitors can cause nausea, vomiting, diarrhea, weight loss, bradycardia, syncope, sleep disturbance, and vivid dreams. In older adults, bradycardia/syncope, falls, and weight-loss risk are especially important.',
    sourceRefs: [
      dailyMedSource('dailymed-donepezil-rivastigmine-galantamine-adverse', 'DailyMed labeling: cholinesterase inhibitor adverse effects', 'donepezil rivastigmine galantamine bradycardia syncope weight loss nausea'),
      beersSource,
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bcholinesterase inhibitor|cholinesterase inhibitors|donepezil|rivastigmine|galantamine\b/) && has(prompt, /\bside effect|side effects|adverse|risk\b/),
  },
  {
    id: 'geriatric-lithium-toxicity-risk',
    lane: 'geriatric_reference',
    topic: 'lithium toxicity risk in older adults',
    text: 'Yes. Older adults can develop lithium toxicity more easily because renal clearance, dehydration, sodium changes, and interacting drugs can shift levels. Toxicity risk is higher with tremor, GI symptoms, confusion, ataxia, weakness, or sedation.',
    sourceRefs: [dailyMedSource('dailymed-lithium-geriatric-toxicity', 'DailyMed labeling: lithium geriatric use and toxicity', 'lithium geriatric renal toxicity dehydration sodium elderly')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lithium']) && has(prompt, /\b(elderly|older adult|older adults|geriatric)\b/) && has(prompt, /\btoxicity|toxic\b/),
  },
  {
    id: 'geriatric-trazodone-sleep-dementia',
    lane: 'geriatric_reference',
    topic: 'trazodone for sleep in dementia',
    text: 'Do not frame trazodone as simply safe for sleep in dementia. In older adults, risk includes sedation, orthostasis, falls, cognitive worsening, QT context, and additive CNS depression with alcohol/opioids/benzodiazepines.',
    sourceRefs: [dailyMedSource('dailymed-trazodone-sedation-orthostasis', 'DailyMed labeling: trazodone sedation and orthostasis', 'trazodone sedation orthostatic hypotension QT elderly dementia')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['trazodone']) && has(prompt, /\bsleep|insomnia\b/) && has(prompt, /\bdementia|alzheimer|alzheimer's|elderly|older adult|older adults|geriatric\b/),
  },
  {
    id: 'geriatric-quetiapine-falls',
    lane: 'geriatric_reference',
    topic: 'quetiapine fall risk in older adults',
    text: 'Quetiapine can increase fall risk in older adults through sedation, orthostatic hypotension, dizziness, and anticholinergic burden. Dementia-related psychosis also carries the antipsychotic boxed-warning mortality risk.',
    sourceRefs: [dementiaAntipsychoticSource, dailyMedSource('dailymed-quetiapine-falls-orthostasis', 'DailyMed labeling: quetiapine orthostasis/somnolence', 'quetiapine somnolence orthostatic hypotension falls elderly')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['quetiapine', 'seroquel']) && has(prompt, /\bfall|falls|fall risk\b/),
  },
  {
    id: 'geriatric-risperidone-aggression-alzheimers',
    lane: 'geriatric_reference',
    topic: 'risperidone for aggression in Alzheimer disease',
    text: 'Risperidone may be discussed for severe dementia-related aggression, but it is not a low-risk routine sleep/behavior medication. In older adults with Alzheimer’s, antipsychotics carry mortality, stroke, sedation/fall, EPS, and metabolic risk.',
    sourceRefs: [dementiaAntipsychoticSource, dailyMedSource('dailymed-risperidone-dementia-warning', 'DailyMed labeling: risperidone dementia-related psychosis warning', 'risperidone elderly patients dementia-related psychosis increased mortality')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['risperidone', 'risperdal']) && has(prompt, /\baggression|agitation|behavior\b/) && has(prompt, /\balzheimer|alzheimer's|dementia\b/),
  },
  {
    id: 'geriatric-ect-over-80',
    lane: 'geriatric_reference',
    topic: 'ECT in patients over 80',
    text: 'ECT can be used in very old adults when clinically indicated, but "safe" is not automatic. In older adults, risk review centers on anesthesia/cardiac status, cognition/delirium, medical comorbidity, medications, consent, and monitoring.',
    sourceRefs: [ectOlderAdultSource],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bect|electroconvulsive\b/) && has(prompt, /\bover 80|older adult|older adults|elderly|geriatric|very old\b/),
  },
  {
    id: 'geriatric-citalopram-qtc',
    lane: 'geriatric_reference',
    topic: 'citalopram QTc in elderly patients',
    text: 'Yes. Citalopram has dose-related QTc risk, and FDA guidance limits the maximum recommended dose to 20 mg/day in adults older than 60. Review other QT drugs, electrolytes, cardiac disease, and ECG/EKG context. This should be verified against a current drug-interaction reference.',
    sourceRefs: [citalopramFdaSource, dailyMedSource('dailymed-citalopram-qtc-older-adults', 'DailyMed labeling: citalopram QTc and older adult dose limit', 'citalopram QT prolongation older than 60 20 mg')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['citalopram', 'celexa']) && has(prompt, /\bqtc|qt|elderly|older adult|older adults|geriatric\b/),
  },
  {
    id: 'geriatric-rivastigmine-starting-dose',
    lane: 'geriatric_reference',
    topic: 'rivastigmine starting reference',
    text: 'Rivastigmine reference starting options are commonly 1.5 mg twice daily orally or a 4.6 mg/24-hour patch. In older adults, monitor GI intolerance, weight loss, bradycardia/syncope, falls, and patch-site risk.',
    sourceRefs: [dailyMedSource('dailymed-rivastigmine-starting-dose', 'DailyMed labeling: rivastigmine dosing and warnings', 'rivastigmine starting dose 1.5 mg twice daily 4.6 mg patch')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['rivastigmine', 'exelon']) && has(prompt, /\b(starting|initial|start)\b/) && has(prompt, /\bdose|dosing\b/),
  },
  {
    id: 'geriatric-lithium-nephropathy',
    lane: 'geriatric_reference',
    topic: 'lithium-induced nephropathy in older adults',
    text: 'Yes. Older adults can develop lithium-associated renal impairment/nephropathy, especially with long exposure, higher levels, dehydration, CKD, or interacting drugs. Risk review should include baseline/trend eGFR, creatinine, sodium/fluid status, and lithium levels.',
    sourceRefs: [dailyMedSource('dailymed-lithium-renal-geriatric', 'DailyMed labeling: lithium renal impairment and geriatric use', 'lithium renal impairment nephropathy geriatric eGFR creatinine')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lithium']) && has(prompt, /\bnephropathy|kidney|renal impairment|renal disease|ckd\b/) && has(prompt, /\bolder adult|older adults|elderly|geriatric\b/),
  },
  {
    id: 'geriatric-nortriptyline-vs-amitriptyline',
    lane: 'geriatric_reference',
    topic: 'nortriptyline versus amitriptyline in geriatrics',
    text: 'Nortriptyline is often preferred over amitriptyline when a TCA is used because it is usually less anticholinergic/sedating, but TCAs still carry older-adult risk for falls, orthostasis, constipation/urinary retention, cognition, and arrhythmia.',
    sourceRefs: [beersSource, dailyMedSource('dailymed-tca-geriatric-caution', 'DailyMed labeling: TCA geriatric cautions', 'nortriptyline amitriptyline elderly anticholinergic orthostatic arrhythmia')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['nortriptyline', 'pamelor']) && hasAny(prompt, ['amitriptyline', 'elavil']) && has(prompt, /\bgeriatric|elderly|older adult|older adults|preferred|prefer\b/),
  },
  {
    id: 'adverse-ziprasidone-qtc',
    lane: 'adverse_effect_yes_no',
    topic: 'ziprasidone QTc prolongation',
    text: 'Yes. Ziprasidone can cause QTc prolongation; QT-risk factors include other QT-prolonging meds, low potassium/magnesium, cardiac history, syncope/palpitations, and ECG context.',
    sourceRefs: [dailyMedSource('dailymed-ziprasidone-qtc', 'DailyMed labeling: ziprasidone QTc prolongation', 'ziprasidone QT interval prolongation')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['ziprasidone', 'geodon']) && has(prompt, /\bqtc|qt\b/) && isAdverseEffectQuestion(prompt),
  },
  {
    id: 'adverse-clozapine-agranulocytosis',
    lane: 'adverse_effect_yes_no',
    topic: 'clozapine agranulocytosis',
    text: 'Clozapine carries a serious agranulocytosis/neutropenia risk, so ANC monitoring and infection-symptom review remain central to clozapine safety.',
    sourceRefs: [dailyMedSource('dailymed-clozapine-agranulocytosis', 'DailyMed labeling: clozapine agranulocytosis and ANC monitoring', 'clozapine agranulocytosis ANC monitoring')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['clozapine', 'clozaril']) && has(prompt, /\bagranulocytosis|neutropenia|anc\b/) && isAdverseEffectQuestion(prompt),
  },
  {
    id: 'adverse-olanzapine-weight-gain',
    lane: 'adverse_effect_yes_no',
    topic: 'olanzapine weight gain',
    text: 'Yes. Olanzapine is associated with significant weight gain and metabolic risk, including glucose/A1c and lipid changes; monitor weight/BMI and metabolic labs.',
    sourceRefs: [dailyMedSource('dailymed-olanzapine-weight-metabolic', 'DailyMed labeling: olanzapine weight gain and metabolic changes', 'olanzapine weight gain metabolic glucose lipids')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['olanzapine', 'zyprexa']) && has(prompt, /\bweight gain|metabolic\b/) && isAdverseEffectQuestion(prompt),
  },
  {
    id: 'adverse-ssri-hyponatremia-elderly',
    lane: 'adverse_effect_yes_no',
    topic: 'SSRI hyponatremia in elderly',
    text: 'Yes. SSRIs can cause hyponatremia/SIADH, with higher risk in older adults and elderly patients, especially with diuretics, low baseline sodium, or symptoms such as confusion, falls, or seizures.',
    sourceRefs: [dailyMedSource('dailymed-ssri-hyponatremia', 'DailyMed labeling: SSRI hyponatremia/SIADH warnings', 'SSRI hyponatremia SIADH elderly')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bssri|ssris\b/) && has(prompt, /\bhyponatremia|siadh|sodium\b/) && has(prompt, /\belderly|older|geriatric\b/) && isAdverseEffectQuestion(prompt),
  },
  {
    id: 'adverse-venlafaxine-blood-pressure',
    lane: 'adverse_effect_yes_no',
    topic: 'venlafaxine blood pressure',
    text: 'Yes. Venlafaxine can increase blood pressure in a dose-related way; check baseline BP, dose, cardiovascular risk, and follow-up BP monitoring.',
    sourceRefs: [dailyMedSource('dailymed-venlafaxine-bp', 'DailyMed labeling: venlafaxine blood pressure increases', 'venlafaxine blood pressure dose related increase')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['venlafaxine', 'effexor']) && has(prompt, /\bblood pressure|hypertension|bp\b/) && isAdverseEffectQuestion(prompt),
  },
  {
    id: 'adverse-serotonin-syndrome-symptoms',
    lane: 'adverse_effect_yes_no',
    topic: 'serotonin syndrome symptoms',
    text: 'Serotonin toxicity risk classically involves a triad of mental status change, autonomic instability, and neuromuscular hyperactivity, with symptoms such as clonus, hyperreflexia, tremor, fever, diarrhea, and agitation. Confirm serotonergic exposures, recent dose changes, co-ingestions, vitals, and severity. Untreated serotonin syndrome can progress to hyperthermia, rigidity, seizures, rhabdomyolysis, renal failure, and death; suspected moderate/severe cases need urgent evaluation and no casual reassurance.',
    sourceRefs: [dailyMedSource('dailymed-serotonin-syndrome', 'DailyMed labeling: serotonin syndrome symptoms and serotonergic warnings', 'serotonin syndrome mental status autonomic neuromuscular clonus')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bserotonin syndrome|serotonin toxicity\b/) && has(prompt, /\bsymptoms|signs|what are|what is\b/),
  },
  {
    id: 'adverse-mirtazapine-sedation',
    lane: 'adverse_effect_yes_no',
    topic: 'mirtazapine sedation',
    text: 'Yes. Mirtazapine commonly causes sedation/somnolence; fall risk, other sedatives, alcohol, and next-day impairment matter clinically.',
    sourceRefs: [dailyMedSource('dailymed-mirtazapine-sedation', 'DailyMed labeling: mirtazapine somnolence/sedation', 'mirtazapine somnolence sedation')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['mirtazapine', 'remeron']) && has(prompt, /\bsedation|sedating|somnolence|sleepy\b/) && isAdverseEffectQuestion(prompt),
  },
  {
    id: 'adverse-lithium-tremor',
    lane: 'adverse_effect_yes_no',
    topic: 'lithium tremor',
    text: 'Yes. Lithium can cause tremor; toxicity risk is higher if tremor is coarse/worsening or occurs with GI symptoms, confusion, ataxia, weakness, or sedation.',
    sourceRefs: [dailyMedSource('dailymed-lithium-tremor', 'DailyMed labeling: lithium tremor and toxicity symptoms', 'lithium tremor toxicity symptoms')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lithium']) && has(prompt, /\btremor\b/) && isAdverseEffectQuestion(prompt),
  },
  {
    id: 'adverse-clozapine-myocarditis',
    lane: 'adverse_effect_yes_no',
    topic: 'clozapine myocarditis',
    text: 'Yes. Clozapine carries myocarditis/cardiomyopathy risk; concerning symptoms include chest pain, dyspnea, persistent tachycardia, palpitations, fever/flu-like symptoms, hypotension, or heart-failure signs.',
    sourceRefs: [dailyMedSource('dailymed-clozapine-myocarditis', 'DailyMed labeling: clozapine myocarditis/cardiomyopathy', 'clozapine myocarditis cardiomyopathy tachycardia chest pain')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['clozapine', 'clozaril']) && has(prompt, /\bmyocarditis|cardiomyopathy\b/) && isAdverseEffectQuestion(prompt),
  },
  {
    id: 'adverse-benzodiazepines-anterograde-amnesia',
    lane: 'adverse_effect_yes_no',
    topic: 'benzodiazepine anterograde amnesia',
    text: 'Yes. Benzodiazepines carry anterograde amnesia and cognitive/psychomotor impairment risk, especially with higher doses, older age, alcohol, opioids, or other sedatives.',
    sourceRefs: [dailyMedSource('dailymed-benzodiazepine-amnesia', 'DailyMed labeling: benzodiazepine anterograde amnesia', 'benzodiazepine anterograde amnesia alprazolam lorazepam diazepam')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bbenzodiazepine|benzodiazepines|benzo|benzos|alprazolam|lorazepam|diazepam|clonazepam\b/) && has(prompt, /\banterograde amnesia|amnesia\b/) && isAdverseEffectQuestion(prompt),
  },
  {
    id: 'monitoring-sga-metabolic-protocol',
    lane: 'monitoring_reference',
    topic: 'second-generation antipsychotic metabolic monitoring',
    text: 'SGA metabolic monitoring is for weight/metabolic risk: monitor baseline and follow-up weight/BMI, BP, glucose or A1c, and lipids. Context includes the specific antipsychotic, baseline metabolic risk, dose/duration, and local protocol.',
    sourceRefs: [metabolicMonitoringSource, dailyMedSource('dailymed-sga-metabolic-monitoring', 'DailyMed labeling: atypical antipsychotic metabolic monitoring', 'atypical antipsychotic metabolic monitoring glucose lipids weight')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\b(second generation|second-generation|sga|atypical|antipsychotic|antipsychotics)\b/) && has(prompt, /\bmetabolic|weight|a1c|glucose|lipid|lipids|bp|blood pressure\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'adverse-carbamazepine-sjs',
    lane: 'adverse_effect_yes_no',
    topic: 'carbamazepine Stevens-Johnson syndrome',
    text: 'Yes. Carbamazepine carries serious rash/SJS/TEN risk; rash with mucosal lesions, fever, blistering, or systemic symptoms needs urgent evaluation. HLA-B*1502 screening is recommended before use in genetically at-risk ancestry groups.',
    sourceRefs: [dailyMedSource('dailymed-carbamazepine-sjs-hla', 'DailyMed labeling: carbamazepine SJS/TEN and HLA-B*1502', 'carbamazepine Stevens Johnson syndrome HLA-B*1502')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['carbamazepine', 'tegretol']) && has(prompt, /\bstevens-johnson|stevens johnson|sjs|ten|rash\b/) && isAdverseEffectQuestion(prompt),
  },
  {
    id: 'adverse-valproate-alopecia',
    lane: 'adverse_effect_yes_no',
    topic: 'valproate hair loss',
    text: 'Yes. Valproate/divalproex can cause alopecia or hair-loss risk; it is often dose-related and may be reversible, but verify with current labeling and clinical context.',
    sourceRefs: [dailyMedSource('dailymed-valproate-alopecia', 'DailyMed labeling: valproate alopecia/hair loss', 'valproate divalproex alopecia hair loss')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bvalproate|divalproex|depakote|vpa\b/) && has(prompt, /\bhair loss|alopecia\b/),
  },
  {
    id: 'adverse-nms-signs',
    lane: 'adverse_effect_yes_no',
    topic: 'neuroleptic malignant syndrome signs',
    text: 'NMS risk is urgent: key signs include fever, severe rigidity, altered mental status, autonomic instability, and elevated CK/CPK or rhabdomyolysis. Treat suspected cases as urgent medical assessment/local protocol, not routine monitoring.',
    sourceRefs: [nmsReviewSource, dailyMedSource('dailymed-antipsychotic-nms-warning', 'DailyMed labeling: antipsychotic NMS warning', 'antipsychotic neuroleptic malignant syndrome fever rigidity elevated creatine phosphokinase')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bneuroleptic malignant syndrome|nms\b/) && has(prompt, /\bsigns|symptoms|what are|what is\b/),
  },
  {
    id: 'adverse-phenytoin-gingival-hyperplasia',
    lane: 'adverse_effect_yes_no',
    topic: 'phenytoin gingival hyperplasia',
    text: 'Yes. Phenytoin has gingival hyperplasia/overgrowth risk, especially with longer exposure; dental hygiene and dental follow-up help reduce complications.',
    sourceRefs: [phenytoinSource],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['phenytoin', 'dilantin']) && has(prompt, /\bgingival|gum|hyperplasia|overgrowth\b/),
  },
  {
    id: 'adverse-stimulants-growth-suppression',
    lane: 'adverse_effect_yes_no',
    topic: 'stimulants growth suppression',
    text: 'Yes. Stimulants can reduce appetite/weight gain and carry modest growth-suppression risk in children; monitor height, weight, appetite, sleep, BP, and HR over time.',
    sourceRefs: [dailyMedSource('dailymed-stimulant-growth-suppression', 'DailyMed labeling: stimulant growth suppression', 'methylphenidate amphetamine growth suppression children')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bstimulant|stimulants|methylphenidate|amphetamine|lisdexamfetamine\b/) && has(prompt, /\bgrowth|height|weight\b/) && isAdverseEffectQuestion(prompt),
  },
  {
    id: 'adverse-eps-symptoms',
    lane: 'adverse_effect_yes_no',
    topic: 'extrapyramidal symptoms',
    text: 'EPS risk includes acute dystonia, drug-induced parkinsonism, akathisia, tremor, rigidity, and bradykinesia; tardive dyskinesia is a later movement-disorder risk. Assess timing, antipsychotic exposure, and severity.',
    sourceRefs: [dailyMedSource('dailymed-antipsychotic-eps', 'DailyMed labeling: antipsychotic extrapyramidal symptoms', 'antipsychotic extrapyramidal symptoms dystonia parkinsonism akathisia tardive dyskinesia')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\beps|extrapyramidal\b/) && has(prompt, /\bsymptoms|signs|what are\b/),
  },
  {
    id: 'adverse-risperidone-prolactin',
    lane: 'adverse_effect_yes_no',
    topic: 'risperidone prolactin elevation',
    text: 'Yes. Risperidone can increase prolactin; monitoring context is usually symptom-driven. Risk effects include galactorrhea, amenorrhea, sexual dysfunction, gynecomastia, infertility concerns, or bone-density concerns with prolonged hypogonadism.',
    sourceRefs: [dailyMedSource('dailymed-risperidone-prolactin', 'DailyMed labeling: risperidone hyperprolactinemia', 'risperidone hyperprolactinemia galactorrhea amenorrhea gynecomastia')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['risperidone', 'risperdal']) && has(prompt, /\bprolactin|hyperprolactinemia|galactorrhea|amenorrhea\b/) && isAdverseEffectQuestion(prompt),
  },
  {
    id: 'monitoring-lithium-baseline-labs',
    lane: 'monitoring_reference',
    topic: 'lithium baseline labs',
    text: 'Before lithium, monitor baseline renal function/eGFR/creatinine, electrolytes/sodium, thyroid function/TSH, calcium, pregnancy status when relevant, weight/vitals, ECG context if cardiac risk, and a serum lithium level after initiation per protocol. Verify cadence with a current prescribing reference.',
    sourceRefs: [dailyMedSource('dailymed-lithium-baseline-monitoring', 'DailyMed labeling: lithium baseline monitoring', 'lithium before initiating renal function electrolytes thyroid calcium monitoring')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lithium']) && has(prompt, /\blabs?|baseline|before starting|needed before\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-clozapine-anc-after-first-year',
    lane: 'monitoring_reference',
    topic: 'clozapine ANC monitoring after first year',
    text: 'After the first year, clozapine ANC monitoring is typically monthly/every 4 weeks if ANC has remained acceptable. Verify current labeling, REMS/pharmacy workflow, and local protocol.',
    sourceRefs: [dailyMedSource('dailymed-clozapine-anc-after-first-year', 'DailyMed labeling: clozapine ANC monitoring after first year', 'clozapine ANC monitoring monthly after 12 months')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['clozapine', 'clozaril']) && has(prompt, /\banc\b/) && has(prompt, /\bafter (?:the )?first year|after 12 months|after one year\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-clozapine-cbc-anc-frequency',
    lane: 'monitoring_reference',
    topic: 'clozapine CBC/ANC monitoring frequency',
    text: 'Clozapine ANC monitoring schedule, not just CBC, is typically weekly during the initial treatment period, every 2 weeks for months 6-12, then monthly after 12 months if ANC remains acceptable per current labeling/local protocol. Starting/continuation thresholds differ for the general population vs benign ethnic neutropenia (BEN); BEN uses different ANC thresholds when applicable, so verify baseline ANC and BEN status. Context includes titration/interruption, fever or infection symptoms, pharmacy workflow, myocarditis, constipation/ileus, seizure, and metabolic risk. Frame as clinician reference, not a patient-specific order. Avoid diagnosing from a single isolated lab value without symptoms, exam, and medication context.',
    sourceRefs: [dailyMedSource('dailymed-clozapine-anc-monitoring', 'DailyMed labeling: clozapine ANC monitoring schedule', 'clozapine ANC monitoring weekly every 2 weeks monthly')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['clozapine', 'clozaril']) && has(prompt, /\bcbc|anc|baseline|normal range|monitor|monitoring|checked|frequency\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-tca-ekg-baseline',
    lane: 'monitoring_reference',
    topic: 'TCA baseline EKG monitoring',
    text: 'TCA ECG/EKG monitoring is context-dependent but commonly considered before starting when cardiac disease, older age, overdose risk, QT/conduction risk, or higher-dose treatment is relevant. Monitor cardiac history, meds, electrolytes, and baseline/trend ECG context.',
    sourceRefs: [dailyMedSource('dailymed-tca-cardiac-monitoring', 'DailyMed labeling: TCA cardiac conduction and ECG risk', 'tricyclic antidepressant ECG cardiac conduction arrhythmia')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\btca|tricyclic|amitriptyline|nortriptyline|imipramine\b/) && has(prompt, /\bekg|ecg|cardiac|baseline\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-olanzapine-a1c-frequency',
    lane: 'monitoring_reference',
    topic: 'olanzapine A1c monitoring',
    text: 'For olanzapine, monitor metabolic risk with baseline and follow-up weight/BMI, BP, glucose or A1c, and lipids; A1c/glucose is often checked at baseline, around 3 months, then at least annually. Context includes baseline diabetes risk, weight change, dose/duration, and local protocol.',
    sourceRefs: [metabolicMonitoringSource, dailyMedSource('dailymed-olanzapine-glucose-a1c', 'DailyMed labeling: olanzapine hyperglycemia and metabolic monitoring', 'olanzapine glucose A1c metabolic monitoring')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['olanzapine', 'zyprexa']) && has(prompt, /\ba1c|glucose|metabolic|frequency\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-valproate-lfts',
    lane: 'monitoring_reference',
    topic: 'valproate liver monitoring',
    text: 'Yes. Valproate/divalproex high-yield monitoring includes baseline and follow-up LFTs, CBC/platelets, pregnancy context when relevant, and levels when clinically indicated. Context includes symptoms, liver disease, alcohol/hepatitis risk, dose/formulation, interacting meds, and current prescribing reference guidance.',
    sourceRefs: [dailyMedSource('dailymed-valproate-lft-monitoring', 'DailyMed labeling: valproate hepatotoxicity and monitoring', 'valproate divalproex liver function tests platelets monitoring')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bvalproate|divalproex|depakote|vpa\b/) && has(prompt, /\blft|lfts|liver function|hepatic|hepatotoxicity|labs|required\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-lithium-high-tsh',
    lane: 'monitoring_reference',
    topic: 'high TSH on lithium',
    text: 'High TSH on lithium can suggest hypothyroidism risk, which is a known lithium monitoring issue. Monitor TSH/free T4 trend, symptoms, lithium level, renal context, and coordinate prescriber/primary-care or endocrine review rather than treating one lab in isolation.',
    sourceRefs: [dailyMedSource('dailymed-lithium-thyroid-monitoring', 'DailyMed labeling: lithium thyroid monitoring', 'lithium thyroid function TSH hypothyroidism monitoring')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lithium']) && has(prompt, /\btsh|thyroid|hypothyroid|hyperthyroid\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-psychotropic-pregnancy-test',
    lane: 'monitoring_reference',
    topic: 'pregnancy testing before psychotropics',
    text: 'Pregnancy testing before psychotropics is context-dependent, not universally required for every psych drug. Monitor pregnancy context when teratogenic or high-risk meds are possible, such as valproate, carbamazepine, lithium, isotretinoin-like programs, or when local policy requires it.',
    sourceRefs: [dailyMedSource('dailymed-psychotropics-pregnancy-risk', 'DailyMed labeling: psychotropic pregnancy risk context', 'valproate lithium carbamazepine pregnancy test teratogenic risk')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bpregnancy test|pregnancy status\b/) && has(prompt, /\bpsychotropic|psych drug|psychiatric medication|before starting\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-carbamazepine-labs',
    lane: 'monitoring_reference',
    topic: 'carbamazepine monitoring labs',
    text: 'Carbamazepine monitoring commonly includes CBC, LFTs, sodium, serum level when indicated, pregnancy context when relevant, and rash/SJS risk review. Context includes baseline labs, ancestry/HLA risk, dose changes, interactions, and symptoms.',
    sourceRefs: [dailyMedSource('dailymed-carbamazepine-monitoring', 'DailyMed labeling: carbamazepine labs and safety monitoring', 'carbamazepine CBC LFT sodium monitoring HLA rash')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['carbamazepine', 'tegretol']) && has(prompt, /\blabs?|monitor|monitoring|sodium|cbc|lft|lfts\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-aripiprazole-lipids',
    lane: 'monitoring_reference',
    topic: 'aripiprazole lipid monitoring',
    text: 'Aripiprazole still needs metabolic monitoring: baseline and follow-up weight/BMI, glucose or A1c, lipids, and BP, even though metabolic risk is often lower than olanzapine. Context includes baseline risk, weight change, dose/duration, and local protocol.',
    sourceRefs: [metabolicMonitoringSource, dailyMedSource('dailymed-aripiprazole-metabolic-monitoring', 'DailyMed labeling: aripiprazole metabolic changes', 'aripiprazole metabolic changes glucose lipids weight')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['aripiprazole', 'abilify']) && has(prompt, /\blipid|lipids|metabolic|a1c|glucose|monitor\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-ziprasidone-ekg',
    lane: 'monitoring_reference',
    topic: 'ziprasidone EKG monitoring',
    text: 'Ziprasidone has QTc risk, so ECG/EKG monitoring is context-dependent and more important with cardiac disease, syncope/palpitations, electrolyte abnormalities, or other QT-prolonging meds. Monitor potassium, magnesium, calcium, baseline/trend QTc, and interaction context.',
    sourceRefs: [dailyMedSource('dailymed-ziprasidone-qtc-monitoring', 'DailyMed labeling: ziprasidone QTc and ECG risk', 'ziprasidone QT prolongation ECG monitoring electrolytes')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['ziprasidone', 'geodon']) && has(prompt, /\bekg|ecg|qtc|qt\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-duloxetine-kidney-function',
    lane: 'monitoring_reference',
    topic: 'duloxetine renal function context',
    text: 'Kidney function is relevant before duloxetine because severe renal impairment changes safety/labeling risk. Monitor renal context/eGFR or CrCl, hepatic disease/alcohol risk, BP, interactions, and indication before applying dosing guidance.',
    sourceRefs: [dailyMedSource('dailymed-duloxetine-renal-hepatic', 'DailyMed labeling: duloxetine renal and hepatic cautions', 'duloxetine severe renal impairment hepatic alcohol blood pressure')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['duloxetine', 'cymbalta']) && has(prompt, /\bkidney|renal|egfr|crcl|creatinine\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-stimulant-baseline-weight',
    lane: 'monitoring_reference',
    topic: 'stimulant baseline weight monitoring',
    text: 'Yes. Baseline weight is useful before stimulants because appetite, weight, and growth effects are monitoring risks, especially in children. Context includes baseline height/weight, BP/HR, sleep, appetite, cardiac history, and substance/diversion risk.',
    sourceRefs: [dailyMedSource('dailymed-stimulant-weight-growth-monitoring', 'DailyMed labeling: stimulant weight/growth monitoring', 'stimulant weight growth monitoring children appetite blood pressure heart rate')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bstimulant|stimulants|methylphenidate|amphetamine|lisdexamfetamine\b/) && has(prompt, /\bbaseline weight|weight necessary|height|growth\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-divalproex-levels',
    lane: 'monitoring_reference',
    topic: 'divalproex level monitoring',
    text: 'Divalproex/valproate level monitoring is context-dependent: check trough timing, indication/target, dose/formulation, adherence, albumin/free level when relevant, LFTs, CBC/platelets, pregnancy context, and symptoms. Monitor more often after starts/changes or toxicity concerns per local protocol.',
    sourceRefs: [dailyMedSource('dailymed-divalproex-level-monitoring', 'DailyMed labeling: divalproex serum level and monitoring', 'divalproex valproate serum level monitoring platelets LFT')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bdivalproex|depakote|valproate|vpa\b/) && has(prompt, /\blevel|levels|monitoring schedule|frequency\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-lithium-hypercalcemia',
    lane: 'monitoring_reference',
    topic: 'lithium hypercalcemia',
    text: 'Yes. Lithium can cause hyperparathyroidism and hypercalcemia risk, so calcium should be monitored periodically. Context includes baseline calcium/PTH if abnormal, renal function, lithium level, symptoms, duration, and interacting meds.',
    sourceRefs: [dailyMedSource('dailymed-lithium-hypercalcemia', 'DailyMed labeling: lithium hyperparathyroidism and hypercalcemia', 'lithium hyperparathyroidism hypercalcemia calcium monitoring')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lithium']) && has(prompt, /\bhypercalcemia|calcium|hyperparathyroid\b/),
  },
  {
    id: 'monitoring-risperidone-prolactin',
    lane: 'monitoring_reference',
    topic: 'risperidone prolactin monitoring',
    text: 'Risperidone can raise prolactin, but routine prolactin labs are usually context-driven rather than automatic for everyone. Monitor prolactin-related symptoms such as galactorrhea, amenorrhea, sexual dysfunction, gynecomastia, infertility, or bone-health concerns.',
    sourceRefs: [dailyMedSource('dailymed-risperidone-prolactin-monitoring', 'DailyMed labeling: risperidone hyperprolactinemia monitoring context', 'risperidone prolactin monitoring galactorrhea amenorrhea')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['risperidone', 'risperdal']) && has(prompt, /\bprolactin|hyperprolactinemia\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-chest-xray-psych-drug',
    lane: 'monitoring_reference',
    topic: 'chest X-ray before psychotropics',
    text: 'No routine chest X-ray is needed before every psych drug. Monitoring context depends on the medication and clinical picture; chest imaging is usually symptom-, medical-, TB/infection-, aspiration-, or cardiopulmonary-risk driven, not universal psychiatric clearance.',
    sourceRefs: [dailyMedSource('dailymed-psychotropic-baseline-monitoring', 'DailyMed labeling/reference search: psychotropic baseline monitoring', 'psychiatric medication baseline monitoring chest x-ray')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bchest x ray|chest x-ray|chest xray|cxr|x ray|x-ray|xray\b/) && has(prompt, /\bpsych drug|psychotropic|psychiatric medication|any psych\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-maoi-protocol',
    lane: 'monitoring_reference',
    topic: 'MAOI monitoring protocol',
    text: 'MAOI monitoring context includes BP/orthostasis, hypertensive-crisis symptoms, serotonin-toxicity risk, diet/tyramine education, drug-interaction review, and washout periods. Monitor medication list and OTC/supplement exposure closely; verify product label and local protocol.',
    sourceRefs: [dailyMedSource('dailymed-maoi-monitoring', 'DailyMed labeling: MAOI monitoring interactions tyramine hypertensive crisis', 'MAOI tyramine hypertensive crisis serotonin syndrome monitoring')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bmaoi|phenelzine|tranylcypromine|selegiline|isocarboxazid\b/) && has(prompt, /\bmonitor|monitoring|protocol\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'monitoring-stimulant-uds-mandatory',
    lane: 'monitoring_reference',
    topic: 'stimulant urine drug screen requirements',
    text: 'Urine drug screens are not universally mandatory for stimulant prescriptions; monitoring context depends on controlled-substance policy, substance-use/diversion risk, local protocol, payer/regulatory requirements, and clinical judgment. Avoid treating UDS as automatic psychiatric clearance.',
    sourceRefs: [dailyMedSource('dailymed-stimulant-controlled-substance-monitoring', 'DailyMed labeling/reference search: stimulant misuse and monitoring', 'stimulant misuse diversion urine drug screen monitoring')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bstimulant|stimulants|methylphenidate|amphetamine|lisdexamfetamine\b/) && has(prompt, /\burine drug screens?|uds|drug screens?|mandatory\b/) && isMonitoringQuestion(prompt),
  },
  {
    id: 'interaction-lithium-nsaids',
    lane: 'interaction_safety',
    topic: 'lithium NSAID interaction',
    text: 'Interaction safety framework: NSAIDs can raise lithium exposure and toxicity risk, likely through reduced renal clearance. This should be verified against a current drug-interaction reference. Verify lithium level trend, renal function, sodium and fluid status, and toxicity symptoms.',
    sourceRefs: [dailyMedSource('dailymed-lithium-nsaid-interaction', 'DailyMed labeling: lithium NSAID interaction', 'lithium NSAID interaction toxicity renal clearance')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lithium']) && has(prompt, /\bnsaid|nsaids|ibuprofen|naproxen|ketorolac\b/) && isInteractionQuestion(prompt),
  },
  {
    id: 'interaction-bupropion-citalopram',
    lane: 'interaction_safety',
    topic: 'bupropion citalopram interaction',
    text: 'Yes, bupropion (Wellbutrin) and citalopram (Celexa) are commonly used together, but the combination should be reviewed for interaction risk. Key concerns: bupropion lowers seizure threshold and inhibits CYP2D6; citalopram has dose-related QTc risk. Check seizure history, eating disorder/alcohol withdrawal risk, citalopram dose, QTc/cardiac risk, electrolytes, BP/anxiety/activation, and other medications. Verify with a current interaction reference.',
    sourceRefs: [
      dailyMedSource('dailymed-bupropion-seizure-cyp2d6', 'DailyMed labeling: bupropion seizure and CYP2D6 warnings', 'bupropion Wellbutrin seizure CYP2D6 inhibitor'),
      citalopramFdaSource,
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && isInteractionQuestion(prompt) && hasMedicationPair(prompt, ['bupropion', 'wellbutrin', 'zyban'], ['citalopram', 'celexa']),
  },
  {
    id: 'interaction-bupropion-sertraline',
    lane: 'interaction_safety',
    topic: 'bupropion sertraline interaction',
    text: 'Bupropion (Wellbutrin) and sertraline (Zoloft) are commonly used together, but the combination should be reviewed for interaction risk. Key concerns are bupropion-related seizure-threshold lowering/CYP2D6 inhibition plus SSRI activation, bleeding, and serotonergic burden. Check seizure/eating-disorder/alcohol-withdrawal risk, BP/anxiety/activation, other serotonergic meds, and verify with a current interaction reference.',
    sourceRefs: [
      dailyMedSource('dailymed-bupropion-sertraline-interaction-context', 'DailyMed labeling: bupropion and sertraline interaction context', 'bupropion Wellbutrin sertraline Zoloft interaction seizure CYP2D6 serotonin'),
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasMedicationPair(prompt, ['bupropion', 'wellbutrin', 'zyban'], ['sertraline', 'zoloft']),
  },
  {
    id: 'interaction-bupropion-fluoxetine',
    lane: 'interaction_safety',
    topic: 'bupropion fluoxetine interaction',
    text: 'Bupropion (Wellbutrin) with fluoxetine (Prozac) should be reviewed for interaction risk. Both can add CYP2D6 interaction burden, and bupropion lowers seizure threshold while fluoxetine adds SSRI serotonergic/activation considerations. Check seizure/eating-disorder/alcohol-withdrawal risk, activation/anxiety/BP, co-medications, and verify with a current interaction reference.',
    sourceRefs: [
      dailyMedSource('dailymed-bupropion-fluoxetine-interaction-context', 'DailyMed labeling: bupropion and fluoxetine interaction context', 'bupropion Wellbutrin fluoxetine Prozac CYP2D6 seizure interaction'),
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && isInteractionQuestion(prompt) && hasMedicationPair(prompt, ['bupropion', 'wellbutrin', 'zyban'], ['fluoxetine', 'prozac']),
  },
  {
    id: 'interaction-bupropion-paroxetine',
    lane: 'interaction_safety',
    topic: 'bupropion paroxetine interaction',
    text: 'Bupropion (Wellbutrin) with paroxetine (Paxil) should be reviewed for interaction risk. Both add CYP2D6 inhibition burden, bupropion lowers seizure threshold, and paroxetine adds SSRI serotonergic, discontinuation, bleeding, activation/mania, and anticholinergic-burden considerations. Verify seizure/eating-disorder/alcohol-withdrawal risk, BP/anxiety/activation, CYP2D6 substrate co-medications, serotonergic load, and current interaction references.',
    sourceRefs: [
      dailyMedSource('dailymed-bupropion-paroxetine-interaction-context', 'DailyMed labeling: bupropion and paroxetine interaction context', 'bupropion Wellbutrin paroxetine Paxil CYP2D6 seizure interaction'),
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && isInteractionQuestion(prompt) && hasMedicationPair(prompt, ['bupropion', 'wellbutrin', 'zyban'], ['paroxetine', 'paxil']),
  },
  {
    id: 'interaction-bupropion-ssri',
    lane: 'interaction_safety',
    topic: 'bupropion SSRI interaction',
    text: 'Bupropion with an SSRI is a common combination, but it should be reviewed for interaction risk. Bupropion lowers seizure threshold and inhibits CYP2D6, while the SSRI adds medication-specific serotonin, QTc, or CYP considerations. Check seizure/eating-disorder/alcohol-withdrawal risk, activation/anxiety/BP, SSRI-specific risks, and other medications; verify with a current interaction reference.',
    sourceRefs: [
      dailyMedSource('dailymed-bupropion-ssri-interaction-context', 'DailyMed labeling: bupropion CYP2D6/seizure and SSRI interaction context', 'bupropion seizure CYP2D6 SSRI interaction'),
      dailyMedSource('dailymed-ssri-serotonin-interaction-context', 'DailyMed labeling: SSRI serotonin and interaction context', 'SSRI serotonin syndrome interaction CYP QT'),
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && isInteractionQuestion(prompt) && hasAny(prompt, ['bupropion', 'wellbutrin', 'zyban']) && hasAny(prompt, SSRI_ALIASES),
  },
  {
    id: 'interaction-citalopram-trazodone',
    lane: 'interaction_safety',
    topic: 'citalopram trazodone interaction',
    text: 'Use caution: citalopram (Celexa) with trazodone can add serotonergic, QTc, sedation, and falls risk. Check other serotonergic/QT-prolonging medications, citalopram dose, ECG/QTc and electrolytes when relevant, sedation, and bleeding risk; verify with a current interaction reference.',
    sourceRefs: [
      citalopramFdaSource,
      dailyMedSource('dailymed-trazodone-serotonin-qtc', 'DailyMed labeling: trazodone serotonin/QT/sedation warnings', 'trazodone serotonin syndrome QT prolongation sedation'),
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && isInteractionQuestion(prompt) && hasMedicationPair(prompt, ['citalopram', 'celexa'], ['trazodone']),
  },
  {
    id: 'interaction-ssri-nsaid-bleeding',
    lane: 'interaction_safety',
    topic: 'SSRI NSAID bleeding interaction',
    text: 'SSRIs and SNRIs can add bleeding risk with NSAIDs, aspirin, clopidogrel, warfarin, or other antithrombotics; this includes escitalopram (Lexapro) with NSAIDs. Check GI bleed risk, bruising or bleeding symptoms, CBC/hemoglobin when clinically relevant, NSAID/antiplatelet/anticoagulant exposure, and verify with a current interaction reference. This should be verified against a current drug-interaction reference.',
    sourceRefs: [dailyMedSource('dailymed-ssri-nsaid-bleeding', 'DailyMed labeling: SSRI NSAID bleeding risk', 'SSRI NSAID bleeding platelet gastrointestinal')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && isInteractionQuestion(prompt) && hasAny(prompt, SSRI_ALIASES) && has(prompt, /\bnsaid|nsaids|ibuprofen|naproxen|ketorolac|aspirin\b/),
  },
  {
    id: 'interaction-valproate-lamotrigine',
    lane: 'interaction_safety',
    topic: 'valproate lamotrigine interaction',
    text: 'Yes. Valproate/divalproex (Depakote) can increase lamotrigine (Lamictal) exposure and rash/SJS risk by inhibiting lamotrigine metabolism. This should be verified against a current drug-interaction reference. Verify current labeling, rash history, dose changes, and clinical context before applying.',
    sourceRefs: [dailyMedSource('dailymed-valproate-lamotrigine-interaction', 'DailyMed labeling: valproate lamotrigine interaction', 'valproate lamotrigine interaction rash Stevens Johnson titration')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && isInteractionQuestion(prompt) && hasMedicationPair(prompt, ['valproate', 'valproic acid', 'divalproex', 'depakote'], ['lamotrigine', 'lamictal']),
  },
  {
    id: 'interaction-haloperidol-high-qtc',
    lane: 'interaction_safety',
    topic: 'haloperidol high QTc risk',
    text: 'QTc 520 with haloperidol (Haldol) is high-risk QT context, not a routine interaction question. Check ECG accuracy/trend, potassium, magnesium, calcium, syncope/palpitations, dose/route, and other QT-prolonging meds; verify urgently with local protocol/pharmacy/cardiology as appropriate.',
    sourceRefs: [dailyMedSource('dailymed-haloperidol-qtc', 'DailyMed labeling: haloperidol QT/TdP risk', 'haloperidol Haldol QTc torsades ECG')],
    matches: (prompt) => isInteractionQuestion(prompt) && hasAny(prompt, ['haloperidol', 'haldol']) && has(prompt, /\bqtc|qt\b/) && has(prompt, /\b(5\d\d|high|prolonged)\b/),
  },
  {
    id: 'interaction-suboxone-lybalvi',
    lane: 'interaction_safety',
    topic: 'buprenorphine/naloxone Lybalvi interaction',
    text: 'High interaction concern: Lybalvi contains samidorphan, an opioid antagonist, so combining it with buprenorphine/naloxone (Suboxone) can reduce opioid effect or precipitate withdrawal. Verify opioid exposure, OUD treatment plan, withdrawal risk, and product labeling with pharmacy/prescriber review.',
    sourceRefs: [
      dailyMedSource('dailymed-lybalvi-samidorphan-opioid-antagonist', 'DailyMed labeling: Lybalvi samidorphan opioid antagonist warnings', 'Lybalvi samidorphan buprenorphine opioid antagonist withdrawal'),
      dailyMedSource('dailymed-suboxone-buprenorphine-naloxone', 'DailyMed labeling: Suboxone buprenorphine/naloxone', 'Suboxone buprenorphine naloxone opioid use disorder'),
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && isInteractionQuestion(prompt) && hasMedicationPair(prompt, ['suboxone', 'buprenorphine', 'buprenorphine naloxone'], ['lybalvi', 'samidorphan']),
  },
  {
    id: 'interaction-lorazepam-alcohol',
    lane: 'interaction_safety',
    topic: 'lorazepam alcohol interaction',
    text: 'Yes, lorazepam (Ativan) with alcohol is a high-risk CNS-depressant combination because sedation, falls, impaired coordination, blackouts, and respiratory depression risk can increase. Verify alcohol amount/timing, other sedatives or opioids, respiratory risk, and urgent evaluation needs if overdose or severe sedation is possible.',
    sourceRefs: [dailyMedSource('dailymed-lorazepam-alcohol-cns-depression', 'DailyMed labeling: lorazepam alcohol/CNS depressant warning', 'lorazepam Ativan alcohol CNS depression respiratory depression')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && isInteractionQuestion(prompt) && hasMedicationPair(prompt, ['lorazepam', 'ativan'], ['alcohol', 'ethanol', 'drink']) && !hasAny(prompt, ['zolpidem', 'ambien', 'eszopiclone', 'lunesta', 'suvorexant', 'belsomra', 'lemborexant', 'dayvigo', 'sleep medication', 'hypnotic']),
  },
  {
    id: 'interaction-maoi-triptan',
    lane: 'interaction_safety',
    topic: 'MAOI triptan interaction',
    text: 'MAOI plus triptan is a high-risk/contraindication-style combination because of serotonin toxicity and blood-pressure toxicity concerns. Verify product-specific labeling and interaction references.',
    sourceRefs: [
      dailyMedSource('dailymed-maoi-triptan-interaction', 'DailyMed labeling: MAOI and triptan interaction warnings', 'MAOI triptan serotonin syndrome contraindicated'),
      approvalSource,
    ],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bmaoi|phenelzine|tranylcypromine|selegiline\b/) && has(prompt, /\btriptan|sumatriptan|rizatriptan|zolmitriptan\b/) && isInteractionQuestion(prompt),
  },
  {
    id: 'interaction-fluoxetine-cyp2d6',
    lane: 'interaction_safety',
    topic: 'fluoxetine CYP2D6 inhibition',
    text: 'Yes. Fluoxetine is a strong CYP2D6 inhibitor, so CYP2D6 substrate exposure and interaction risk can increase. Verify co-medications against a current interaction reference.',
    sourceRefs: [dailyMedSource('dailymed-fluoxetine-cyp2d6', 'DailyMed labeling: fluoxetine CYP2D6 inhibition', 'fluoxetine potent inhibitor CYP2D6')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['fluoxetine', 'prozac']) && has(prompt, /\bcyp2d6|2d6\b/) && isInteractionQuestion(prompt),
  },
  {
    id: 'interaction-valproate-pregnancy-contraindication',
    lane: 'interaction_safety',
    topic: 'valproate pregnancy contraindication',
    text: 'Valproate carries high fetal risk in pregnancy, including neural tube and neurodevelopmental risk, and is contraindicated for migraine prophylaxis in pregnancy. Verify indication-specific labeling and specialist pregnancy risk-benefit guidance.',
    sourceRefs: [dailyMedSource('dailymed-valproate-pregnancy-contraindication', 'DailyMed labeling: valproate pregnancy contraindications and fetal risk', 'valproate pregnancy contraindicated migraine neural tube neurodevelopment')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['valproate', 'depakote', 'divalproex', 'valproic acid']) && has(prompt, /\bpregnancy|pregnant|first trimester|neural tube|teratogenic|birth defect\b/),
  },
  {
    id: 'interaction-carbamazepine-oral-contraceptives',
    lane: 'interaction_safety',
    topic: 'carbamazepine oral contraceptive interaction',
    text: 'Yes. Carbamazepine can lower oral contraceptive effectiveness through enzyme induction; verify contraception guidance, pregnancy risk, and interaction references.',
    sourceRefs: [dailyMedSource('dailymed-carbamazepine-oral-contraceptives', 'DailyMed labeling: carbamazepine oral contraceptive interaction', 'carbamazepine oral contraceptives effectiveness enzyme induction')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['carbamazepine', 'tegretol']) && has(prompt, /\boral contraceptive|birth control|contraception|contraceptives\b/) && isInteractionQuestion(prompt),
  },
  {
    id: 'interaction-linezolid-ssri',
    lane: 'interaction_safety',
    topic: 'linezolid SSRI serotonin syndrome risk',
    text: 'Yes. The linezolid interaction matters because linezolid has MAOI-like activity and can increase serotonin syndrome risk with SSRIs. This should be verified against a current drug-interaction reference. Please verify clinically with pharmacy/current references before combining.',
    sourceRefs: [dailyMedSource('dailymed-linezolid-ssri-serotonin', 'DailyMed labeling: linezolid serotonergic interaction', 'linezolid SSRI serotonin syndrome')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['linezolid']) && has(prompt, /\bssri|ssris|sertraline|fluoxetine|paroxetine|citalopram|escitalopram\b/) && isInteractionQuestion(prompt),
  },
  {
    id: 'interaction-smoking-cyp1a2',
    lane: 'interaction_safety',
    topic: 'smoking CYP1A2 induction',
    text: 'Yes. Tobacco smoking induces CYP1A2, which can lower clozapine or olanzapine exposure; stopping smoking can raise levels and toxicity risk. Verify smoking changes, levels when relevant, sedation, orthostasis, seizures, and current interaction references.',
    sourceRefs: [dailyMedSource('dailymed-clozapine-tobacco-cyp1a2', 'DailyMed labeling: tobacco smoke CYP1A2 and clozapine', 'clozapine tobacco smoke CYP1A2 inducer levels')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bsmoking|tobacco\b/) && has(prompt, /\bcyp1a2|1a2|inducer|induce|induces\b/),
  },
  {
    id: 'interaction-st-johns-wort-ssri',
    lane: 'interaction_safety',
    topic: 'St. John’s Wort SSRI interaction',
    text: 'Yes. St. John\'s Wort can interact with SSRIs, raising serotonin syndrome risk and adding CYP/P-gp induction concerns. Verify supplement use, serotonergic symptoms, and current interaction references; do not treat it as a benign add-on.',
    sourceRefs: [dailyMedSource('dailymed-st-johns-wort-ssri-interaction', 'DailyMed/reference search: St. John’s Wort SSRI interaction', 'St John wort SSRI serotonin syndrome CYP P-gp induction')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bst\.?\s*john|johns wort|john's wort\b/) && has(prompt, /\bssri|ssris|sertraline|fluoxetine|paroxetine|citalopram|escitalopram\b/),
  },
  {
    id: 'interaction-grapefruit-buspirone',
    lane: 'interaction_safety',
    topic: 'grapefruit buspirone interaction',
    text: 'Yes. Grapefruit juice can inhibit CYP3A4 and increase buspirone exposure, increasing dizziness/sedation risk. Verify product labeling, amount of grapefruit exposure, sedation, falls risk, and current interaction references.',
    sourceRefs: [dailyMedSource('dailymed-buspirone-grapefruit', 'DailyMed labeling: buspirone grapefruit juice CYP3A4', 'buspirone grapefruit juice CYP3A4 increased concentration')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bgrapefruit\b/) && hasAny(prompt, ['buspirone', 'buspar']),
  },
  {
    id: 'interaction-clozapine-ciprofloxacin',
    lane: 'interaction_safety',
    topic: 'clozapine ciprofloxacin interaction',
    text: 'Yes. Ciprofloxacin can inhibit CYP1A2 and increase clozapine levels, raising sedation, seizure, hypotension, and toxicity risk. Verify clozapine level/clinical status, infection context, and pharmacy/current interaction guidance.',
    sourceRefs: [dailyMedSource('dailymed-clozapine-ciprofloxacin-cyp1a2', 'DailyMed labeling: clozapine and ciprofloxacin/CYP1A2 inhibitors', 'clozapine ciprofloxacin CYP1A2 inhibitor increase levels')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['clozapine', 'clozaril']) && hasAny(prompt, ['ciprofloxacin', 'cipro']),
  },
  {
    id: 'interaction-lithium-renal-failure',
    lane: 'interaction_safety',
    topic: 'lithium renal failure caution',
    text: 'Lithium in renal failure is high concern because lithium is renally cleared and renal impairment increases toxicity risk. Verify eGFR/CrCl, baseline/trend, hydration/sodium, interacting meds, alternatives, and current labeling/specialist guidance.',
    sourceRefs: [dailyMedSource('dailymed-lithium-renal-impairment', 'DailyMed labeling: lithium renal impairment and toxicity', 'lithium renal impairment renal failure toxicity')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lithium']) && has(prompt, /\brenal failure|kidney failure|renal impairment|severe renal|ckd\b/),
  },
  {
    id: 'interaction-bupropion-eating-disorder',
    lane: 'interaction_safety',
    topic: 'bupropion eating disorder contraindication',
    text: 'Yes. Bupropion is contraindicated with current or prior bulimia or anorexia nervosa because seizure risk is higher. Verify the eating-disorder history, seizure risk factors, alcohol/benzo withdrawal risk, and product labeling.',
    sourceRefs: [dailyMedSource('dailymed-bupropion-eating-disorder-contraindication', 'DailyMed labeling: bupropion eating disorder contraindication', 'bupropion contraindicated bulimia anorexia seizure risk')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['bupropion', 'wellbutrin', 'zyban']) && has(prompt, /\beating disorder|eating disorders|bulimia|anorexia\b/),
  },
  {
    id: 'interaction-erythromycin-alprazolam',
    lane: 'interaction_safety',
    topic: 'erythromycin alprazolam interaction',
    text: 'Yes. Erythromycin can inhibit CYP3A4 and increase alprazolam exposure, raising sedation, psychomotor impairment, falls, and respiratory-depression risk with other depressants. Verify current interaction references and patient-specific sedative burden.',
    sourceRefs: [dailyMedSource('dailymed-alprazolam-erythromycin-cyp3a4', 'DailyMed labeling: alprazolam CYP3A4 inhibitors/macrolides', 'alprazolam erythromycin CYP3A4 inhibitor increased levels')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['erythromycin']) && hasAny(prompt, ['alprazolam', 'xanax']),
  },
  {
    id: 'interaction-pimozide-qtc',
    lane: 'interaction_safety',
    topic: 'pimozide QT contraindication',
    text: 'Yes. Pimozide is contraindicated with QT-prolonging drugs or QT prolongation contexts because additive QT/TdP arrhythmia risk can be serious. Verify ECG/QTc, potassium/magnesium, cardiac history, and current labeling.',
    sourceRefs: [dailyMedSource('dailymed-pimozide-qtc-contraindication', 'DailyMed labeling: pimozide QT contraindications', 'pimozide contraindicated QT prolonging drugs hypokalemia hypomagnesemia')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['pimozide']) && has(prompt, /\bqtc|qt prolong|qt-prolong|arrhythmia|torsades\b/),
  },
  {
    id: 'interaction-lamotrigine-oral-contraceptives',
    lane: 'interaction_safety',
    topic: 'lamotrigine oral contraceptive interaction',
    text: 'Yes. Estrogen-containing oral contraceptives can lower lamotrigine levels, creating relapse/seizure risk, and lamotrigine may affect some progestin exposure. Verify the contraceptive product, lamotrigine response, and current labeling.',
    sourceRefs: [dailyMedSource('dailymed-lamotrigine-oral-contraceptives', 'DailyMed labeling: lamotrigine estrogen-containing oral contraceptives', 'lamotrigine estrogen oral contraceptives lower levels')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lamotrigine', 'lamictal']) && has(prompt, /\boral contraceptive|birth control|contraception|contraceptives\b/),
  },
  {
    id: 'interaction-thioridazine-fluoxetine',
    lane: 'interaction_safety',
    topic: 'thioridazine fluoxetine contraindication',
    text: 'Contraindicated. Fluoxetine inhibits CYP2D6 and can raise thioridazine exposure, increasing QT prolongation and serious arrhythmia risk. Verify current labeling, QT/QTc context, and fluoxetine washout requirements.',
    sourceRefs: [dailyMedSource('dailymed-fluoxetine-thioridazine-contraindication', 'DailyMed labeling: fluoxetine and thioridazine contraindication', 'fluoxetine thioridazine contraindicated CYP2D6 QT prolongation')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['thioridazine']) && hasAny(prompt, ['fluoxetine', 'prozac']),
  },
  {
    id: 'interaction-ssri-warfarin-bleeding',
    lane: 'interaction_safety',
    topic: 'SSRI warfarin bleeding risk',
    text: 'Yes. SSRIs can increase bleeding risk with warfarin through platelet effects and anticoagulation context. Verify INR trend, bleeding/bruising, GI bleed risk, and other NSAID/antiplatelet use.',
    sourceRefs: [dailyMedSource('dailymed-ssri-warfarin-bleeding', 'DailyMed labeling: SSRI warfarin bleeding risk', 'SSRI warfarin bleeding risk platelet')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bssri|ssris|sertraline|fluoxetine|paroxetine|citalopram|escitalopram\b/) && hasAny(prompt, ['warfarin', 'coumadin']) && isInteractionQuestion(prompt),
  },
  {
    id: 'interaction-lithium-ace-inhibitors',
    lane: 'interaction_safety',
    topic: 'lithium ACE inhibitor interaction',
    text: 'Yes. ACE inhibitors can raise lithium levels and toxicity risk through renal handling changes, especially with dehydration or thiazide diuretics. Verify renal function/eGFR, lithium level trend, sodium/hydration, toxicity symptoms, and current interaction references.',
    sourceRefs: [dailyMedSource('dailymed-lithium-ace-inhibitor', 'DailyMed labeling: lithium ACE inhibitor interaction', 'lithium ACE inhibitor toxicity renal')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lithium']) && has(prompt, /\bace inhibitor|ace inhibitors|lisinopril|enalapril|benazepril|ramipril\b/) && isInteractionQuestion(prompt),
  },
  {
    id: 'interaction-rifampin-methadone',
    lane: 'interaction_safety',
    topic: 'rifampin methadone interaction',
    text: 'Yes. Rifampin can decrease methadone levels via enzyme induction, creating withdrawal or reduced-effect risk; verify timing, symptoms, dose history, and interaction references.',
    sourceRefs: [dailyMedSource('dailymed-rifampin-methadone', 'DailyMed labeling: rifampin methadone interaction', 'rifampin methadone decrease levels withdrawal')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['rifampin', 'rifampicin']) && hasAny(prompt, ['methadone']) && isInteractionQuestion(prompt),
  },
  {
    id: 'interaction-tramadol-ssri',
    lane: 'interaction_safety',
    topic: 'tramadol SSRI serotonin risk',
    text: 'Yes. Tramadol plus SSRIs raises serotonin syndrome risk and can also lower seizure threshold. Verify serotonergic load, seizure risk, dose/timing, and current interaction references.',
    sourceRefs: [dailyMedSource('dailymed-tramadol-ssri', 'DailyMed labeling: tramadol SSRI serotonin syndrome/seizure risk', 'tramadol SSRI serotonin syndrome seizure')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['tramadol']) && has(prompt, /\bssri|ssris|sertraline|fluoxetine|paroxetine|citalopram|escitalopram\b/) && isInteractionQuestion(prompt),
  },
  {
    id: 'interaction-verapamil-lithium',
    lane: 'interaction_safety',
    topic: 'verapamil lithium toxicity',
    text: 'Yes. Verapamil with lithium has reported neurotoxicity/toxicity risk even when levels are not the whole story. Verify lithium level, renal function, neurologic symptoms, ECG/cardiac context, and current interaction references.',
    sourceRefs: [dailyMedSource('dailymed-verapamil-lithium', 'DailyMed/reference search: verapamil lithium toxicity', 'verapamil lithium toxicity neurotoxicity')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['verapamil']) && hasAny(prompt, ['lithium']) && isInteractionQuestion(prompt),
  },
  {
    id: 'interaction-disulfiram-alcohol',
    lane: 'interaction_safety',
    topic: 'disulfiram alcohol reaction',
    text: 'Yes. Disulfiram plus alcohol can cause a severe aversive/toxicity reaction with flushing, vomiting, hypotension, chest symptoms, or collapse risk. Verify alcohol exposure sources, timing, severity, and toxicology/local protocol guidance.',
    sourceRefs: [dailyMedSource('dailymed-disulfiram-alcohol-reaction', 'DailyMed labeling: disulfiram alcohol reaction', 'disulfiram alcohol reaction hypotension vomiting chest pain')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['disulfiram', 'antabuse']) && has(prompt, /\balcohol|drink|ethanol\b/),
  },
  {
    id: 'interaction-clozapine-seizure-history',
    lane: 'interaction_safety',
    topic: 'clozapine seizure history caution',
    text: 'Clozapine is not always an absolute contraindication with seizure history, but seizure risk is dose/exposure-related and requires strong caution. Verify seizure history, clozapine level/dose, interacting meds, neurologic risk, and current labeling.',
    sourceRefs: [dailyMedSource('dailymed-clozapine-seizure-risk', 'DailyMed labeling: clozapine seizure risk', 'clozapine seizure history risk dose related')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['clozapine', 'clozaril']) && has(prompt, /\bseizure|seizures\b/),
  },
  {
    id: 'interaction-omeprazole-diazepam',
    lane: 'interaction_safety',
    topic: 'omeprazole diazepam interaction',
    text: 'Yes. Omeprazole can reduce diazepam clearance in some patients via CYP2C19 effects, increasing sedation, falls, and psychomotor-impairment risk. Verify age, hepatic function, sedative burden, and current interaction references.',
    sourceRefs: [dailyMedSource('dailymed-diazepam-omeprazole-cyp2c19', 'DailyMed labeling: diazepam CYP2C19/omeprazole interaction', 'diazepam omeprazole CYP2C19 clearance sedation')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['omeprazole', 'prilosec']) && hasAny(prompt, ['diazepam', 'valium']),
  },
  {
    id: 'interaction-lithium-diuretics',
    lane: 'interaction_safety',
    topic: 'lithium diuretic interaction',
    text: 'Lithium toxicity risk can increase with diuretics, especially thiazides, through renal/sodium handling changes. Verify lithium level, renal function/eGFR/creatinine, electrolytes/sodium, hydration, diuretic type, and current interaction references.',
    sourceRefs: [dailyMedSource('dailymed-lithium-diuretics', 'DailyMed labeling: lithium diuretic interaction', 'lithium diuretics thiazide toxicity renal sodium')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lithium']) && has(prompt, /\bdiuretic|diuretics|thiazide|hctz|hydrochlorothiazide|furosemide|loop diuretic\b/),
  },
  {
    id: 'interaction-aspirin-valproate',
    lane: 'interaction_safety',
    topic: 'high-dose aspirin valproate interaction',
    text: 'Yes. High-dose aspirin can increase free valproate exposure and bleeding/toxicity risk through protein-binding and metabolism effects. Verify aspirin dose, valproate level/free level, platelets, bleeding symptoms, and current interaction references.',
    sourceRefs: [dailyMedSource('dailymed-valproate-aspirin-interaction', 'DailyMed labeling: valproate aspirin interaction', 'valproate aspirin protein binding free fraction platelets bleeding')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\baspirin\b/) && hasAny(prompt, ['valproate', 'depakote', 'divalproex', 'valproic acid']),
  },
  {
    id: 'interaction-carbamazepine-autoinduction',
    lane: 'interaction_safety',
    topic: 'carbamazepine autoinduction',
    text: 'Yes. Carbamazepine induces its own metabolism, so levels can fall after initiation as autoinduction develops and relapse/toxicity risk can shift. Verify timing since start/change, level timing, symptoms, sodium, CBC/LFTs, and current interaction references.',
    sourceRefs: [dailyMedSource('dailymed-carbamazepine-autoinduction', 'DailyMed labeling: carbamazepine autoinduction', 'carbamazepine autoinduction metabolism levels')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['carbamazepine', 'tegretol']) && has(prompt, /\binduce.*own metabolism|own metabolism|autoinduction|auto-induction\b/),
  },
  {
    id: 'interaction-paroxetine-tamoxifen',
    lane: 'interaction_safety',
    topic: 'paroxetine tamoxifen interaction',
    text: 'Yes. Paroxetine inhibits CYP2D6 and can reduce tamoxifen activation to endoxifen, creating efficacy risk. Verify oncology/prescriber guidance, antidepressant alternatives, and current interaction references.',
    sourceRefs: [dailyMedSource('dailymed-paroxetine-tamoxifen-cyp2d6', 'DailyMed/reference search: paroxetine tamoxifen CYP2D6', 'paroxetine tamoxifen CYP2D6 endoxifen interaction')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['paroxetine', 'paxil']) && hasAny(prompt, ['tamoxifen']),
  },
  {
    id: 'interaction-maoi-pseudoephedrine',
    lane: 'interaction_safety',
    topic: 'MAOI pseudoephedrine interaction',
    text: 'Avoid/contraindication-style warning. MAOIs with pseudoephedrine can cause hypertensive crisis or severe BP risk. Verify current interaction references, BP/cardiac context, and product-specific washout guidance.',
    sourceRefs: [dailyMedSource('dailymed-maoi-pseudoephedrine', 'DailyMed labeling: MAOI pseudoephedrine hypertensive crisis', 'MAOI pseudoephedrine hypertensive crisis contraindicated')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bmaoi|phenelzine|tranylcypromine|selegiline\b/) && hasAny(prompt, ['pseudoephedrine', 'sudafed']),
  },
  {
    id: 'interaction-divalproex-urea-cycle',
    lane: 'interaction_safety',
    topic: 'divalproex urea cycle disorder contraindication',
    text: 'Yes. Divalproex/valproate is contraindicated in known urea cycle disorders because hyperammonemia/encephalopathy risk can be severe. Verify history, ammonia/mental status if symptomatic, genetics/metabolic context, and product labeling.',
    sourceRefs: [dailyMedSource('dailymed-valproate-urea-cycle-disorder', 'DailyMed labeling: valproate urea cycle disorder contraindication', 'divalproex valproate urea cycle disorder contraindicated hyperammonemia')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['divalproex', 'valproate', 'depakote', 'valproic acid']) && has(prompt, /\burea cycle\b/),
  },
  {
    id: 'pregnancy-lithium-first-trimester',
    lane: 'interaction_safety',
    topic: 'lithium first trimester pregnancy risk',
    text: 'Lithium in the first trimester is not a simple safe/unsafe answer; pregnancy risk-benefit review is needed because of congenital cardiac risk signals and relapse risk if untreated. Verify trimester, indication severity, renal/level monitoring, fetal-cardiac screening plan, and perinatal psychiatry/OB guidance.',
    sourceRefs: [dailyMedSource('dailymed-lithium-pregnancy', 'DailyMed labeling: lithium pregnancy risk', 'lithium pregnancy first trimester cardiac malformation risk')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lithium']) && has(prompt, /\bpregnancy|pregnant|first trimester\b/),
  },
  {
    id: 'pregnancy-ebstein-anomaly-ssri',
    lane: 'interaction_safety',
    topic: 'Ebstein anomaly medication association',
    text: 'No SSRI is classically the medication most associated with Ebstein anomaly; lithium is the traditional pregnancy association, while paroxetine has cardiac-malformation warnings. Verify the exact exposure, timing, and pregnancy risk-benefit guidance.',
    sourceRefs: [dailyMedSource('dailymed-lithium-paroxetine-pregnancy-cardiac', 'DailyMed labeling: lithium/paroxetine pregnancy cardiac risk context', 'lithium Ebstein anomaly paroxetine pregnancy cardiac malformation')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bebstein\b/) && has(prompt, /\bssri|ssris|paroxetine|lithium\b/),
  },
  {
    id: 'pregnancy-sertraline-breastfeeding',
    lane: 'interaction_safety',
    topic: 'sertraline breastfeeding reference',
    text: 'Sertraline is often considered one of the preferred SSRIs during breastfeeding, but pregnancy/lactation issues should be verified with current references, including risk-benefit context. Verify infant prematurity/medical status, sedation/feeding symptoms, maternal response, and current lactation references. Do not use this layer alone for pregnancy or lactation prescribing decisions.',
    sourceRefs: [dailyMedSource('dailymed-sertraline-lactation', 'DailyMed labeling: sertraline lactation', 'sertraline breastfeeding lactation infant risk')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['sertraline', 'zoloft']) && has(prompt, /\bbreastfeeding|breast milk|lactation|nursing\b/),
  },
  {
    id: 'pregnancy-ssri-pphn',
    lane: 'interaction_safety',
    topic: 'SSRI PPHN pregnancy risk',
    text: 'Yes. SSRI exposure, especially later in pregnancy, has been associated with PPHN risk, though absolute risk is low and confounded by illness factors. Verify timing, SSRI, obstetric risks, neonatal plan, and pregnancy risk-benefit guidance.',
    sourceRefs: [dailyMedSource('dailymed-ssri-pphn-pregnancy', 'DailyMed labeling: SSRI PPHN pregnancy warning', 'SSRI pregnancy PPHN persistent pulmonary hypertension newborn')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bpphn|persistent pulmonary hypertension\b/) && has(prompt, /\bssri|ssris|pregnancy|pregnant\b/),
  },
  {
    id: 'pregnancy-clozapine',
    lane: 'interaction_safety',
    topic: 'clozapine pregnancy risk-benefit',
    text: 'Clozapine can be used in pregnancy only with individualized risk-benefit review; risks include metabolic effects, sedation, seizures, constipation/ileus, and neonatal adaptation concerns. Verify ANC monitoring, levels/smoking changes, diabetes risk, and perinatal psychiatry/OB guidance.',
    sourceRefs: [dailyMedSource('dailymed-clozapine-pregnancy', 'DailyMed labeling: clozapine pregnancy and lactation', 'clozapine pregnancy lactation neonatal extrapyramidal withdrawal')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['clozapine', 'clozaril']) && has(prompt, /\bpregnancy|pregnant\b/),
  },
  {
    id: 'pregnancy-benzodiazepines-floppy-baby',
    lane: 'interaction_safety',
    topic: 'benzodiazepines floppy baby syndrome',
    text: 'Yes. Benzodiazepine exposure near delivery is associated with neonatal sedation/respiratory depression and floppy baby or withdrawal risk. Verify timing, dose, co-sedatives, indication severity, and pregnancy risk-benefit guidance.',
    sourceRefs: [dailyMedSource('dailymed-benzodiazepines-pregnancy-neonatal', 'DailyMed labeling: benzodiazepine pregnancy neonatal risks', 'benzodiazepine pregnancy neonatal sedation withdrawal floppy infant')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bbenzodiazepine|benzodiazepines|benzo|benzos|alprazolam|lorazepam|diazepam|clonazepam\b/) && has(prompt, /\bfloppy baby|pregnancy|pregnant|neonatal\b/),
  },
  {
    id: 'pregnancy-paroxetine-category-d',
    lane: 'interaction_safety',
    topic: 'paroxetine historical pregnancy category D',
    text: 'Paroxetine historically carried FDA Pregnancy Category D, but labels now use narrative pregnancy risk sections rather than letter categories. Verify cardiac-malformation risk, current labeling, alternatives, and pregnancy risk-benefit guidance.',
    sourceRefs: [dailyMedSource('dailymed-paroxetine-pregnancy-category-d', 'DailyMed labeling: paroxetine pregnancy risk', 'paroxetine pregnancy category D cardiac malformation')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['paroxetine', 'paxil']) && has(prompt, /\bcategory d|pregnancy|pregnant\b/),
  },
  {
    id: 'pregnancy-lamotrigine-levels-drop',
    lane: 'interaction_safety',
    topic: 'lamotrigine levels during pregnancy',
    text: 'Yes. lamotrigine clearance can increase during pregnancy, so levels may drop and symptoms/seizure or mood relapse risk can change. Verify baseline level/response, trimester, postpartum plan, and current prescribing reference risk-benefit guidance.',
    sourceRefs: [dailyMedSource('dailymed-lamotrigine-pregnancy-clearance', 'DailyMed labeling: lamotrigine pregnancy/lactation and levels', 'lamotrigine pregnancy clearance levels drop')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lamotrigine', 'lamictal']) && has(prompt, /\bpregnancy|pregnant|levels drop|level drop\b/),
  },
  {
    id: 'pregnancy-haloperidol',
    lane: 'interaction_safety',
    topic: 'haloperidol pregnancy risk-benefit',
    text: 'Haloperidol may be used in pregnancy when benefits justify risk, but it is not a blanket safe answer. Verify indication/urgency, EPS/QTc risks, neonatal symptoms if late exposure, and pregnancy risk-benefit OB/perinatal guidance.',
    sourceRefs: [dailyMedSource('dailymed-haloperidol-pregnancy', 'DailyMed labeling: haloperidol pregnancy neonatal EPS/withdrawal', 'haloperidol pregnancy neonatal extrapyramidal withdrawal QT')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['haloperidol', 'haldol']) && has(prompt, /\bpregnancy|pregnant\b/),
  },
  {
    id: 'pregnancy-stimulants-lactation',
    lane: 'interaction_safety',
    topic: 'stimulants lactation risk-benefit',
    text: 'Stimulants during lactation require pregnancy/lactation risk-benefit review rather than a simple safe answer. Verify agent/dose, infant age, feeding/irritability/sleep/weight gain, maternal functioning, misuse risk, and current lactation references.',
    sourceRefs: [dailyMedSource('dailymed-stimulants-lactation', 'DailyMed labeling: stimulant lactation context', 'methylphenidate amphetamine lactation breastfeeding infant')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bstimulant|stimulants|methylphenidate|amphetamine|lisdexamfetamine\b/) && has(prompt, /\blactation|breastfeeding|breast milk|nursing\b/),
  },
  {
    id: 'pregnancy-snri-neonatal-withdrawal',
    lane: 'interaction_safety',
    topic: 'SNRI neonatal withdrawal/adaptation',
    text: 'Yes. SNRIs can be associated with neonatal adaptation/withdrawal-type symptoms after late pregnancy exposure. Verify timing, dose, maternal illness severity, neonatal monitoring plan, and pregnancy risk-benefit guidance.',
    sourceRefs: [dailyMedSource('dailymed-snri-pregnancy-neonatal-withdrawal', 'DailyMed labeling: SNRI pregnancy neonatal adaptation', 'SNRI pregnancy neonatal withdrawal adaptation venlafaxine duloxetine')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bsnri|snris|venlafaxine|duloxetine\b/) && has(prompt, /\bneonatal|withdrawal|pregnancy|pregnant\b/),
  },
  {
    id: 'pregnancy-quetiapine-insomnia',
    lane: 'interaction_safety',
    topic: 'quetiapine insomnia in pregnancy',
    text: 'Quetiapine for insomnia in pregnancy should not be treated as routine or benign; pregnancy risk-benefit review depends on indication, alternatives, metabolic/sedation risk, and fetal/neonatal context. Verify OB/perinatal psychiatry guidance.',
    sourceRefs: [dailyMedSource('dailymed-quetiapine-pregnancy', 'DailyMed labeling: quetiapine pregnancy and neonatal risks', 'quetiapine pregnancy insomnia neonatal extrapyramidal withdrawal')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['quetiapine', 'seroquel']) && has(prompt, /\bpregnancy|pregnant\b/),
  },
  {
    id: 'pregnancy-carbamazepine-breastfeeding',
    lane: 'interaction_safety',
    topic: 'carbamazepine breastfeeding',
    text: 'Carbamazepine can be compatible with breastfeeding in some contexts, but pregnancy/lactation risk-benefit review is still needed. Verify infant sedation/feeding, hepatic symptoms, maternal dose/level, and current lactation references.',
    sourceRefs: [dailyMedSource('dailymed-carbamazepine-lactation', 'DailyMed labeling: carbamazepine lactation', 'carbamazepine breastfeeding lactation infant hepatic sedation')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['carbamazepine', 'tegretol']) && has(prompt, /\bbreastfeeding|breast milk|lactation|nursing\b/),
  },
  {
    id: 'pregnancy-lithium-breast-milk',
    lane: 'interaction_safety',
    topic: 'lithium breast milk',
    text: 'Yes. Lithium passes into breast milk, and infant exposure can be clinically meaningful. Verify infant renal/thyroid status, hydration/feeding, maternal level, monitoring feasibility, and pregnancy/lactation risk-benefit guidance.',
    sourceRefs: [dailyMedSource('dailymed-lithium-lactation', 'DailyMed labeling: lithium lactation', 'lithium breast milk lactation infant renal thyroid')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['lithium']) && has(prompt, /\bbreast milk|breastfeeding|lactation|nursing\b/),
  },
  {
    id: 'pregnancy-ect',
    lane: 'interaction_safety',
    topic: 'ECT during pregnancy',
    text: 'Yes, ECT can be performed during pregnancy when clinically indicated, but it requires pregnancy risk-benefit review and coordinated anesthesia/OB/psychiatry planning. Verify gestational age, medical/obstetric risks, fetal monitoring plan, and local protocol.',
    sourceRefs: [referenceSource('apa-ect-pregnancy-reference-search', 'Reference search: ECT during pregnancy safety planning', 'https://pubmed.ncbi.nlm.nih.gov/?term=electroconvulsive+therapy+pregnancy+safety')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bect|electroconvulsive\b/) && has(prompt, /\bpregnancy|pregnant\b/),
  },
  {
    id: 'pregnancy-mirtazapine-nursing',
    lane: 'interaction_safety',
    topic: 'mirtazapine nursing',
    text: 'Mirtazapine during nursing requires pregnancy/lactation risk-benefit review, not a blanket safe answer. Verify infant sedation/feeding/weight gain, maternal response, co-sedatives, and current lactation references.',
    sourceRefs: [dailyMedSource('dailymed-mirtazapine-lactation', 'DailyMed labeling: mirtazapine lactation', 'mirtazapine breastfeeding lactation infant sedation')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['mirtazapine', 'remeron']) && has(prompt, /\bnursing|breastfeeding|breast milk|lactation\b/),
  },
  {
    id: 'pregnancy-topiramate-oral-clefts',
    lane: 'interaction_safety',
    topic: 'topiramate oral cleft pregnancy risk',
    text: 'Yes. Topiramate exposure in pregnancy is associated with oral cleft risk and other fetal-growth concerns. Verify indication, dose, timing, alternatives, contraception/pregnancy status, and pregnancy risk-benefit guidance.',
    sourceRefs: [dailyMedSource('dailymed-topiramate-pregnancy-oral-clefts', 'DailyMed labeling: topiramate pregnancy oral clefts', 'topiramate pregnancy oral clefts fetal risk')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['topiramate', 'topamax']) && has(prompt, /\boral cleft|oral clefts|pregnancy|pregnant|newborn\b/),
  },
  {
    id: 'pregnancy-bupropion',
    lane: 'interaction_safety',
    topic: 'bupropion pregnancy',
    text: 'Bupropion in pregnancy is an individualized risk-benefit decision, often considered when depression or smoking cessation benefit is important. Verify indication, seizure/eating-disorder risk, alternatives, exposure timing, and current pregnancy guidance.',
    sourceRefs: [dailyMedSource('dailymed-bupropion-pregnancy', 'DailyMed labeling: bupropion pregnancy', 'bupropion pregnancy smoking cessation depression fetal risk')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && hasAny(prompt, ['bupropion', 'wellbutrin', 'zyban']) && has(prompt, /\bpregnancy|pregnant\b/),
  },
  {
    id: 'pregnancy-ssri-neurodevelopment',
    lane: 'interaction_safety',
    topic: 'SSRI in utero neurodevelopment',
    text: 'Long-term neurodevelopmental findings after SSRI exposure in utero are mixed and confounded by underlying illness; pregnancy risk-benefit review should not overstate certainty. Verify exposure timing, illness severity, co-medications, and current perinatal guidance.',
    sourceRefs: [dailyMedSource('dailymed-ssri-pregnancy-neurodevelopment', 'DailyMed/reference search: SSRI pregnancy neurodevelopment', 'SSRI pregnancy neurodevelopment long term risk')],
    matches: (prompt) => isPlainReferenceQuestion(prompt) && has(prompt, /\bssri|ssris\b/) && has(prompt, /\bneurodevelopment|in utero|long-term|long term|pregnancy|pregnant\b/),
  },
];

export function answerDirectMedicationReferenceQuestion(prompt: string): DirectMedicationReferenceAnswer | null {
  const normalizedPrompt = expandBrandGenericMedicationTerms(normalizeMedReferenceText(prompt));

  for (const entry of DIRECT_MEDICATION_REFERENCE_ANSWERS) {
    if (entry.matches(normalizedPrompt)) {
      const { matches: _matches, ...answer } = entry;
      return answer;
    }
  }

  return null;
}
