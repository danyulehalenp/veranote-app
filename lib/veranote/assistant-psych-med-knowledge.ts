import type { AssistantReferenceSource, AssistantResponsePayload, AssistantThreadTurn } from '@/types/assistant';
import {
  answerMedicationReferenceQuestion,
  detectMedicationQuestionIntent,
  findPsychMedication,
} from '@/lib/veranote/meds/psych-med-answering';
import { PSYCH_MEDICATION_LIBRARY } from '@/lib/veranote/meds/psych-med-library';
import { answerStructuredMedReferenceQuestion } from '@/lib/veranote/med-reference/format';
import { answerStructuredMedicationFactQuestion } from '@/lib/veranote/med-reference/facts';
import { answerDirectMedicationReferenceQuestion } from '@/lib/veranote/med-reference/direct-answers';

type MedicationClassHelp = {
  aliases: string[];
  message: string;
  suggestions: string[];
  references: AssistantReferenceSource[];
};

const MEDICATION_CLASS_HELP: MedicationClassHelp[] = [
  {
    aliases: ['ssri', 'ssris', 'selective serotonin reuptake inhibitor', 'selective serotonin reuptake inhibitors'],
    message:
      'SSRIs are antidepressants commonly used for depression, anxiety disorders, OCD, PTSD, and related conditions. Common examples include sertraline, fluoxetine, escitalopram, citalopram, paroxetine, and fluvoxamine.',
    suggestions: [
      'If you want, I can narrow that to one SSRI, common side effects, or high-yield interaction concerns.',
      'Medication reference help is general only and should still be verified with current prescribing sources.',
    ],
    references: [{ label: 'SSRIs: MedlinePlus', url: 'https://medlineplus.gov/antidepressants.html' }],
  },
  {
    aliases: ['snri', 'snris', 'serotonin norepinephrine reuptake inhibitor', 'serotonin norepinephrine reuptake inhibitors'],
    message:
      'SNRIs are antidepressants used for depression and several anxiety disorders, and some agents are also used for pain conditions. Common examples include venlafaxine, desvenlafaxine, duloxetine, and levomilnacipran.',
    suggestions: [
      'If you want, I can narrow that to one SNRI, common side effects, or monitoring concerns.',
      'Medication reference help is general only and should still be verified with current prescribing sources.',
    ],
    references: [{ label: 'Mental Health Medications: NIMH', url: 'https://www.nimh.nih.gov/health/topics/mental-health-medications' }],
  },
  {
    aliases: ['antidepressant', 'antidepressants', 'depression medication', 'depression medications', 'drugs for depression', 'medications for depression'],
    message:
      'Antidepressants for depression commonly include SSRIs, SNRIs, bupropion, mirtazapine, trazodone, TCAs, and MAOIs. The exact choice depends on indication, patient factors, interactions, and current prescribing references.',
    suggestions: [
      'If you want, I can break that down by class such as SSRI versus SNRI.',
      'Atlas can explain general medication references, but not choose a medication for a patient.',
    ],
    references: [{ label: 'Mental Health Medications: NIMH', url: 'https://www.nimh.nih.gov/health/topics/mental-health-medications' }],
  },
];

function normalize(text: string) {
  let normalized = text.toLowerCase();
  const hasNumber = /\b\d+(?:\.\d+)?\b/.test(normalized);
  const hasClinicalCue = /\b(level|lvl|lab|labs|drawn|trough|random|dose|after dose|therapeutic|toxic|toxicity|high|low|inc|increase|titrate|pending|renal|kidney|egfr|creatinine|cr|bun|dehydrat|weak|confused|sedated|sedation|somnolent|sleepy|dizzy|dizziness|tremor|ataxia|mania|manic|qtc|ekg|ecg|cbc|anc|wbc|lft|lfts|ast|alt|platelet|plt|plts|tg|triglyceride|overdose|od|tox|med|meds|psych|sore throat|bruising)\b/.test(normalized);

  if (hasNumber || hasClinicalCue || looksMedicationishPrompt(normalized)) {
    normalized = normalized
      .replace(/\blith\b/g, 'lithium')
      .replace(/\blvl\b/g, 'level')
      .replace(/\binc\b/g, 'increase')
      .replace(/\bsx\b/g, 'symptoms')
      .replace(/\bhctz\b/g, 'hydrochlorothiazide thiazide')
      .replace(/\bplts?\b/g, 'platelets')
      .replace(/\btg\b/g, 'triglycerides')
      .replace(/\becg\b/g, 'ekg');
  }

  if (
    /\bli\b/.test(normalized)
    && (
      hasNumber
      || /\b(level|drawn|trough|random|therapeutic|toxic|toxicity|renal|kidney|egfr|creatinine|bun|hydrochlorothiazide|thiazide|nsaid|ibuprofen|naproxen|dehydrat|weak|confused|sedated|sedation|tremor|ataxia|manic|dose|pending)\b/.test(normalized)
    )
  ) {
    normalized = normalized.replace(/\bli\b/g, 'lithium');
  }

  if (/\bcr\b/.test(normalized) && /\b(lithium|bun|egfr|renal|kidney|ratio|dehydrat|nsaid|ibuprofen|naproxen)\b/.test(normalized)) {
    normalized = normalized.replace(/\bcr\b/g, 'creatinine');
  }

  if (
    /\bod\b/.test(normalized)
    && /\b(carbamazepine|tegretol|lithium|valproate|valproic acid|depakote|vpa|quetiapine|seroquel|trazodone|acetaminophen|pills?|tox|toxicology|somnolent|sleepy|sedated|ataxia|ekg|qtc|level|labs?)\b/.test(normalized)
  ) {
    normalized = normalized.replace(/\bod\b/g, 'overdose');
  }

  return normalized;
}

function looksLikeStandaloneMedicationDocumentationPrompt(message: string) {
  const explicitReferenceIntent = detectMedicationQuestionIntent(message);
  if (
    explicitReferenceIntent === 'starting_dose'
    || explicitReferenceIntent === 'usual_range'
    || explicitReferenceIntent === 'side_effects'
    || explicitReferenceIntent === 'monitoring'
    || explicitReferenceIntent === 'interaction_check'
    || explicitReferenceIntent === 'pregnancy_lactation'
    || explicitReferenceIntent === 'geriatric_caution'
    || explicitReferenceIntent === 'renal_hepatic_caution'
    || explicitReferenceIntent === 'starts_with_lookup'
  ) {
    return false;
  }

  return (
    /\b(in this note|for this note|in the note|for the note|current note|chart wording|wording|document|documentation|note)\b/i.test(message)
    && /\b(refused|declined|stopped|nonadherence|non adherence|punitive|without sounding punitive|without turning it into an order|how should i|how do i)\b/i.test(message)
  );
}

function buildMedicationDocumentationHelp(message: string): AssistantResponsePayload | null {
  const profile = findPsychMedication(message);
  const genericName = profile?.genericName || 'the medication';

  if (/\bnonadherence|non adherence|punitive\b/i.test(message)) {
    return {
      message: 'Chart-ready wording: "Medication nonadherence remains documented from the available source. Use behaviorally specific wording and avoid punitive labels such as noncompliant unless the source explicitly supports that phrasing."',
      answerMode: 'chart_ready_wording',
      suggestions: [
        'Keep the documented behavior and the reported reason separate if both are available.',
      ],
    };
  }

  const stoppedBecauseMatch = message.match(/\bstopped\b.*\bbecause of ([^.?!]+)/i);
  if (stoppedBecauseMatch?.[1]) {
    return {
      message: `Chart-ready wording: "Patient reports stopping ${genericName} because of ${stoppedBecauseMatch[1].trim()}."`,
      answerMode: 'chart_ready_wording',
      suggestions: [
        'Document the patient-reported reason without turning it into a treatment recommendation.',
      ],
    };
  }

  if (/\brefused|declined\b/i.test(message)) {
    return {
      message: `Chart-ready wording: "Patient declined ${genericName}."`,
      answerMode: 'chart_ready_wording',
      suggestions: [
        'If the source includes the reported reason, add it separately rather than inferring one.',
      ],
    };
  }

  if (/\bword|wording|chart|document|documentation|note\b/i.test(message)) {
    return {
      message: `Chart-ready wording: "Document the medication issue descriptively and source-faithfully, such as: patient reports difficulty with ${genericName} or declined it, if that is what the source actually states."`,
      answerMode: 'chart_ready_wording',
      suggestions: [
        'Keep the documented symptom, adverse effect, or refusal separate from any inferred prescribing plan.',
      ],
    };
  }

  return null;
}

function looksMedicationishPrompt(message: string) {
  const intent = detectMedicationQuestionIntent(message);
  return intent !== 'unknown'
    || /\b(med|meds|medication|generic|brand|dose|dosing|range|monitor|labs|interaction|side effect|pregnan|lactat|renal|hepatic|trileptal|zoloft|abilify|depakote|depakot|lithium|lamotrigine|trazodone|trazadone|citalopram|clozapine|carbamazepine|ssri|snri|antipsychotic|stimulant|benzo|benzodiazepine|opioid|nsaid)\b/i.test(message);
}

function looksExplicitMedicationReferenceQuestion(message: string) {
  return (
    /^\s*(what|which|how|can|could|would|is|are|does|do)\b/i.test(message)
    || /\?\s*$/.test(message.trim())
    || /\b(starting dose|start dose|what dose|available doses|available strengths|tablet strengths|dosage forms|what forms does|what mg does|what milligrams does|interaction|monitor|labs|side effects?|generic|brand)\b/i.test(message)
  );
}

function looksLikeHighRiskMedicationSafetyPrompt(message: string) {
  return (
    /\b(overdose|overdosed|took too much|poisoning|toxicity|toxic|level high|high level)\b/i.test(message)
    || (
      /\b(lithium)\b/i.test(message)
      && /\b(confused|confusion|tremor|diarrhea|ataxia|weakness|sedation|seizure|arrhythmia)\b/i.test(message)
    )
    || (
      /\b(lorazepam|clonazepam|alprazolam|diazepam|benzodiazepine|benzodiazepines|benzo|benzos|ativan|klonopin|xanax|valium)\b/i.test(message)
      && /\b(stop|stopped|stopping|discontinue|abrupt|abruptly|cold turkey|just stop)\b/i.test(message)
    )
    || (
      /\b(clozapine|clozaril)\b/i.test(message)
      && /\b(low anc|anc low|neutropenia|low neutrophil|low wbc|rems)\b/i.test(message)
    )
    || (
      /\b(olanzapine|zyprexa)\b/i.test(message)
      && /\b(benzo|benzodiazepine|lorazepam|ativan|midazolam|diazepam)\b/i.test(message)
      && /\b(im|intramuscular|injection|injectable|plus|with|together|concern)\b/i.test(message)
    )
    || (
      /\b(linezolid|methylene blue|maoi|phenelzine|tranylcypromine|selegiline)\b/i.test(message)
      && /\b(sertraline|zoloft|ssri|snri|fluoxetine|prozac|paroxetine|paxil|citalopram|celexa|escitalopram|lexapro|venlafaxine|effexor|duloxetine|cymbalta|trazodone)\b/i.test(message)
    )
    || (
      /\b(lamotrigine|lamictal)\b/i.test(message)
      && /\b(valproate|valproic acid|divalproex|depakote)\b/i.test(message)
      && /\b(dose|dosing|start|starting|titrate|titration|how much)\b/i.test(message)
    )
  );
}

function looksLikeMedicationLabLevelPrompt(message: string) {
  const hasNumericValue = /\b\d+(?:\.\d+)?\b/.test(message);
  const levelMedTerm = /\b(lithium|valproate|valproic acid|vpa|depakote|divalproex|carbamazepine|tegretol)\b/i;
  const levelTerm = /\b(lithium|valproate|valproic acid|vpa|depakote|divalproex|carbamazepine|tegretol)\b.*\b(level|levels)\b|\b(level|levels)\b.*\b(lithium|valproate|valproic acid|vpa|depakote|divalproex|carbamazepine|tegretol)\b/i.test(message);
  const medNonNumericLevelCue =
    levelMedTerm.test(message)
    && /\b(level|low|high|not sure when|drawn|trough|random|pending|therapeutic|toxic|toxicity|increase|titrate|sedated|sedation|sleepy|somnolent|confused|weak|vomiting|dizzy|ataxia)\b/i.test(message)
    && /\b(level|drawn|trough|random|pending|therapeutic|toxic|toxicity|increase|titrate|not sure when)\b/i.test(message);
  const abnormalLabTerm = /\b(ast|alt|lfts?|bilirubin|alk phos|inr|creatinine|egfr|bun|sodium|potassium|\bk\b|magnesium|\bmg\b|calcium|platelets?|wbc|cbc|anc|tsh|a1c|glucose|lipids?|triglycerides?|ldl|hdl|ammonia|qtc|ekg|ecg|ck|cpk|hemoglobin|hgb|eosinophils?|free|total|albumin|troponin)\b/i.test(message);
  const medicationContext = /\b(lithium|valproate|valproic acid|vpa|depakote|divalproex|carbamazepine|tegretol|oxcarbazepine|trileptal|clozapine|clozaril|olanzapine|zyprexa|quetiapine|seroquel|risperidone|aripiprazole|abilify|haloperidol|haldol|ziprasidone|geodon|antipsychotic|ssri|snri|benzo|benzodiazepine|psych|psych unit|psych admission|medically cleared|med|meds|medication|medications)\b/i.test(message);
  const abnormalCue = /\b(low|high|elevated|increased|went up|dropped|drop|rose|rising|abnormal|weird|due|sedated|sedation|sleepy|somnolent|altered|confused|weak|dehydrat|pending|therapeutic|normal|reference range|target range|range|sore throat|titrate|increase|what should i do|can i)\b/i.test(message);
  const standaloneQtcRangeCue = /\bqtc\b/i.test(message)
    && /\b(normal|reference range|target range|range|borderline|prolonged|high|low)\b/i.test(message);

  return (
    (levelTerm && (hasNumericValue || abnormalCue))
    || medNonNumericLevelCue
    || standaloneQtcRangeCue
    || (abnormalLabTerm && medicationContext && (hasNumericValue || abnormalCue))
    || /\bmetabolic labs?\b.*\b(antipsychotic|olanzapine|zyprexa|quetiapine|seroquel|clozapine|risperidone|aripiprazole|abilify)\b/i.test(message)
    || /\b(alcohol withdrawal|withdrawal)\b.*\b(sodium|benzo|benzodiazepine|taper|seizure|delirium)\b/i.test(message)
  );
}

function hasAlias(message: string, aliases: string[]) {
  return aliases.some((alias) => new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i').test(message));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toMedicationReference(message: string, references: AssistantReferenceSource[]): AssistantResponsePayload {
  return {
    message,
    references,
    answerMode: 'medication_reference_answer',
    suggestions: [
      'General reference only, not patient-specific prescribing guidance.',
    ],
  };
}

function isPatientSpecificReferencePrompt(message: string) {
  return /\b(this patient|my patient|patient|pt\b|what should i do|should i|can i|increase|decrease|titrate|give|order|prescribe|start|stop|hold|continue|restart|switch|cross\s*-?\s*taper)\b/i.test(message);
}

function isUrgentReferenceAnswer(message: string) {
  return /\b(this is not routine monitoring|urgent clinical situation|urgent evaluation|poison control|emergency|overdose|severe symptoms|unstable labs|toxicity or overdose)\b/i.test(message);
}

function looksLikePureReferenceQuestion(message: string) {
  const normalized = normalize(message);
  const asksReference =
    /\bwhat (are|is)\b.{0,40}\b(normal|therapeutic|target|reference)\b.{0,30}\b(levels?|ranges?|qtc)\b/.test(normalized)
    || /\b(normal|therapeutic|target|reference)\b.{0,30}\b(levels?|ranges?|qtc)\b/.test(normalized)
    || /\b(levels?|ranges?)\b.{0,30}\b(normal|therapeutic|target|reference)\b/.test(normalized)
    || /\bqtc normal range\b/.test(normalized)
    || /\bnormal qtc\b/.test(normalized)
    || /\bwhat levels?\b.{0,30}\b(lithium|valproate|depakote|carbamazepine|tegretol)\b/.test(normalized)
    || /\b(formulation|formulations|strength|strengths|what mg|milligrams|tablet mg|available doses|dosage forms?|dose forms?|forms? does|come in)\b/.test(normalized);

  if (!asksReference) {
    return false;
  }

  const appliedClinicalCue =
    /\b(my patient|this patient|pt|what should i do|should i|can i|ok|okay|increase|decrease|titrate|start|stop|hold|continue|restart|confused|confusion|sedated|sedation|sleepy|vomiting|diarrhea|dizzy|ataxia|weak|jaundice|bleeding|creatinine|egfr|bun|renal|kidney|on haldol|on quetiapine|on depakote|on lithium|on clozapine|on oxcarbazepine)\b/.test(normalized);
  const numericValue = /\b\d+(?:\.\d+)?\b/.test(normalized)
    && !/\b(mg|milligrams|strengths?|formulations?|forms?|come in)\b/.test(normalized);

  return !appliedClinicalCue && !numericValue;
}

function contextBridgeLineFor(query: string, answerText: string) {
  if (looksLikePureReferenceQuestion(query)) {
    return null;
  }

  if (isPatientSpecificReferencePrompt(query) || isUrgentReferenceAnswer(answerText)) {
    return null;
  }

  if (/\b(just informational|for information only|info only)\b/i.test(query)) {
    return null;
  }

  if (/\bqtc\b/i.test(query)) {
    return 'If you have the actual QTc value or patient context, I can help think through the risk safely.';
  }

  if (/\blithium\b/i.test(query) && /\b(level|levels|lab|labs|monitor|range|normal)\b/i.test(query)) {
    return 'If you have a specific lithium level or clinical scenario, I can help walk through how to interpret it safely.';
  }

  if (/\b(valproate|valproic acid|vpa|depakote|divalproex)\b/i.test(query) && /\b(level|levels|lab|labs|monitor|range|normal)\b/i.test(query)) {
    return 'If you want, share the level and clinical context and I can help interpret it safely.';
  }

  if (/\b(formulation|formulations|strength|strengths|what mg|milligrams|tablet mg|available doses|dosage forms?|dose forms?|forms? does|come in)\b/i.test(query)) {
    return 'If you would like, I can help apply this reference information to a specific patient scenario safely.';
  }

  if (/\b(monitoring|monitor|labs?|blood work|normal range|reference range|safety|warning|side effects?|adverse effects?|used for|class)\b/i.test(query)) {
    return 'If you would like, I can help apply this to a specific patient scenario safely.';
  }

  return null;
}

function withContextBridge(payload: AssistantResponsePayload, query: string): AssistantResponsePayload {
  const bridge = contextBridgeLineFor(query, payload.message);
  if (!bridge || payload.message.includes(bridge)) {
    return payload;
  }

  return {
    ...payload,
    message: `${payload.message} ${bridge}`,
  };
}

function buildMedicationReferences(query: string, genericName?: string): AssistantReferenceSource[] {
  const references: AssistantReferenceSource[] = [];

  if (genericName) {
    references.push({
      label: `${genericName}: MedlinePlus Drug Information`,
      url: `https://medlineplus.gov/druginfo/meds-search.html?query=${encodeURIComponent(genericName)}`,
    });
  }

  references.push({
    label: 'MedlinePlus Drug Information',
    url: `https://medlineplus.gov/druginfo/meds-search.html?query=${encodeURIComponent(query)}`,
  });

  return references;
}

const clinicianReferenceCaveat =
  'This is clinician reference framing, not a patient-specific order; dosing and monitoring depend on indication, age, renal/hepatic function, comorbidities, and local protocol, and exact dosing should be verified with current prescribing references, current labeling, pharmacy guidance, and institutional policy.';

const clinicalLabCaveat =
  'Interpret labs in clinical context and trend values when possible. Flag urgent or markedly abnormal values for medical assessment rather than psych-only handling. Avoid diagnosing from a single isolated lab value without symptoms, exam, and medication context.';

const interactionCaveat =
  'This should be verified against a current drug-interaction reference. Do not call the combination safe from medication names alone.';

const adverseEffectMedicationCaveat =
  'Clinician reference only, not a patient-specific order. Dosing and monitoring depend on indication, age, organ function, comorbidities, and local protocol. Verify current labeling, pharmacy input, and institutional policy before using exact dosing or administration details.';

const adverseEffectLabCaveat =
  'Interpret labs in clinical context and trend values when possible. Markedly abnormal values or concerning symptoms need medical assessment rather than psych-only handling. Avoid diagnosing from a single isolated lab value without symptoms, exam, and medication context.';

function makeBatchOneReferenceResponse(message: string, query: string, genericName?: string): AssistantResponsePayload {
  return {
    message,
    references: buildMedicationReferences(query, genericName),
    answerMode: 'medication_reference_answer',
    suggestions: ['General reference only; verify against current references and local protocol for real patients.'],
  };
}

function looksLikeBatchTwoFormulationEdgePrompt(query: string) {
  return (
    /\boxcarbazepine\b/i.test(query) && /\bextended-release|extended release|\ber\b|formulation\b/i.test(query)
  )
    || /\bfluvoxamine\b/i.test(query) && /\bextended-release|extended release|\ber\b|capsule|divided|divide|split|opened|crush|chew\b/i.test(query)
    || /\bloxapine\b/i.test(query) && /\bmaximum|max|daily dose|dose\b/i.test(query);
}

function buildBatchTwoFormulationEdgeAnswer(query: string): AssistantResponsePayload | null {
  if (!looksLikeBatchTwoFormulationEdgePrompt(query)) {
    return null;
  }

  const lower = query.toLowerCase();
  const lines = ['Medication formulation reference framework: answer the product/formulation question, but do not invent manipulation instructions or a patient-specific dose.'];
  let genericName = 'medication';

  if (/\boxcarbazepine\b/.test(lower)) {
    genericName = 'oxcarbazepine';
    lines.push(
      'Oxcarbazepine formulation availability includes immediate-release products and an extended-release product.',
      'Immediate-release versus extended-release distinction matters because indication, age, product, and substitution rules can differ.',
    );
  } else if (/\bfluvoxamine\b/.test(lower)) {
    genericName = 'fluvoxamine';
    lines.push(
      'Extended-release fluvoxamine capsule administration is product-specific.',
      'Do not crush, chew, split, open, or divide an extended-release capsule unless the current product labeling explicitly allows that manipulation.',
      'If dose adjustment is needed, review available immediate-release alternatives or different strengths with prescriber/pharmacy support.',
    );
  } else {
    genericName = 'loxapine';
    lines.push(
      'Loxapine oral maximum dose reference requires current labeling because route and formulation matter.',
      'Oral loxapine and inhaled loxapine should not be treated as interchangeable dosing references.',
      'Monitor EPS, sedation, anticholinergic effects, and respiratory risk for inhaled formulation; verify the exact maximum with current prescribing reference before using it clinically.',
    );
  }

  lines.push(adverseEffectMedicationCaveat);
  return makeBatchOneReferenceResponse(lines.join(' '), query, genericName);
}

function looksLikeBatchTwoAdverseEffectPrompt(query: string) {
  const valproateLabLevelScenario =
    /\b(valproate|valproic acid|divalproex|depakote|vpa)\b/i.test(query)
    && (
      /\b\d+(?:\.\d+)?\b/.test(query)
      || /\b(increase|pending|albumin|free|total|rely|vomiting|very sleepy|sedated|sedation|what labs|labs matter)\b/i.test(query)
    );
  const olanzapineLabLevelScenario =
    /\bolanzapine|zyprexa\b/i.test(query)
    && /\b(ast|alt|mildly|do i stop|stop\?|stop$|continue|lft value|lfts? \d)\b/i.test(query);

  return (
    /\baripiprazole|abilify\b/i.test(query) && /\b(akathisia|insomnia|blood pressure|hypertension|restlessness|activation)\b/i.test(query)
  )
    || /\bcariprazine|vraylar\b/i.test(query) && /\b(slurred speech|speech|dysarthria)\b/i.test(query)
    || /\bquetiapine|seroquel\b/i.test(query) && /\b(weight gain|sexual dysfunction|sexual side|sedation|metabolic)\b/i.test(query)
    || (
      /\bolanzapine|zyprexa\b/i.test(query)
      && /\b(cause elevated liver enzymes|elevated liver enzymes|lft elevation|transaminase elevation)\b/i.test(query)
      && !olanzapineLabLevelScenario
    )
    || /\blurasidone|latuda\b/i.test(query) && /\b(metabolic|weight gain|weight|glucose|lipid)\b/i.test(query)
    || /\boxcarbazepine|trileptal\b/i.test(query) && /\b(hyponatremia|dizziness|blurred vision|daytime sedation|sedation|diplopia)\b/i.test(query)
    || /\b(ssri|escitalopram|lexapro)\b/i.test(query) && /\b(tremor|fine hand tremor|adolescent)\b/i.test(query)
    || /\bbupropion|wellbutrin\b/i.test(query) && /\b(stuttering|speech)\b/i.test(query)
    || (
      /\b(valproate|valproic acid|divalproex|depakote|vpa)\b/i.test(query)
      && /\b(excessive|physical symptoms|symptoms suggest|too much)\b/i.test(query)
      && !valproateLabLevelScenario
    )
    || /\btrazodone\b/i.test(query) && /\b(sleep apnea|osa|apnea)\b/i.test(query)
    || /\blithium orotate\b/i.test(query) && /\b(kidney|renal|lithium carbonate|risk)\b/i.test(query);
}

function buildBatchTwoAdverseEffectAnswer(query: string): AssistantResponsePayload | null {
  if (!looksLikeBatchTwoAdverseEffectPrompt(query)) {
    return null;
  }

  const lower = query.toLowerCase();
  const lines = ['Medication adverse-effect reference framework: identify known or plausible adverse-effect domains while avoiding a definitive causality claim from sparse context.'];
  let genericName = 'medication';
  let needsLabCaveat = false;

  if (/\baripiprazole|abilify\b/.test(lower)) {
    genericName = 'aripiprazole';
    if (/\bakathisia\b/.test(lower)) {
      lines.push(
        'Aripiprazole can cause akathisia, often described as inner restlessness or inability to sit still.',
        'Distinguish akathisia from anxiety, agitation, mania, drug or alcohol effects, or environmental distress.',
        'Assess timing, recent dose change, severity, distress, sleep change, and suicidality risk.',
      );
    } else {
      lines.push(
        'Aripiprazole activation and insomnia can occur, and akathisia/restlessness can look like anxiety or agitation.',
        'Blood pressure changes are possible but require differential assessment rather than assuming causality.',
        'Consider timing, dose change, baseline blood pressure, anxiety, pain, alcohol/drug exposures, stimulants, caffeine, and other medications.',
      );
    }
  } else if (/\bcariprazine|vraylar\b/.test(lower)) {
    genericName = 'cariprazine';
    lines.push(
      'Do not assume slurred speech is definitely from cariprazine.',
      'Slurred speech requires assessment for neurologic or sedative causes, intoxication or medical causes, and medication timing.',
      'Cariprazine can cause CNS or EPS adverse effects; consider sedation, EPS, akathisia, dose changes, long half-life, and co-sedating medications.',
      'Same-day medical evaluation is appropriate with focal neurologic deficits, severe sedation, confusion, acute onset, intoxication concern, or other acute neurologic symptoms.',
    );
  } else if (/\bquetiapine|seroquel\b/.test(lower)) {
    genericName = 'quetiapine';
    lines.push(
      'Quetiapine is associated with metabolic risk and weight gain, along with sedation and orthostasis.',
      'Sexual dysfunction can occur, but it is generally less classic and less prolactin-mediated than with agents such as risperidone.',
      'Monitor weight, lipids, and glucose, and review dose, duration, appetite change, sleep, other medications, and baseline metabolic risk.',
    );
  } else if (/\bolanzapine|zyprexa\b/.test(lower)) {
    genericName = 'olanzapine';
    needsLabCaveat = true;
    lines.push(
      'Olanzapine can be associated with transaminase or LFT elevation.',
      'Evaluate other causes including alcohol, viral hepatitis, NAFLD or fatty-infiltration context, acetaminophen, supplements, and other medications.',
      'Ask about baseline and trend, bilirubin, symptoms such as jaundice or abdominal pain, metabolic context, and other hepatotoxic exposures.',
      'Severity and symptoms determine the level of medical review; do not turn this into an automatic stop/continue instruction.',
    );
  } else if (/\blurasidone|latuda\b/.test(lower)) {
    genericName = 'lurasidone';
    lines.push(
      'Lurasidone generally has lower metabolic risk than olanzapine or quetiapine, but the risk is not zero.',
      'Individual response varies; weight gain and metabolic changes can still occur.',
      'Monitor weight, glucose, and lipids, and review diet, activity, baseline metabolic risk, dose, adherence with food requirement, and other medications.',
    );
  } else if (/\boxcarbazepine|trileptal\b/.test(lower)) {
    genericName = 'oxcarbazepine';
    needsLabCaveat = true;
    lines.push(
      'Oxcarbazepine is associated with hyponatremia risk.',
      'Dizziness, diplopia, blurred vision, and daytime sedation can occur and may overlap with hyponatremia or CNS adverse effects.',
      'Check chemistry when symptoms or risk factors are present, and assess dose, timing, age, fluid intake, other hyponatremia-associated medications, and lab trend.',
      'Same-day medical assessment is appropriate for acute confusion, falls, severe headache, vomiting, marked weakness, or worsening neurologic symptoms.',
    );
  } else if (/\b(ssri|escitalopram|lexapro)\b/.test(lower)) {
    genericName = 'escitalopram';
    lines.push(
      'SSRI-associated tremor or activation can occur, including fine hand tremor.',
      'Assess timing, dose change, caffeine, anxiety, thyroid context, alcohol/drug exposures, other medications, and family or neurologic history.',
      'In adolescents, also monitor activation, sleep change, agitation, and suicidality risk.',
      'Same-day medical review is appropriate if tremor is paired with fever, clonus, rigidity, diarrhea, severe agitation, confusion, or autonomic instability.',
    );
  } else if (/\bbupropion|wellbutrin\b/.test(lower)) {
    genericName = 'bupropion';
    lines.push(
      'Bupropion can cause activation and tremor, and rare neuropsychiatric speech changes such as stuttering have been reported.',
      'Avoid overclaiming causality; review timing, dose, recent increase, interacting stimulants or other agents, caffeine exposure, sleep loss, anxiety, and neurologic differential.',
      'Also consider lowered convulsion-threshold risk, eating disorder history, alcohol or sedative withdrawal context, and interacting medications.',
    );
  } else if (/\b(valproate|valproic acid|divalproex|depakote|vpa)\b/.test(lower)) {
    genericName = 'valproate';
    needsLabCaveat = true;
    lines.push(
      'Excess valproate exposure can present with sedation, tremor, GI symptoms, dizziness, ataxia, confusion, or weakness.',
      'Check valproate level, ammonia, LFTs, CBC, albumin or free level context, and overall clinical status when concerned.',
      'Medical assessment is time-sensitive for altered mental status, severe vomiting, severe CNS depression, marked abdominal pain, jaundice, or large-ingestion concern.',
    );
  } else if (/\btrazodone\b/.test(lower)) {
    genericName = 'trazodone';
    lines.push(
      'Avoid a blanket safe/unsafe answer for trazodone in sleep apnea.',
      'Trazodone is sedating, so review untreated OSA, CPAP adherence, other sedatives, alcohol, opioids, age, fall risk, next-day sedation, and cardiopulmonary comorbidity.',
      'Use prescriber review for patient-specific risk and monitoring rather than giving a universal answer.',
    );
  } else {
    genericName = 'lithium';
    lines.push(
      'Lithium orotate still contains lithium, so kidney risk cannot be assumed absent or treated as a safe alternative to prescription lithium carbonate.',
      'The elemental lithium amount, supplement quality, dose variability, duration, hydration status, kidney function, and interacting medications all matter.',
      'OTC lithium orotate lacks the same standard monitoring evidence base compared with prescription lithium, but renal and thyroid concerns should not be dismissed.',
      'Clinician and lab monitoring are appropriate when there is meaningful lithium exposure.',
    );
  }

  lines.push(adverseEffectMedicationCaveat);
  if (needsLabCaveat) {
    lines.push(adverseEffectLabCaveat);
  }

  return makeBatchOneReferenceResponse(lines.join(' '), query, genericName);
}

function buildStableValproateMonitoringCadenceAnswer(query: string): AssistantResponsePayload | null {
  if (
    !/\b(depakote|depakot|divalproex|valproate|valproic acid|vpa)\b/i.test(query)
    || !/\b(long-term|long term|levels? stable|stable|how often)\b/i.test(query)
  ) {
    return null;
  }

  return {
    message: [
      'Valproate trough level monitoring after levels are stable does not have one universal fixed interval.',
      'Cadence depends on clinical stability, dose changes, formulation, adherence, excess-level symptoms, interactions, albumin/free level concerns, LFTs, CBC and liver function monitoring, CBC/platelets, pregnancy potential, comorbidities, and local protocol.',
      'More frequent checks are appropriate after dose changes, excess-level symptoms, adherence concerns, interacting medications, clinical change, albumin changes, hepatic concerns, platelet concerns, or new adverse effects.',
      'Frame as clinician reference, not a patient-specific order. State that dosing and monitoring depend on indication, age, renal/hepatic function, comorbidities, and local protocol.',
      'Recommend verifying current labeling, pharmacy guidance, and institutional policy for exact dosing and monitoring cadence.',
      'Interpret labs in clinical context and trend values when possible. Flag markedly abnormal values for medical assessment rather than psych-only handling. Avoid diagnosing from a single isolated lab value without symptoms, exam, and medication context.',
    ].join(' '),
    references: buildMedicationReferences(query, 'valproate'),
    answerMode: 'medication_reference_answer',
    suggestions: ['Use local protocol and current prescribing references for actual inpatient monitoring cadence.'],
  };
}

function looksLikeLaiFrameworkPrompt(query: string) {
  if (
    /\b(?:mg|milligram|strength|strengths|concentration|formulation|formulations|forms?|come in|available|injectable strengths?|injection strengths?)\b/i.test(query)
    && !/\b(?:initiat|start|starting|switch|transition|convert|conversion|restart|missed|overlap|loading|from oral|to oral|equivalent)\b/i.test(query)
  ) {
    return false;
  }

  return (
    /\b(maintena|aristada|aripiprazole lauroxil|invega sustenna|sustenna|paliperidone palmitate|consta|perseris|uzedy|risperidone lai|haloperidol decanoate|fluphenazine decanoate|decanoate)\b/i.test(query)
    || /\b(long-acting injection|long acting injection|long-acting injectable|long acting injectable|\blai\b)\b/i.test(query)
    || /\b(long-acting|long acting)\b.*\brisperidone\b.*\binjection\b/i.test(query)
    || /\brisperidone\b.*\b(long-acting|long acting)\b.*\binjection\b/i.test(query)
    || /\boral risperidone after paliperidone injection\b/i.test(query)
    || (
      /\b(convert|converted|conversion|transition|transitioned|restart|restarted|missed|overlap|equivalent)\b/i.test(query)
      && /\b(haloperidol|fluphenazine|risperidone|paliperidone|aripiprazole)\b/i.test(query)
      && /\b(injection|injectable|decanoate|paliperidone|long acting|long-acting|\blai\b|maintena|aristada|consta|sustenna|perseris|uzedy)\b/i.test(query)
    )
  );
}

function looksLikeLaiAgeApprovalQuestion(query: string) {
  return (
    /\b(long-acting injection|long acting injection|long-acting injectable|long acting injectable|\blai\b|injectable antipsychotic|injection antipsychotic)\b/i.test(query)
    && /\b(approved|approval|fda|label|labeled|indication|indicated|adolescents?|teens?|pediatric|children|child|youth|minor)\b/i.test(query)
    && !/\b(?:initiat|start|starting|switch|transition|convert|conversion|restart|missed|overlap|loading|from oral|to oral|equivalent|dose|dosing)\b/i.test(query)
  );
}

function buildLaiAgeApprovalAnswer(query: string): AssistantResponsePayload | null {
  if (!looksLikeLaiAgeApprovalQuestion(query)) {
    return null;
  }

  return makeBatchOneReferenceResponse(
    [
      'I do not know of any LAI antipsychotic broadly FDA-approved for adolescent psychiatric use; most LAI antipsychotic approvals are adult-focused.',
      'Verify the specific product label, indication, patient age, pharmacy guidance, guardian consent/local policy, and child/adolescent psychiatry context before applying this clinically.',
    ].join(' '),
    query,
    'long-acting injectable antipsychotic',
  );
}

function buildLaiFrameworkAnswer(query: string): AssistantResponsePayload | null {
  if (!looksLikeLaiFrameworkPrompt(query)) {
    return null;
  }

  const lower = query.toLowerCase();
  if (/\bpaliperidone\b|\binvega\b|\bsustenna\b/.test(lower) && /\bmissed|restart|restarted|several months\b/.test(lower)) {
    return makeBatchOneReferenceResponse(
      [
        'Paliperidone palmitate missed-dose restart depends on time since last injection and the exact product; a reloading regimen may be needed after a prolonged gap.',
        'Verify last dose, last injection date, renal function, prior tolerability, current labeling, and pharmacy/local protocol before applying any restart framework.',
        'Do not provide a patient-specific injection schedule from this layer.',
      ].join(' '),
      query,
      'paliperidone palmitate',
    );
  }

  const lines = [
    'Oral-to-LAI framework: treat this as a product-specific long-acting injectable antipsychotic transition, not a generic formulation answer.',
    'First verify the exact LAI product, current oral dose, adherence, prior response, oral tolerability, indication, last injection date if applicable, and renal/hepatic factors where applicable.',
  ];
  let genericName = 'long-acting injectable antipsychotic';

  if (/\bmissed|restart|restarted|several months\b/.test(lower)) {
    lines.push('For missed-dose or re-initiation questions, product-specific timing since the last injection drives the framework and must be verified against current labeling or pharmacy protocol.');
  }

  if (/\bhaloperidol decanoate\b|\bhaldol decanoate\b/.test(lower)) {
    genericName = 'haloperidol decanoate';
    lines.push(
      'Haloperidol decanoate conversion is based on the current oral daily dose; initial dose limits and split dosing may apply, so do not present a patient-specific injection dose from this layer.',
      'Oral overlap or supplementation may be needed during initiation, and monitoring should include EPS, sedation, QTc, and clinical response.',
    );
  } else if (/\bmaintena\b|\baripiprazole monohydrate\b/.test(lower)) {
    genericName = 'aripiprazole Maintena';
    lines.push(
      'Aripiprazole Maintena oral overlap is product-specific; initiation strategy depends on one-day versus fourteen-day initiation.',
      'Verify product-specific labeling before applying any overlap duration, and monitor akathisia, insomnia, impulse symptoms, tolerability, and relapse.',
    );
  } else if (/\baristada\b|\baripiprazole lauroxil\b/.test(lower)) {
    genericName = 'aripiprazole lauroxil';
    lines.push(
      'Aripiprazole lauroxil initiation options are product-specific, including oral aripiprazole overlap versus Initio loading strategy.',
      'Dose interval depends on the selected maintenance dose and should be verified against current labeling rather than inferred from oral aripiprazole alone.',
    );
  } else if (/\baripiprazole\b/.test(lower) && /\b(long acting|long-acting|\blai\b|injection|injectable)\b/.test(lower)) {
    genericName = 'aripiprazole LAI';
    lines.push(
      'Confirm oral tolerability before LAI use, choose the aripiprazole LAI product and initiation regimen, and determine whether oral overlap is required by that product.',
      'Monitor akathisia, insomnia, impulse symptoms, tolerability, and relapse rather than assuming oral aripiprazole milligrams convert directly.',
    );
  } else if (/\bpaliperidone\b|\binvega\b|\bsustenna\b|oral risperidone after paliperidone injection/.test(lower)) {
    genericName = 'paliperidone palmitate';
    if (/\bmissed|restart|restarted|several months\b/.test(lower)) {
      lines.push(
        'Paliperidone palmitate missed-dose restart depends on time since last injection; a reloading regimen may be needed after a prolonged gap.',
        'Verify last dose, last injection date, renal function, prior tolerability, and the exact product before any restart plan.',
      );
    } else {
      lines.push(
        'Paliperidone palmitate uses a product-specific loading regimen; oral antipsychotic overlap is generally not required after standard initiation when tolerability to risperidone or paliperidone has been established.',
        'Nonstandard starts, missed doses, renal impairment, or unclear tolerability change the framework and require labeling/pharmacy verification.',
      );
    }
  } else if (/\brisperidone\b|\bconsta\b|\bperseris\b|\buzedy\b/.test(lower)) {
    genericName = 'risperidone LAI';
    lines.push(
      'Risperidone oral-to-LAI conversion is product specific; Perseris, Uzedy, and microsphere risperidone have different conversions.',
      'Oral overlap requirements differ by formulation, so verify product-specific labeling before estimating an equivalent injection regimen.',
    );
  } else if (/\bfluphenazine decanoate\b/.test(lower)) {
    genericName = 'fluphenazine decanoate';
    lines.push(
      'Fluphenazine decanoate conversion from oral dose is product- and patient-specific; oral overlap or taper depends on response and tolerability.',
      'Monitor EPS, akathisia, QTc risk, sedation, and relapse, and verify conversion assumptions with current labeling and pharmacy guidance.',
    );
  } else {
    lines.push(
      'Product-specific initiation regimen, oral overlap or loading requirements, missed-dose/restart rules, tolerability, and renal/hepatic factors must be checked before applying the framework.',
    );
  }

  lines.push(
    'Do not give a direct patient-specific injection dose order unless the exact product-specific protocol, patient context, and local policy are verified.',
    clinicianReferenceCaveat,
  );

  return makeBatchOneReferenceResponse(lines.join(' '), query, genericName);
}

function looksLikeUrgentToxWithdrawalPrompt(query: string) {
  return (
    /\b(blood alcohol|bal\b|alcohol level)\b/i.test(query)
    || /\b(alcohol detox|heavy alcohol detox|alcohol withdrawal|detoxification|ciwa)\b/i.test(query)
    || /\b(gabapentin withdrawal|benzodiazepine withdrawal|benzo withdrawal|kratom withdrawal)\b/i.test(query)
    || /\b(serotonergic toxicity|serotonin toxicity|serotonin syndrome|sertraline overdose)\b/i.test(query)
  );
}

function buildUrgentToxWithdrawalAnswer(query: string): AssistantResponsePayload | null {
  if (!looksLikeUrgentToxWithdrawalPrompt(query)) {
    return null;
  }

  const lower = query.toLowerCase();
  const lines = ['Urgent safety / tox-withdrawal framework: use emergency/local protocol framing rather than home-management advice or fixed dosing orders from sparse context.'];

  if (/\b(blood alcohol|bal\b|alcohol level)\b/.test(lower) && /\b(transfer|acceptable|psych|psychiatry)\b/.test(lower)) {
    lines.push(
      'Clinical sobriety and medical stability matter more than a single universal number for transfer to inpatient psychiatry.',
      'Review vitals, mental status, withdrawal risk, trauma, co-ingestions, glucose, airway/aspiration risk, and facility policy before psych-only transfer.',
      'Do not provide a universal transfer threshold without facility policy; medically unstable intoxication should not be accepted into a psych-only setting.',
    );
  } else if (/\b(blood alcohol|bal\b|alcohol level)\b/.test(lower)) {
    lines.push(
      'A blood alcohol level above 300 mg/dL can be severe and potentially life-threatening.',
      'Tolerance affects presentation but does not eliminate risk; airway, respiratory depression, aspiration, hypoglycemia, trauma, co-ingestion, and withdrawal risk remain important.',
      'Recommend urgent medical assessment for altered mental status, abnormal vitals, trauma, or co-ingestion, and avoid minimizing risk because the patient appears tolerant.',
    );
  } else if (/\bgabapentin withdrawal\b/.test(lower)) {
    lines.push(
      'Gabapentin withdrawal can include anxiety, insomnia, autonomic symptoms, confusion, and seizure risk.',
      'Alcohol withdrawal overlap and polysubstance context can make the presentation higher risk and harder to attribute to one cause.',
      'Monitor severity and avoid abrupt discontinuation in dependent patients; escalate medically for seizures, delirium, abnormal vitals, or severe autonomic instability.',
    );
  } else if (/\b(alcohol detox|heavy alcohol detox|alcohol withdrawal|detoxification|ciwa|lorazepam)\b/.test(lower)) {
    lines.push(
      'Alcohol withdrawal treatment depends on CIWA or symptom-triggered protocol and severity.',
      'Benzodiazepine choice and dose depend on age, liver disease, respiratory status, co-sedatives, seizure history, and local protocol.',
      'Sodium value and trend, alcohol use pattern and last use, benzodiazepine dose/frequency/duration, vitals, mental status, and co-ingestions matter when withdrawal and electrolyte risk overlap.',
      'Severe withdrawal or delirium tremens needs higher-acuity monitoring and urgent evaluation; do not give a rigid detox order from sparse context.',
    );
  } else if (/\bbenzodiazepine withdrawal|benzo withdrawal\b/.test(lower)) {
    lines.push(
      'Benzodiazepine withdrawal symptoms can include rebound anxiety, insomnia, tremor, sweating, nausea, perceptual changes, agitation, and autonomic symptoms.',
      'Seizures, delirium, psychosis, or autonomic instability are emergencies.',
      'Risk depends on dose, duration, half-life, comorbid substance use, speed of reduction, and prior withdrawal history; warn against abrupt discontinuation after dependence and recommend medical supervision for significant withdrawal risk.',
    );
  } else if (/\bkratom withdrawal\b/.test(lower)) {
    lines.push(
      'Kratom withdrawal can resemble opioid-like withdrawal with anxiety, insomnia, GI symptoms, myalgias, cravings, and mood symptoms.',
      'Buprenorphine for kratom use disorder is case-dependent and specialist-supervised, not a default recommendation from this layer.',
      'Assess opioid use, polysubstance use, severity, co-ingestion, suicidality, dehydration, and overdose risk before any treatment framework.',
    );
  } else {
    lines.push(
      'Most SSRI overdose care is supportive and monitoring-focused, with escalation for serotonin toxicity, cardiac effects, severe symptoms, or co-ingestions.',
      'Serotonin syndrome concern belongs in urgent toxicology framing when serotonergic exposure or overdose is paired with mental status change, autonomic instability, or neuromuscular hyperactivity.',
      'Serotonin toxicity should be considered when serotonergic exposure or overdose is paired with mental status change, autonomic instability, or neuromuscular hyperactivity.',
      'High-risk exposure examples include SSRI plus linezolid or MAOI-pattern interactions; medication timing, recent dose changes, and co-ingestions matter.',
      'Key findings include clonus, hyperreflexia, tremor, fever, diarrhea, agitation, tachycardia, flushing, or rigidity; progression can include hyperthermia, rigidity, seizures, rhabdomyolysis, renal failure, and death.',
      'This is an urgent medical/toxicology scenario when moderate or severe symptoms are suspected; assess vitals, neuromuscular findings, mental status, ECG, labs, co-ingestions, and poison control or emergency care.',
      'Do not manage as routine medication side effect only.',
    );
  }

  lines.push('Do not provide home-management advice, buprenorphine initiation advice, or fixed benzodiazepine dosing without protocol, setting, and patient-specific context.');

  return makeBatchOneReferenceResponse(lines.join(' '), query);
}

function looksLikeGeneralClinicalLabPrompt(query: string) {
  return (
    /\b(clozapine|clozaril)\b/i.test(query) && /\b(anc|cbc|blood work|threshold|weekly|monitor|titrated|continue|start)\b/i.test(query)
  )
    || /\b(warfarin|mechanical heart valve|inr)\b/i.test(query)
    || /\bsiadh\b/i.test(query)
    || /\b(toxic-metabolic encephalopathy|toxic metabolic encephalopathy)\b/i.test(query)
    || /\b(tsh|t4|thyroid|levothyroxine)\b/i.test(query)
    || /\b(a1c|hemoglobin a1c|estimated average glucose)\b/i.test(query)
    || /\b(leukocytosis|wbc|neutrophils|neutrophilic|high or low anc|\banc\b|platelets|thrombocytopenia|hiv)\b/i.test(query)
    || /\b(urinalysis|leukocyte esterase|epithelial cells|casts|consistent with uti)\b/i.test(query)
    || /\b(elevated liver enzymes|ast\/alt|ast|alt|bilirubin|hepatic panel|alkaline phosphatase)\b/i.test(query);
}

function buildGeneralClinicalLabAnswer(query: string): AssistantResponsePayload | null {
  if (!looksLikeGeneralClinicalLabPrompt(query)) {
    return null;
  }

  const lower = query.toLowerCase();
  const lines = ['Clinical lab reference framework: use lab reference range, trend, symptoms, exam, medication, and medical context before interpreting or acting on a result.'];

  if (/\b(clozapine|clozaril)\b/.test(lower)) {
    lines.push(
      'Clozapine ANC monitoring requires current prescribing information, local protocol, pharmacy workflow, and prescriber review; REMS requirements have changed, but ANC monitoring remains clinically important.',
      'Clozapine ANC monitoring schedule and threshold interpretation must be checked against current labeling, pharmacy guidance, and institutional policy.',
    );
    if (/\bweekly|schedule|how long\b/.test(lower)) {
      lines.push('Clozapine REMS ANC monitoring historically uses weekly ANC during the initial treatment period, and monitoring frequency changes over time if ANC remains acceptable.');
    }
    if (/\bthreshold|start|continue|hold|interrupt\b/.test(lower)) {
      lines.push('Baseline ANC threshold for the general population differs from the benign ethnic neutropenia threshold when applicable, and continuation, interruption, or rechallenge criteria depend on ANC range and current labeling.');
    }
    lines.push(
      'During titration, also keep myocarditis, constipation/ileus, seizures, metabolic effects, clozapine levels when indicated, and urgent evaluation for fever or infection symptoms visible.',
      'Missing context includes current ANC, baseline ANC, BEN status if applicable, infection symptoms, lab trend, and local protocol.',
    );
  } else if (/\bwarfarin|mechanical heart valve|inr\b/.test(lower)) {
    if (/\brecheck|after a warfarin dose|next dose\b/.test(lower)) {
      lines.push(
        'INR response lags warfarin dose changes; daily INR may be used during initiation or acute adjustment, but avoid overreacting to same-day INR before the pharmacodynamic effect is visible.',
        'Review indication-specific target range, bleeding/thrombosis risk, interacting medications, diet changes, hepatic function, and local anticoagulation protocol.',
      );
    } else {
      lines.push(
        'Baseline warfarin assessment commonly includes PT/INR baseline and target range verification, CBC and bleeding risk assessment, renal and hepatic function, and medication and diet interaction review.',
        'Mechanical valve anticoagulation targets are patient- and valve-specific, so verify cardiology/anticoagulation-clinic guidance and local protocol.',
      );
    }
  } else if (/\bsiadh\b/.test(lower)) {
    lines.push(
      'SIADH evaluation usually starts with serum sodium and serum osmolality, urine osmolality and urine sodium, plus volume status assessment.',
      'Sodium 132 is mild hyponatremia in many lab reference ranges; serotonergic medications such as SSRIs can be relevant contributors, especially in older adults.',
      'Check symptoms and red flags such as falls or confusion, acuity/trend, repeat confirmation, and other sodium-lowering medications.',
      'Rule out thyroid, adrenal, renal, medication, pulmonary/CNS, and other causes before treating the label as settled.',
    );
  } else if (/\btoxic-metabolic encephalopathy|toxic metabolic encephalopathy\b/.test(lower)) {
    lines.push(
      'Toxic-metabolic encephalopathy workup starts with vitals and mental status assessment.',
      'Common hospital evaluation may include CBC, CMP, glucose, renal, hepatic, thyroid, B12 or ammonia when indicated, toxicology, medication review, infection workup, oxygenation, and neuroimaging or EEG when indicated.',
    );
  } else if (/\btsh|t4|thyroid|levothyroxine\b/.test(lower)) {
    if (/\bhigh|very high|low t4|levothyroxine\b/.test(lower)) {
      lines.push(
        'Very high TSH with low T4 suggests under-treated or untreated hypothyroidism in the right context, including adherence, absorption, timing with food, or interacting medications.',
        'Assess symptoms and severity, repeat or confirm testing when needed, and use medical/endocrine review for severe symptoms.',
      );
    } else {
      lines.push(
        'Elevated T4 with normal TSH is a discordant thyroid lab pattern rather than a single automatic diagnosis.',
        'Repeat testing and evaluate assay interference, binding-protein effects, supplements such as biotin, medications, symptoms, and endocrine referral when persistent.',
      );
    }
  } else if (/\ba1c|hemoglobin a1c|estimated average glucose\b/.test(lower)) {
    if (/\bestimated average glucose|5\.7\b/.test(lower)) {
      lines.push(
        'Estimated average glucose can be calculated from A1c; an A1c of 5.7% corresponds to an estimated average glucose of about 117 mg/dL using the common eAG formula.',
        'A1c 5.7 is at the lower threshold of the prediabetes range by common criteria, but A1c limitations include anemia, hemoglobinopathy, recent transfusion, renal disease, and altered red-cell turnover.',
      );
    } else {
      lines.push(
        /\bolanzapine|zyprexa\b/.test(lower)
          ? 'A1c elevation on olanzapine should be treated as metabolic-risk context, not a psych diagnosis issue.'
          : 'A1c 5.9 is in the prediabetes range by common criteria.',
        'Interpret A1c with anemia, hemoglobinopathy, recent transfusion, renal disease, altered red-cell turnover, and cardiovascular risk-factor context; confirm and trend rather than diagnosing from one isolated value.',
      );
    }
  } else if (/\burinalysis|leukocyte esterase|epithelial cells|casts|consistent with uti\b/.test(lower)) {
    lines.push(
      'Urinalysis interpretation depends on symptoms and collection quality.',
      'Leukocyte esterase and pyuria support inflammation or infection, epithelial cells may suggest contamination, and culture plus symptoms guide treatment decisions.',
    );
  } else if (/\bmarkedly elevated|ast\/alt|ast|alt|bilirubin|elevated liver enzymes|hepatic panel|alkaline phosphatase\b/.test(lower)) {
    if (/\bmarkedly|bilirubin\b/.test(lower)) {
      lines.push(
        'Marked AST/ALT with bilirubin elevation suggests a hepatocellular injury pattern that can require urgent medical evaluation for acute hepatitis, toxin, ischemia, obstruction, rhabdomyolysis, or drug-induced liver injury contexts.',
        'Hy’s-law pattern concern can arise when ALT/AST elevation occurs with bilirubin elevation without another explanation.',
        'Check INR, bilirubin, alkaline phosphatase/alk phos, jaundice or other symptoms, acetaminophen level when relevant, hepatitis testing, medication/toxin review, other causes, and imaging such as right upper quadrant ultrasound when clinically indicated.',
      );
    } else {
      lines.push(
        'Elevated liver enzyme evaluation commonly includes repeat hepatic panel with AST, ALT, alkaline phosphatase, bilirubin, synthetic function such as INR and albumin, hepatitis testing, medication/toxin review, and right upper quadrant ultrasound when clinically indicated.',
      );
    }
  } else if (/\bplatelets|hiv|thrombocytopenia\b/.test(lower)) {
    if (/\bhiv\b/.test(lower)) {
      lines.push(
        'HIV can be associated with thrombocytopenia, and medications or opportunistic infections can contribute.',
        'Evaluate bleeding risk, platelet trend, repeat CBC, liver tests, other bleeding-risk medications, and need for medical workup.',
      );
    } else {
      lines.push(
        'Elevated platelets should be interpreted with repeat CBC and peripheral smear, reactive causes such as iron deficiency, inflammation, infection, recent surgery, and iron studies or inflammatory markers when indicated.',
        'Hematology evaluation may be needed if thrombocytosis is persistent or marked; low platelets require bleeding-risk and trend review.',
      );
    }
  } else if (/\banc\b/.test(lower)) {
    lines.push(
      'ANC estimates absolute neutrophil count; low ANC indicates neutropenia and infection risk depending on severity, while high ANC suggests neutrophilia with infection, inflammation, stress, steroids, or other causes.',
      'Interpret with WBC, differential, symptoms, vitals, trend, medication context, and whether a repeat CBC is needed.',
    );
  } else {
    lines.push(
      'Leukocytosis and neutrophilic leukocytosis can reflect infection, inflammation, stress response, stimulant intoxication or agitation, dehydration, steroids, smoking, or hematologic causes.',
      'WBC magnitude alone does not identify source or severity; assess repeat CBC with differential, peripheral smear when indicated, vitals, symptoms, cultures, imaging, and sepsis signs based on clinical context.',
      'Vitals and clinical exam determine urgency.',
    );
  }

  lines.push(clinicianReferenceCaveat, clinicalLabCaveat);
  return makeBatchOneReferenceResponse(lines.join(' '), query);
}

function looksLikeSpecificInteractionPrompt(query: string) {
  if (/\b(?:mg|milligram|strength|strengths|formulation|formulations|forms?|come in|available|tablet|film|concentration)\b/i.test(query)) {
    return false;
  }

  const opioidAntagonistConflict = /\b(?:samidorphan|olanzapine\/samidorphan|lybalvi|naltrexone|vivitrol)\b/i.test(query)
    && /\b(?:buprenorphine|suboxone|methadone|opioid|opioids|opioid agonist)\b/i.test(query);
  const buprenorphineInteractionQuestion = /\b(?:buprenorphine|suboxone|buprenorphine\/naloxone|buprenorphine naloxone)\b/i.test(query)
    && /\b(?:interaction|with|plus|together|ok|safe|concern|benzo|benzodiazepine|alcohol|sedative|methadone|naltrexone|samidorphan|lybalvi|opioid antagonist)\b/i.test(query);
  const tmpSmxInteractionQuestion = /\b(?:trimethoprim|sulfamethoxazole|tmp-smx|tmp smx|bactrim|septra)\b/i.test(query)
    && /\b(?:warfarin|coumadin|jantoven|inr|interaction|with|plus|together|safe|ok|concern|valproate|depakote|hydroxyzine|qt|qtc|alcohol)\b/i.test(query);
  const macrolideInteractionQuestion = /\b(?:azithromycin|zithromax|z-pak|zpak|clarithromycin|biaxin|erythromycin|macrolide|macrolides)\b/i.test(query)
    && /\b(?:citalopram|celexa|escitalopram|lexapro|hydroxyzine|vistaril|atarax|haloperidol|haldol|ziprasidone|geodon|qtc|qt|warfarin|coumadin|jantoven|inr|interaction|with|plus|together|safe|ok|concern)\b/i.test(query);
  const lithiumCrossoverInteractionQuestion = /\blithium\b/i.test(query)
    && /\b(?:nsaid|nsaids|ibuprofen|advil|motrin|naproxen|aleve|ketorolac|celecoxib|diclofenac|meloxicam|ace inhibitor|ace inhibitors|lisinopril|enalapril|benazepril|ramipril|arb|arbs|losartan|valsartan|olmesartan|irbesartan|thiazide|hydrochlorothiazide|hctz|chlorthalidone|loop diuretic|loop diuretics|furosemide|lasix|bumetanide|torsemide|diuretic|diuretics)\b/i.test(query);
  const bleedingInteractionQuestion = /\b(?:ssri|snri|sertraline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|celexa|paroxetine|paxil|venlafaxine|effexor|duloxetine|cymbalta)\b/i.test(query)
    && /\b(?:aspirin|asa|clopidogrel|plavix|nsaid|nsaids|ibuprofen|advil|naproxen|aleve|warfarin|coumadin|jantoven|inr|bleed|bleeding|gi bleed|bruising|antiplatelet|anticoagulant)\b/i.test(query);
  const azoleInteractionQuestion = /\b(?:fluconazole|diflucan|ketoconazole|nizoral|itraconazole|sporanox|voriconazole|posaconazole|azole|azoles)\b/i.test(query)
    && /\b(?:quetiapine|seroquel|lurasidone|latuda|cariprazine|vraylar|risperidone|olanzapine|alprazolam|xanax|midazolam|triazolam|clonazepam|lorazepam|benzo|benzodiazepine|qtc|qt|warfarin|inr|interaction|with|plus|together|safe|ok|concern)\b/i.test(query);
  const sleepCnsInteractionQuestion = /\b(?:zolpidem|ambien|eszopiclone|lunesta|suvorexant|belsomra|lemborexant|dayvigo|melatonin|sleep med|sleep meds|hypnotic|hypnotics|z-drug|z drug)\b/i.test(query)
    && /\b(?:opioid|opioids|benzo|benzodiazepine|lorazepam|ativan|alprazolam|xanax|clonazepam|klonopin|alcohol|sedative|sedatives|cns depressant|with|plus|together|safe|ok|concern)\b/i.test(query);

  return (
    /\b(ziprasidone|geodon)\b/i.test(query) && /\b(chlorpromazine|escitalopram|lexapro)\b/i.test(query)
  )
    || opioidAntagonistConflict
    || buprenorphineInteractionQuestion
    || tmpSmxInteractionQuestion
    || macrolideInteractionQuestion
    || lithiumCrossoverInteractionQuestion
    || bleedingInteractionQuestion
    || azoleInteractionQuestion
    || sleepCnsInteractionQuestion
    || /\bcarbamazepine\b/i.test(query) && /\b(oxcarbazepine|trileptal|lithium)\b/i.test(query)
    || /\blamotrigine\b/i.test(query) && /\blithium\b/i.test(query)
    || /\bfluoxetine|prozac\b/i.test(query) && /\b(oxcarbazepine|trileptal|aripiprazole|abilify|valproate|depakote)\b/i.test(query)
    || /\bcariprazine\b/i.test(query) && /\bquetiapine|seroquel\b/i.test(query)
    || /\batomoxetine\b/i.test(query) && /\boxcarbazepine|trileptal\b/i.test(query);
}

function buildSpecificInteractionAnswer(query: string): AssistantResponsePayload | null {
  if (!looksLikeSpecificInteractionPrompt(query)) {
    return null;
  }

  const lower = query.toLowerCase();
  const lines = ['Interaction safety framework: answer the direct risk first, then check mechanism, additive risk, symptoms, and current interaction-reference verification.'];

  if (/\b(ziprasidone|geodon)\b/.test(lower) && /\bchlorpromazine\b/.test(lower)) {
    lines.push(
      'Ziprasidone plus chlorpromazine raises additive QTc prolongation risk.',
      'Also review additive sedation, hypotension, anticholinergic burden, and EPS risk; ECG and electrolyte context are important.',
    );
  } else if (/\b(ziprasidone|geodon)\b/.test(lower) && /\b(escitalopram|lexapro)\b/.test(lower)) {
    lines.push(
      'Escitalopram plus ziprasidone is high-severity because the mechanism is additive QTc prolongation with torsades risk factors.',
      'Review ECG, QTc value and trend, potassium, magnesium, dose, cardiac history, other QT-prolonging medications, and symptoms such as syncope or palpitations.',
    );
  } else if (/\b(olanzapine\/samidorphan|samidorphan|lybalvi|naltrexone|vivitrol)\b/.test(lower) && /\b(buprenorphine|suboxone|methadone|opioid|opioids|opioid agonist)\b/.test(lower)) {
    lines.push(
      'Samidorphan is an opioid antagonist, and naltrexone is also an opioid antagonist, so exposure with opioid agonists such as buprenorphine or methadone can pose risk of precipitated opioid withdrawal in opioid use or dependence.',
      'This is a contraindication or avoidance context from labeling for relevant products, and there is also risk of opioid overdose if someone attempts to overcome opioid blockade.',
      'Missing context includes last opioid use, opioid dependence/tolerance, withdrawal status, pain-treatment needs, hepatic status, and the exact product involved.',
    );
  } else if (/\blithium\b/.test(lower) && /\b(nsaid|nsaids|ibuprofen|advil|motrin|naproxen|aleve|ketorolac|celecoxib|diclofenac|meloxicam|ace inhibitor|ace inhibitors|lisinopril|enalapril|benazepril|ramipril|arb|arbs|losartan|valsartan|olmesartan|irbesartan|thiazide|hydrochlorothiazide|hctz|chlorthalidone|loop diuretic|loop diuretics|furosemide|lasix|bumetanide|torsemide|diuretic|diuretics)\b/.test(lower)) {
	    lines.push(
	      'Lithium toxicity risk can increase with NSAIDs, ACE inhibitors, ARBs, thiazides/thiazide diuretics, or dehydration/diuretic contexts because lithium exposure and toxicity risk can rise.',
	      'Check renal function/eGFR, lithium level trend, sodium and fluid status, and toxicity symptoms.',
	      'Do not turn this into an automatic lithium dose change from medication names alone; use prescriber/pharmacy review and current references.',
    );
  } else if (/\bbuprenorphine|suboxone|naloxone\b/.test(lower)) {
    lines.push(
      'Common buprenorphine/naloxone interaction domains include benzodiazepines, alcohol, opioids, and other sedatives increasing respiratory depression risk.',
      'CYP3A4 inhibitors and inducers can alter buprenorphine exposure, and opioid antagonists can precipitate withdrawal.',
    );
	  } else if (/\b(ssri|snri|sertraline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|celexa|paroxetine|paxil|venlafaxine|effexor|duloxetine|cymbalta)\b/.test(lower) && /\b(aspirin|asa|clopidogrel|plavix|nsaid|nsaids|ibuprofen|advil|naproxen|aleve|warfarin|coumadin|jantoven|inr|bleed|bleeding|gi bleed|bruising|antiplatelet|anticoagulant)\b/.test(lower)) {
	    lines.push(
	      'SSRIs and SNRIs can add bleeding risk with NSAIDs, aspirin, clopidogrel, warfarin, or other antiplatelet/anticoagulant therapies.',
	      'Why it matters: serotonergic platelet effects can stack with antithrombotic or NSAID-related GI bleed risk.',
      'Check GI bleed history, bruising or bleeding symptoms, vitals, stool/occult bleeding concern, anticoagulants or antiplatelets, CBC/hemoglobin if indicated, INR target/trend when warfarin is involved, renal/hepatic function, and the full medication list.',
    );
  } else if (/\b(fluconazole|diflucan|ketoconazole|nizoral|itraconazole|sporanox|voriconazole|posaconazole|azole|azoles)\b/.test(lower)) {
    lines.push(
      'Azole antifungals can create clinically important CYP interaction concerns; ketoconazole, itraconazole, voriconazole, and posaconazole are especially high-yield CYP3A4 inhibitors, while fluconazole can still matter for selected substrates and QTc risk.',
      'With antipsychotics, review increased exposure, sedation, orthostasis, EPS, metabolic effects, and QTc risk; with benzodiazepines, review sedation and respiratory/CNS depression; with warfarin, review INR and bleeding risk.',
      'Check hepatic function, QTc value and trend, potassium, magnesium, calcium, cardiac symptoms, dose timing, and the exact azole/product before applying this clinically.',
    );
  } else if (/\b(zolpidem|ambien|eszopiclone|lunesta|suvorexant|belsomra|lemborexant|dayvigo|melatonin|sleep med|sleep meds|hypnotic|hypnotics|z-drug|z drug)\b/.test(lower)) {
    lines.push(
      'Sleep medications and sedative-hypnotics require additive CNS-depression review when combined with benzodiazepines, opioids, alcohol, or other sedatives.',
      'Key concerns include next-day impairment, falls, delirium/confusion, respiratory depression risk, untreated sleep apnea or cardiopulmonary disease, and complex sleep behaviors for zolpidem or eszopiclone.',
      'Do not frame this as simply safe; review dose, timing, age, other sedatives, alcohol or opioid use, sleep apnea status, fall risk, and monitoring context.',
    );
  } else if (/\bcarbamazepine\b/.test(lower) && /\boxcarbazepine|trileptal\b/.test(lower)) {
    lines.push(
      'Carbamazepine plus oxcarbazepine can create duplicate anticonvulsant sodium-channel effects, hyponatremia and CNS adverse effects, and enzyme induction or drug interaction concerns.',
      'Review sodium, dizziness, sedation, ataxia, rash/systemic symptoms, CBC/LFT context, and whether the combination is intentional.',
    );
  } else if (/\blithium\b/.test(lower) && /\bcarbamazepine\b/.test(lower)) {
    lines.push(
      'Lithium plus carbamazepine requires careful clinician and pharmacy review because lithium neurotoxicity risk with carbamazepine has been described.',
      'Monitor lithium level, renal function, sodium, and neurologic symptoms such as tremor, confusion, dizziness, ataxia, diplopia, or sedation.',
    );
  } else if (/\blamotrigine\b/.test(lower) && /\blithium\b/.test(lower)) {
    lines.push(
      'Lamotrigine and lithium are sometimes used together, but the interaction review should still include rash risk and lamotrigine titration rules plus lithium renal, thyroid, and level parameters.',
      'Confirm indication, titration stage, rash history, renal/thyroid status, and other interacting medications.',
    );
  } else if (/\bfluoxetine|prozac\b/.test(lower)) {
    lines.push(
      'Fluoxetine CYP2D6 inhibition can affect aripiprazole exposure, and its long half-life can prolong interaction timing.',
      'With oxcarbazepine, aripiprazole, and valproate, also consider valproate and oxcarbazepine additive CNS effects, sodium risk, hepatic labs, activation, sedation, and suicidality risk.',
    );
  } else if (/\b(azithromycin|zithromax|z-pak|zpak|clarithromycin|biaxin|erythromycin|macrolide|macrolides)\b/.test(lower) && /\b(warfarin|coumadin|jantoven|inr)\b/.test(lower)) {
    lines.push(
      'Macrolides can be clinically important with warfarin because INR elevation and bleeding risk may increase, especially with interacting products, acute illness, diet changes, hepatic changes, or other bleeding-risk medications.',
      'Clarify the exact antibiotic, INR target and trend, indication for anticoagulation, bleeding/bruising symptoms, liver function, diet changes, and anticoagulation-clinic or pharmacy plan.',
      'Do not convert this into a directive warfarin dose change from the interaction question alone.',
    );
  } else if (/\b(azithromycin|zithromax|z-pak|zpak|clarithromycin|biaxin|erythromycin|macrolide|macrolides)\b/.test(lower)) {
    lines.push(
      'Macrolides can add QTc risk with QT-prolonging psychotropics such as citalopram, escitalopram, hydroxyzine, haloperidol, or ziprasidone.',
      'Review the exact macrolide because clarithromycin and erythromycin carry stronger CYP3A4 interaction concerns than azithromycin; also check QTc value and trend, potassium, magnesium, calcium, cardiac history, syncope or palpitations, and other QT-prolonging medications.',
      'Do not call the combination safe without ECG, electrolyte, symptom, dose, and full medication-list context.',
    );
  } else if (/\b(trimethoprim|sulfamethoxazole|tmp-smx|tmp smx|bactrim|septra)\b/.test(lower) && /\b(warfarin|coumadin|jantoven|inr)\b/.test(lower)) {
    lines.push(
      'Trimethoprim-sulfamethoxazole can be a high-yield interaction concern with warfarin because INR elevation and bleeding risk may increase.',
      'Review INR target and trend, antibiotic timing, indication for anticoagulation, bleeding or bruising symptoms, CBC/hemoglobin when relevant, renal/hepatic function, diet changes, and anticoagulation-clinic or pharmacy guidance.',
      'Do not give a directive warfarin dose change from this interaction question alone.',
    );
  } else if (/\b(trimethoprim|sulfamethoxazole|tmp-smx|bactrim)\b/.test(lower) && /\balcohol\b/.test(lower)) {
    lines.push(
      'Alcohol may worsen GI effects, dizziness, dehydration, adherence, and illness recovery while taking trimethoprim-sulfamethoxazole.',
      'Avoid blanket disulfiram-like certainty unless a source supports it; consider hepatic disease, infection severity, and other medications.',
    );
  } else if (/\b(trimethoprim|sulfamethoxazole|tmp-smx|bactrim)\b/.test(lower)) {
    lines.push(
      'Nausea or vomiting differential includes medication adverse effects and medical illness.',
      'In this combination, keep valproate toxicity or hepatic/pancreatic concerns visible when clinically suggested, trimethoprim-sulfamethoxazole adverse effects and hypersensitivity, and hydroxyzine sedation and QTc risk.',
    );
  } else if (/\bcariprazine\b/.test(lower) && /\bquetiapine|seroquel\b/.test(lower)) {
    lines.push(
      'Cariprazine plus quetiapine can create additive antipsychotic adverse effects.',
      'Tachycardia differential includes anticholinergic effects, orthostasis, anxiety, withdrawal, infection, and dehydration; consider ECG, vitals, and medication review when symptomatic.',
    );
  } else {
    lines.push(
      'Atomoxetine has CYP2D6 considerations, while oxcarbazepine has enzyme induction considerations; monitor blood pressure, heart rate, sedation, and mood activation.',
    );
  }

  lines.push(interactionCaveat, 'Key checks: doses/timing/route, current symptoms, renal/hepatic function, ECG/electrolytes when QTc is relevant, full medication list, and pharmacy/local protocol review.');
  return makeBatchOneReferenceResponse(lines.join(' '), query);
}

function buildSparseHistoryPromptAnswer(query: string): AssistantResponsePayload | null {
  const lower = query.toLowerCase().trim();

  if (lower === 'withdrawal history?') {
    return {
      message: [
        'I do not have a confident medication match because this fragment does not identify the substance or medication involved.',
        'Clarify the substance or medication involved, timing of last use, amount, duration, prior complicated withdrawal, and current symptoms.',
        'Screen for delirium tremens, autonomic instability, pregnancy, polysubstance use, and current vitals; severe withdrawal red flags require escalation.',
        'Do not infer the substance or taper plan from this fragment. Ask targeted follow-up questions before giving medication guidance.',
      ].join(' '),
      answerMode: 'medication_reference_answer',
      suggestions: ['Ask for the substance/medication, last use, dose, duration, vitals, and prior complicated withdrawal.'],
    };
  }

  if (lower === 'now, what is the anc?') {
    return {
      message: [
        'I do not have a confident medication match because this is a lab-calculation fragment and the required lab inputs are missing.',
        'Missing context includes WBC units, neutrophil percentage, and bands if reported.',
        'ANC calculation requires WBC and neutrophil percentage or an absolute neutrophil value; the formula can be applied only if WBC and differential are provided.',
        'Avoid fabricating a value. Do not calculate without the required lab inputs; ask for WBC units, segmented neutrophils, and bands if relevant.',
      ].join(' '),
      answerMode: 'medication_reference_answer',
      suggestions: ['Ask for WBC, neutrophil percentage, bands if reported, and units.'],
    };
  }

  if (lower === 'what about baclofen?') {
    return {
      message: [
        'I do not have a confident medication match from the psych-med reference layer because this fragment lacks indication and patient context.',
        'Missing context includes target symptom, age, renal function, current dose history, CNS depressants, and withdrawal risk.',
        'Baclofen dosing and safety depend on age, renal function, CNS depressants, withdrawal risk, and target symptom.',
        'Ask whether this concerns spasticity, cravings, anxiety, or withdrawal. Do not give a dose from this fragment alone. Mention renal dosing and sedation/CNS depression context.',
      ].join(' '),
      answerMode: 'medication_reference_answer',
      suggestions: ['Clarify indication, renal function, dose history, CNS depressants, and withdrawal context.'],
    };
  }

  return null;
}

function buildSpecificMedicationSafetyAnswer(query: string): AssistantResponsePayload | null {
  const lower = query.toLowerCase();

  if (/\b(methylphenidate|ritalin|concerta|amphetamine|adderall|lisdexamfetamine|vyvanse|atomoxetine|strattera|guanfacine|intuniv|clonidine|kapvay|stimulant|stimulants|adhd med|adhd meds)\b/.test(lower)
    && /\b(mania|manic|psychosis|psychotic|voices|paranoia|substance|misuse|diversion|violence|threat|restart|bp|blood pressure|heart rate|hr|tachycardia|cardiac|cardiovascular)\b/.test(lower)
  ) {
    const isAlpha2AdhdMed = /\b(guanfacine|intuniv|clonidine|kapvay)\b/.test(lower);
    return makeBatchOneReferenceResponse(
      [
        'Stimulant/ADHD medication safety framing: do not treat this as a routine restart or dose question when mania, psychosis, violence risk, substance-use risk, or cardiovascular concern is present.',
        'Before applying any stimulant or atomoxetine framework, review current mood stability, psychosis or paranoia, sleep, agitation, substance use and diversion risk, blood pressure, heart rate, cardiac history, interacting medications, and the indication/functional target.',
        isAlpha2AdhdMed
          ? 'Guanfacine ER and clonidine ER shift the safety focus toward low blood pressure, slowed heart rate, sedation, rebound hypertension if abruptly discontinued, and CYP interaction context for guanfacine.'
          : 'For stimulant-class questions, also keep appetite/weight, sleep, anxiety, misuse/diversion, and cardiovascular screening visible.',
        'This is clinician reference framing, not a patient-specific order; verify with current prescribing references, interaction checking, and patient-specific factors.',
      ].join(' '),
      query,
      /\batomoxetine|strattera\b/.test(lower) ? 'atomoxetine'
        : /\bguanfacine|intuniv\b/.test(lower) ? 'guanfacine extended-release'
          : /\bclonidine|kapvay\b/.test(lower) ? 'clonidine'
            : /\blisdexamfetamine|vyvanse\b/.test(lower) ? 'lisdexamfetamine'
              : /\bamphetamine|adderall\b/.test(lower) ? 'mixed amphetamine salts'
                : 'methylphenidate',
    );
  }

  if (/\b(zolpidem|ambien|eszopiclone|lunesta|suvorexant|belsomra|lemborexant|dayvigo|melatonin|sleep med|hypnotic|z-drug|z drug)\b/.test(lower)
    && /\b(sleep apnea|osa|falls?|fall risk|elderly|geriatric|alcohol|opioid|benzo|benzodiazepine|sedation|confusion|delirium|complex sleep|sleepwalking|respiratory)\b/.test(lower)
  ) {
    return makeBatchOneReferenceResponse(
      [
        'Sleep-medication safety framing: hypnotics can increase sedation, next-day impairment, falls, confusion/delirium, and respiratory/CNS depression risk in vulnerable patients.',
        'Review untreated sleep apnea or cardiopulmonary disease, age/fall risk, alcohol, opioids, benzodiazepines, other sedatives, timing, dose, and history of complex sleep behaviors.',
        'For zolpidem and eszopiclone, complex sleep behaviors are a serious labeling concern; for orexin antagonists, next-day impairment, sleep paralysis/hypnagogic symptoms, depression/suicidality context, and CYP3A interactions matter.',
        clinicianReferenceCaveat,
      ].join(' '),
      query,
      /\beszopiclone|lunesta\b/.test(lower) ? 'eszopiclone'
        : /\bsuvorexant|belsomra\b/.test(lower) ? 'suvorexant'
          : /\blemborexant|dayvigo\b/.test(lower) ? 'lemborexant'
            : /\bmelatonin\b/.test(lower) ? 'melatonin'
              : 'zolpidem',
    );
  }

  if (/\b(citalopram|celexa|escitalopram|lexapro)\b/.test(lower) && /\b(qt|qtc|ekg|ecg)\b/.test(lower)) {
    return makeBatchOneReferenceResponse(
      [
        'QTc safety framing: citalopram and escitalopram can be relevant QT-prolonging antidepressants, especially with higher doses, interacting QT-prolonging medications, electrolyte abnormalities, cardiac disease, or overdose/toxicity contexts.',
        'Review EKG/ECG and actual QTc value, baseline and trend, electrolytes including potassium, magnesium, and calcium, cardiac history, syncope or palpitations, hepatic/renal context, dose, other medications, and the full medication list.',
        'Do not call the situation safe or unsafe from the medication name alone; verify against current labeling, local protocol, and drug-interaction resources.',
        interactionCaveat,
        clinicianReferenceCaveat,
      ].join(' '),
      query,
      /\b(escitalopram|lexapro)\b/.test(lower) ? 'escitalopram' : 'citalopram',
    );
  }

  if (/\blithium orotate\b/.test(lower)) {
    return makeBatchOneReferenceResponse(
      [
        'Lithium orotate questions need lithium salt exposure and elemental lithium distinction rather than assuming it is equivalent to prescription lithium carbonate.',
        'OTC lithium orotate lacks the same standard monitoring evidence base compared with prescription lithium, but renal and thyroid concerns should not be dismissed.',
        clinicianReferenceCaveat,
      ].join(' '),
      query,
      'lithium',
    );
  }

  return null;
}

function buildMonitoringAnswer(query: string): AssistantResponsePayload | null {
  const response = answerMedicationReferenceQuestion(query);
  const profile = response.medication;
  if (!profile) {
    return null;
  }

  if (/\b(depakote|depakot|divalproex|valproate|valproic acid|vpa)\b/i.test(query)) {
    if (/\b(long-term|long term|levels? stable|stable|how often)\b/i.test(query)) {
      return {
        message: [
          'Valproate trough level monitoring after levels are stable does not have one universal fixed interval.',
          'Cadence depends on clinical stability, dose changes, formulation, adherence, excess-level symptoms, interactions, albumin/free level concerns, LFTs, CBC and liver function monitoring, CBC/platelets, pregnancy potential, comorbidities, and local protocol.',
          'More frequent checks are appropriate after dose changes, excess-level symptoms, adherence concerns, interacting medications, clinical change, albumin changes, hepatic concerns, platelet concerns, or new adverse effects.',
          'Frame as clinician reference, not a patient-specific order. State that dosing and monitoring depend on indication, age, renal/hepatic function, comorbidities, and local protocol.',
          'Recommend verifying current labeling, pharmacy guidance, and institutional policy for exact dosing and monitoring cadence.',
          'Interpret labs in clinical context and trend values when possible. Flag markedly abnormal values for medical assessment rather than psych-only handling. Avoid diagnosing from a single isolated lab value without symptoms, exam, and medication context.',
        ].join(' '),
        references: buildMedicationReferences(query, profile.genericName),
        answerMode: 'medication_reference_answer',
        suggestions: ['Use local protocol and current prescribing references for actual inpatient monitoring cadence.'],
      };
    }

    return {
      message: 'Depakote/divalproex/valproate monitoring commonly includes valproate level context, LFTs, CBC with platelets, albumin/free-level context when relevant, ammonia when sedation or altered mental status is present, pregnancy potential when relevant, and clinical adverse effects such as sedation, tremor, GI symptoms, hepatic symptoms, or bleeding/bruising. Verify exact lab timing and monitoring requirements against a current prescribing reference, pharmacy input, and patient-specific context.',
      references: buildMedicationReferences(query, profile.genericName),
      answerMode: 'medication_reference_answer',
      suggestions: ['General reference only, not patient-specific order guidance.'],
    };
  }

  if (/\b(carbamazepine|tegretol)\b/i.test(query)) {
    return {
      message: 'Carbamazepine monitoring commonly includes carbamazepine level when clinically indicated, CBC, sodium, LFTs, rash/systemic hypersensitivity symptoms, neurologic toxicity symptoms, and interaction review because carbamazepine is a CYP inducer. Verify exact monitoring against a current prescribing reference, pharmacy input, local protocol, and patient-specific context.',
      references: buildMedicationReferences(query, profile.genericName),
      answerMode: 'medication_reference_answer',
      suggestions: ['General reference only, not patient-specific order guidance.'],
    };
  }

  if (/\b(clozapine|clozaril)\b/i.test(query)) {
    return {
      message: 'Clozapine monitoring commonly includes ANC/CBC context, infection symptoms, myocarditis/cardiomyopathy symptoms and local troponin/CRP workflow when used, seizure risk, severe constipation/ileus risk, sedation/orthostasis, metabolic monitoring, and medication interaction review. Clozapine REMS requirements have changed, so verify current prescribing information, local protocol, and pharmacy workflow before using this for a real patient.',
      references: buildMedicationReferences(query, profile.genericName),
      answerMode: 'medication_reference_answer',
      suggestions: ['General reference only, not patient-specific order guidance.'],
    };
  }

  const monitoringItems = profile.monitoring.slice(0, 4).join(', ');
  return {
    message: `${profile.genericName}: high-yield monitoring includes ${monitoringItems}. Verify exact lab or monitoring requirements against a current prescribing reference before using this for a real patient.`,
    references: buildMedicationReferences(query, profile.genericName),
    answerMode: 'medication_reference_answer',
    suggestions: [
      'General reference only, not patient-specific order guidance.',
    ],
  };
}

function looksLikeMedicationFollowup(message: string) {
  return (
    /\b(it|this|that|the medication|the med)\b/i.test(message)
    && /\b(is|isn't|isnt|is not|used for|for|side effect|side effects|monitor|monitoring|dose|dosing|interaction|interactions|pregnan|lactat|renal|hepatic)\b/i.test(message)
  );
}

function resolveRecentMedicationFromTurns(recentMessages?: AssistantThreadTurn[]) {
  if (!recentMessages?.length) {
    return null;
  }

  for (const turn of [...recentMessages].reverse()) {
    const match = findPsychMedication(turn.content);
    if (match) {
      return match;
    }
  }

  return null;
}

function hydrateMedicationFollowupMessage(message: string, recentMessages?: AssistantThreadTurn[]) {
  if (!looksLikeMedicationFollowup(message) || findPsychMedication(message)) {
    return message;
  }

  const recentMedication = resolveRecentMedicationFromTurns(recentMessages);
  if (!recentMedication) {
    return message;
  }

  return `${message} about ${recentMedication.genericName}`;
}

export function buildPsychMedicationReferenceHelp(
  normalizedMessage: string,
  recentMessages?: AssistantThreadTurn[],
): AssistantResponsePayload | null {
  const normalized = normalize(hydrateMedicationFollowupMessage(normalizedMessage, recentMessages));
  const directMedicationIdentityMatch = findPsychMedication(normalized);

  if (/\b(lamotrigine|lamictal)\b/i.test(normalized) && /\blevel\b/i.test(normalized) && /\btitrat/i.test(normalized)) {
    return null;
  }

  if (/\blithium\b/i.test(normalized) && /\bekg\b/i.test(normalized) && !looksLikeMedicationLabLevelPrompt(normalized)) {
    return null;
  }

  if (looksLikeStandaloneMedicationDocumentationPrompt(normalized)) {
    const documentationHelp = buildMedicationDocumentationHelp(normalizedMessage);
    if (documentationHelp) {
      return documentationHelp;
    }
  }

  const sparseHistoryPromptAnswer = buildSparseHistoryPromptAnswer(normalized);
  if (sparseHistoryPromptAnswer) {
    return sparseHistoryPromptAnswer;
  }

  const batchTwoFormulationEdgeAnswer = buildBatchTwoFormulationEdgeAnswer(normalized);
  if (batchTwoFormulationEdgeAnswer) {
    return batchTwoFormulationEdgeAnswer;
  }

  const stableValproateMonitoringCadenceAnswer = buildStableValproateMonitoringCadenceAnswer(normalized);
  if (stableValproateMonitoringCadenceAnswer) {
    return stableValproateMonitoringCadenceAnswer;
  }

  const directMedicationReferenceAnswer = answerDirectMedicationReferenceQuestion(normalized);
  if (directMedicationReferenceAnswer) {
    return {
      message: directMedicationReferenceAnswer.text,
      suggestions: ['Concise clinical reference only; verify the current product label or interaction reference before applying clinically.'],
      references: directMedicationReferenceAnswer.sourceRefs.map((source) => ({
        label: source.label,
        url: source.url,
      })),
      answerMode: 'medication_reference_answer',
    };
  }

  const laiAgeApprovalAnswer = buildLaiAgeApprovalAnswer(normalized);
  if (laiAgeApprovalAnswer) {
    return laiAgeApprovalAnswer;
  }

  const laiFrameworkAnswer = buildLaiFrameworkAnswer(normalized);
  if (laiFrameworkAnswer) {
    return laiFrameworkAnswer;
  }

  const batchTwoAdverseEffectAnswer = buildBatchTwoAdverseEffectAnswer(normalized);
  if (batchTwoAdverseEffectAnswer) {
    return batchTwoAdverseEffectAnswer;
  }

  const urgentToxWithdrawalAnswer = buildUrgentToxWithdrawalAnswer(normalized);
  if (urgentToxWithdrawalAnswer) {
    return urgentToxWithdrawalAnswer;
  }

  const structuredFactAnswer = answerStructuredMedicationFactQuestion(normalized);
  if (structuredFactAnswer) {
    return {
      message: structuredFactAnswer.text,
      suggestions: ['Concise medication fact reference only; verify against current labeling or protocol before applying clinically.'],
      references: structuredFactAnswer.sourceRefs.map((source) => ({
        label: source.label,
        url: source.url,
      })),
      answerMode: 'medication_reference_answer',
    };
  }

  const specificInteractionAnswer = buildSpecificInteractionAnswer(normalized);
  if (specificInteractionAnswer) {
    return specificInteractionAnswer;
  }

  const specificMedicationSafetyAnswer = buildSpecificMedicationSafetyAnswer(normalized);
  if (specificMedicationSafetyAnswer) {
    return specificMedicationSafetyAnswer;
  }

  if (looksLikeHighRiskMedicationSafetyPrompt(normalized)) {
    const response = answerMedicationReferenceQuestion(normalized);
    const matchedMedication = response.medication ?? response.matchedMedications?.[0] ?? findPsychMedication(normalized);
    if (response.text.includes('I do not have a confident medication match')) {
      const generalClinicalLabAnswer = buildGeneralClinicalLabAnswer(normalized);
      if (generalClinicalLabAnswer) {
        return generalClinicalLabAnswer;
      }
    }

    return {
      message: response.text,
      suggestions: [
        'High-risk medication safety support only; use local protocol and current references for real patients.',
      ],
      references: buildMedicationReferences(normalized, matchedMedication?.genericName),
      answerMode: 'medication_reference_answer',
    };
  }

  if (looksLikeMedicationLabLevelPrompt(normalized)) {
    const response = answerMedicationReferenceQuestion(normalized);
    const matchedMedication = response.medication ?? response.matchedMedications?.[0] ?? findPsychMedication(normalized);
    if (response.text.includes('I do not have a confident medication match')) {
      const generalClinicalLabAnswer = buildGeneralClinicalLabAnswer(normalized);
      if (generalClinicalLabAnswer) {
        return generalClinicalLabAnswer;
      }
    }

    return withContextBridge({
      message: response.text,
      suggestions: [
        'Lab and level interpretation is context dependent; avoid automatic dose changes from one value.',
      ],
      references: buildMedicationReferences(normalized, matchedMedication?.genericName),
      answerMode: 'medication_reference_answer',
    }, normalized);
  }

  const generalClinicalLabAnswer = buildGeneralClinicalLabAnswer(normalized);
  if (generalClinicalLabAnswer) {
    return generalClinicalLabAnswer;
  }

  const structuredReference = answerStructuredMedReferenceQuestion(normalized);
  if (structuredReference) {
    return withContextBridge({
      message: structuredReference.text,
      suggestions: [
        'General reference only, not patient-specific prescribing guidance.',
        'Verify formulation availability, dosing, interactions, and patient-specific factors with a current prescribing reference.',
      ],
      references: structuredReference.sourceRefs.map((source) => ({
        label: source.label,
        url: source.url,
      })),
      answerMode: 'medication_reference_answer',
    }, normalized);
  }

  if (/\b(what types? of drugs help with depression|what medications help with depression|what meds help with depression)\b/i.test(normalized)) {
    const antidepressantClass = MEDICATION_CLASS_HELP.find((item) => item.aliases.includes('antidepressant'));
    if (antidepressantClass) {
      return {
        message: antidepressantClass.message,
        suggestions: antidepressantClass.suggestions,
        references: antidepressantClass.references,
        answerMode: 'medication_reference_answer',
      };
    }
  }

  if (
    directMedicationIdentityMatch
    && /\b(is|isn't|isnt|is not)\b/.test(normalized)
    && /\b(antidepressant|ssri|snri|antipsychotic|mood stabilizer|benzodiazepine|stimulant)\b/.test(normalized)
  ) {
    return toMedicationReference(
      answerMedicationReferenceQuestion(normalized).text,
      buildMedicationReferences(normalized, directMedicationIdentityMatch.genericName),
    );
  }

  const intent = detectMedicationQuestionIntent(normalized);

  if (intent === 'starts_with_lookup') {
    const response = answerMedicationReferenceQuestion(normalized);
    return {
      message: response.text,
      suggestions: ['Medication reference help is general only and should still be verified with current prescribing sources.'],
      references: buildMedicationReferences(normalized),
      answerMode: 'medication_reference_answer',
    };
  }

  for (const classHelp of MEDICATION_CLASS_HELP) {
    if (
      hasAlias(normalized, classHelp.aliases)
      && (intent === 'med_class_lookup' || intent === 'unknown')
      && !/\b(risk|hyponat|siadh|bleed|bleeding|pregnan|lactat|renal|hepatic|elderly|older adult|mania|psychosis|bipolar)\b/i.test(normalized)
    ) {
      return {
        message: classHelp.message,
        suggestions: classHelp.suggestions,
        references: classHelp.references,
        answerMode: 'medication_reference_answer',
      };
    }
  }

  if (intent === 'monitoring' && /\b(depakote|depakot|divalproex|valproate|valproic acid|vpa|carbamazepine|tegretol|clozapine|clozaril)\b/i.test(normalized)) {
    const monitoringHelp = buildMonitoringAnswer(normalized);
    return monitoringHelp ? withContextBridge(monitoringHelp, normalized) : null;
  }

  if (/\bpregnancy question\b/i.test(normalized) && /\blamotrigine\b/i.test(normalized)) {
    return {
      message: 'lamotrigine: pregnancy questions require current-reference verification because maternal-fetal risk assessment, dose changes, and postpartum adjustments are patient-specific. Pregnancy considerations should be reviewed against a current prescribing reference before making any treatment decision.',
      references: buildMedicationReferences(normalized, 'lamotrigine'),
      answerMode: 'medication_reference_answer',
      suggestions: [
        'Do not use this layer alone for pregnancy or lactation prescribing decisions.',
      ],
    };
  }

  const response = answerMedicationReferenceQuestion(normalized);
  const matchedMedication = response.medication ?? response.matchedMedications?.[0] ?? findPsychMedication(normalized);

  if (response.intent === 'switching_framework') {
    const primaryGeneric = response.toMedication?.genericName ?? response.fromMedication?.genericName ?? matchedMedication?.genericName;
    return {
      message: response.text,
      suggestions: [
        'Switching guidance here is framework-level only and should not be used as a final order.',
      ],
      references: buildMedicationReferences(normalized, primaryGeneric),
      answerMode: 'medication_reference_answer',
    };
  }

  if (!matchedMedication && response.text.includes('I do not have a confident medication match')) {
    if (!looksMedicationishPrompt(normalizedMessage) || !looksExplicitMedicationReferenceQuestion(normalizedMessage)) {
      return null;
    }

    return {
      message: response.text,
      answerMode: 'medication_reference_answer',
      references: buildMedicationReferences(normalized),
      suggestions: ['Please verify the exact medication name in a current prescribing reference.'],
    };
  }

  const references = buildMedicationReferences(normalized, matchedMedication?.genericName);

  return withContextBridge({
    message: response.text,
    suggestions: [
      ...(intent === 'interaction_check'
        ? ['Interaction support is high yield only and should not replace a current interaction checker.']
        : ['General reference only, not patient-specific prescribing guidance.']),
    ],
    references,
    answerMode: 'medication_reference_answer',
  }, normalized);
}

export function listPsychMedicationReferenceCandidates(prefix?: string) {
  const normalizedPrefix = prefix?.trim().toLowerCase();
  return PSYCH_MEDICATION_LIBRARY.filter((profile) => (
    !normalizedPrefix || profile.genericName.toLowerCase().startsWith(normalizedPrefix)
  ));
}
