import {
  PSYCH_MEDICATION_LIBRARY,
  PSYCH_MEDICATION_LIBRARY_BY_ID,
  PSYCH_MEDICATION_LOOKUP_TERMS,
} from '@/lib/veranote/meds/psych-med-library';
import { PSYCH_MEDICATION_INTERACTION_RULES } from '@/lib/veranote/meds/psych-med-interaction-rules';
import {
  answerPsychMedicationSwitchQuestion,
  detectPsychMedicationSwitchingIntent,
} from '@/lib/veranote/meds/psych-med-switching';
import {
  getClinicalLabReference,
  interpretClinicalLabValue,
} from '@/lib/veranote/clinical-labs/interpret';
import type {
  PsychMedicationAnswer,
  PsychMedicationAnswerIntent,
  PsychMedicationInteractionMatch,
  PsychMedicationProfile,
} from '@/lib/veranote/meds/psych-med-types';

const NORMALIZED_ALIAS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bavailabe\b/g, 'available'],
  [/\bdepakot\b/g, 'depakote'],
  [/\btrazadone\b/g, 'trazodone'],
  [/\btrileptol\b/g, 'trileptal'],
  [/\bstarts w\b/g, 'starts with'],
  [/\bstarts with a d\b/g, 'starts with d'],
  [/\bstarts with an d\b/g, 'starts with d'],
  [/\bmed starts w\b/g, 'medication starts with'],
  [/\bwhat labs depakote\b/g, 'what labs for depakote'],
  [/\bwhat labs depakot\b/g, 'what labs for depakote'],
];

const CLASS_TERM_ALIASES: Record<string, string[]> = {
  'Antidepressant': ['antidepressant', 'antidepressants', 'ssri', 'snri'],
  'Antipsychotic': ['antipsychotic', 'antipsychotics', 'sga', 'fga'],
  'Anxiolytic / sedative': ['benzodiazepine', 'benzodiazepines', 'benzo', 'benzos', 'sedative'],
  'ADHD medication': ['stimulant', 'stimulants', 'adhd medication', 'adhd med'],
};

const LAB_LEVEL_CAVEAT = 'Do not make an automatic dose change from one lab value alone; verify timing/trend, symptoms, interacting medications, local protocol, and lab reference range.';
const URGENT_LAB_SAFETY_LEAD = 'This is not routine monitoring when a high-risk abnormality or concerning symptoms are present.';
const URGENT_LAB_SAFETY_CAVEAT = 'Do not make a directive medication or disposition decision here; use urgent prescriber/pharmacy/local protocol review and poison control or emergency pathways when toxicity, overdose, severe symptoms, or unstable labs are possible.';

function normalize(text: string) {
  let normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [pattern, replacement] of NORMALIZED_ALIAS_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = applyContextualClinicalShorthand(normalized);

  return normalized.replace(/\s+/g, ' ').trim();
}

function applyContextualClinicalShorthand(normalized: string) {
  let expanded = normalized;
  const hasNumber = /\b\d+(?:\.\d+)?\b/.test(expanded);
  const hasClinicalCue = /\b(level|lvl|lab|labs|drawn|trough|random|dose|after dose|therapeutic|toxic|toxicity|high|low|increase|inc|titrate|pending|renal|kidney|egfr|creatinine|cr|bun|dehydrat|weak|confused|sedated|sedation|somnolent|sleepy|dizzy|dizziness|tremor|ataxia|mania|manic|qtc|ekg|ecg|cbc|anc|wbc|lft|lfts|ast|alt|platelet|plt|plts|tg|triglyceride|overdose|od|tox|med|meds|psych|sore throat|bruising)\b/.test(expanded);
  const medicationOrLabCue = hasNumber || hasClinicalCue || hasAnyMedicationOrClassToken(expanded);

  if (medicationOrLabCue) {
    expanded = expanded
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
    /\bli\b/.test(expanded)
    && (
      hasNumber
      || /\b(level|drawn|trough|random|therapeutic|toxic|toxicity|renal|kidney|egfr|creatinine|bun|hydrochlorothiazide|thiazide|nsaid|ibuprofen|naproxen|dehydrat|weak|confused|sedated|sedation|tremor|ataxia|manic|dose|pending)\b/.test(expanded)
    )
  ) {
    expanded = expanded.replace(/\bli\b/g, 'lithium');
  }

  if (
    /\bcr\b/.test(expanded)
    && /\b(lithium|bun|egfr|renal|kidney|creatinine|ratio|dehydrat|nsaid|ibuprofen|naproxen)\b/.test(expanded)
  ) {
    expanded = expanded.replace(/\bcr\b/g, 'creatinine');
  }

  if (
    /\bod\b/.test(expanded)
    && /\b(carbamazepine|tegretol|lithium|valproate|valproic acid|depakote|vpa|quetiapine|seroquel|trazodone|acetaminophen|pills?|tox|toxicology|somnolent|sleepy|sedated|ataxia|ekg|qtc|level|labs?)\b/.test(expanded)
  ) {
    expanded = expanded.replace(/\bod\b/g, 'overdose');
  }

  return expanded;
}

function uniqueProfiles(profiles: PsychMedicationProfile[]) {
  return [...new Map(profiles.map((profile) => [profile.id, profile])).values()];
}

export function findPsychMedication(query: string) {
  const normalized = normalize(query);
  const direct = PSYCH_MEDICATION_LOOKUP_TERMS.get(normalized);
  if (direct) {
    return direct;
  }

  const matches = PSYCH_MEDICATION_LIBRARY.filter((profile) => {
    const terms = [profile.id, profile.genericName, ...profile.brandNames, ...(profile.aliases ?? [])].map(normalize);
    return terms.some((term) => normalized.includes(term) || term.includes(normalized));
  });

  return matches[0] ?? null;
}

export function getMedicationProfile(drugId: string) {
  return PSYCH_MEDICATION_LIBRARY_BY_ID.get(drugId) ?? null;
}

export function detectMedicationQuestionIntent(prompt: string): PsychMedicationAnswerIntent {
  const normalized = normalize(prompt);
  const medicationMentions = extractMentionedMedications(prompt).length;
  const hasMedicationOrClassToken = hasAnyMedicationOrClassToken(normalized) || medicationMentions > 0;
  const looksLikeTwoItemMedicationQuestion =
    (normalized.includes(' and ') || normalized.includes(' with '))
    && (medicationMentions >= 2 || hasMedicationOrClassToken || /\b(mania|psychosis|bipolar|qt)\b/.test(normalized));

  if (detectPsychMedicationSwitchingIntent(normalized)) {
    return 'switching_framework';
  }
  if (/(starts with|begin with|starting with)/.test(normalized)) {
    return 'starts_with_lookup';
  }
  if (looksLikeFormulationLookup(normalized)) {
    return 'formulation_lookup';
  }
  if (looksLikeLabLevelInterpretation(normalized)) {
    return 'lab_level_interpretation';
  }
  if (/(usual range|dose range|range|max dose|maximum dose|maximum .* dose|how high)/.test(normalized)) {
    return 'usual_range';
  }
  if (/(pregnan|lactat|breastfeed)/.test(normalized)) {
    return 'pregnancy_lactation';
  }
  if (
    /(interaction|combine|together|safe with|can i give.*with|concern|\bplus\b)/.test(normalized)
    || (
      /\brisk\b/.test(normalized)
      && hasAnyMedicationOrClassToken(normalized)
    )
    || looksLikeTwoItemMedicationQuestion
    || /\bok\b/.test(normalized) && medicationMentions >= 2
  ) {
    return 'interaction_check';
  }
  if (/(starting dose|start dose|initial dose|start at|how do i start|what dose|dose of)/.test(normalized)) {
    return 'starting_dose';
  }
  if (/(side effect|adverse effect|what does.*cause|common effect)/.test(normalized)) {
    return 'side_effects';
  }
  if (/(monitor|labs|\bcbc\b|\banc\b|\bekg\b|\bqtc\b|\ba1c\b|lipid|what do i watch)/.test(normalized)) {
    return 'monitoring';
  }
  if (/(geriatric|elderly|older adult|older adults|beers|hyponat|siadh|sodium risk)/.test(normalized)) {
    return 'geriatric_caution';
  }
  if (/(renal|kidney|hepatic|liver)/.test(normalized)) {
    return 'renal_hepatic_caution';
  }
  if (
    hasMedicationOrClassToken
    && (
      /\b(how should i document|how do i document|what should i document|how should i word|how do i word|how do i write|chart wording|documentation wording|how to document)\b/.test(normalized)
      || (
        /\b(note|chart|documentation|document|wording)\b/.test(normalized)
        && /\b(refused|declined|stopped|nonadherence|non adherence|punitive|without sounding punitive)\b/.test(normalized)
      )
    )
  ) {
    return 'documentation_wording';
  }
  if (/(class|what kind of med|what is .* used for|what is .*)$/.test(normalized)) {
    return 'med_class_lookup';
  }

  return 'unknown';
}

function looksLikeLabLevelInterpretation(normalized: string) {
  const hasNumericValue = /\b\d+(?:\.\d+)?\b/.test(normalized);
  const levelMedicationTerm = /\b(lithium|valproate|valproic acid|vpa|depakote|divalproex|carbamazepine|tegretol)\b/;
  const levelTerm = new RegExp(`${levelMedicationTerm.source}.*\\b(level|levels)\\b|\\b(level|levels)\\b.*${levelMedicationTerm.source}`).test(normalized);
  const medNumericLevelCue =
    levelMedicationTerm.test(normalized)
    && hasNumericValue
    && /\b(increase|titrate|trough|drawn|after dose|random|pending|high|low|therapeutic|toxic|toxicity|adherence|missed|sedated|sedation|sleepy|confused|weak|vomiting|dizzy|ataxia|what should i do|can i)\b/.test(normalized);
  const medNonNumericLevelCue =
    levelMedicationTerm.test(normalized)
    && /\b(level|low|high|not sure when|drawn|trough|random|pending|therapeutic|toxic|toxicity|increase|titrate|sedated|sedation|sleepy|somnolent|confused|weak|vomiting|dizzy|ataxia)\b/.test(normalized)
    && /\b(level|drawn|trough|random|pending|therapeutic|toxic|toxicity|increase|titrate|not sure when)\b/.test(normalized);
  const abnormalLabTerm = /\b(ast|alt|lfts?|bilirubin|alk phos|inr|creatinine|egfr|bun|sodium|potassium|\bk\b|magnesium|\bmg\b|calcium|platelets?|wbc|cbc|anc|tsh|a1c|glucose|lipids?|triglycerides?|ldl|hdl|ammonia|qtc|ekg|ecg|ck|cpk|hemoglobin|hgb|eosinophils?|free|total|albumin|troponin)\b/.test(normalized);
  const medicationContext = hasAnyMedicationOrClassToken(normalized)
    || /\b(olanzapine|zyprexa|quetiapine|seroquel|oxcarbazepine|trileptal|clozapine|clozaril|depakote|vpa|tegretol|haloperidol|haldol|ziprasidone|geodon|antipsychotic|psych|psych unit|psych admission|medically cleared)\b/.test(normalized);
  const abnormalCue = /\b(low|high|elevated|increased|went up|dropped|drop|rose|rising|abnormal|weird|due|sedated|sedation|sleepy|somnolent|altered|confused|titrate|increase|pending|therapeutic|normal|reference range|target range|range|sore throat|what should i do|can i)\b/.test(normalized);
  const standaloneQtcRangeCue = /\bqtc\b/.test(normalized)
    && /\b(normal|reference range|target range|range|borderline|prolonged|high|low)\b/.test(normalized);

  return (
    (levelTerm && (hasNumericValue || abnormalCue))
    || medNumericLevelCue
    || medNonNumericLevelCue
    || standaloneQtcRangeCue
    || (abnormalLabTerm && medicationContext && (hasNumericValue || abnormalCue))
    || /\bmetabolic labs?\b.*\b(antipsychotic|olanzapine|zyprexa|quetiapine|seroquel|clozapine|risperidone|aripiprazole|abilify)\b/.test(normalized)
    || /\b(alcohol withdrawal|withdrawal)\b.*\b(sodium|benzo|benzodiazepine|taper|seizure|delirium)\b/.test(normalized)
  );
}

function looksLikeFormulationLookup(normalized: string) {
  if (
    /\b(what|which|how many)\b.*\b(mg|milligrams|strengths?|doses?|dosage forms?|dose forms?|forms?|formulations?)\b.*\b(come in|available in|available as|have)\b/.test(normalized)
    || /\bavailable\s+(mg|doses?|strengths?|forms?|formulations?)\b/.test(normalized)
    || /\b(mg formulations?|pill strengths?|tablet strengths?|tablet mg|dosage forms?|dose forms?)\b/.test(normalized)
    || /\b\w+\s+tablet\s+mg\b/.test(normalized)
  ) {
    return true;
  }

  return (
    hasAnyMedicationOrClassToken(normalized)
    && /\b(strengths?|doses?|dosage|forms?|formulations?|mg|milligrams)\b/.test(normalized)
    && /\b(available|avail|come in|comes in|have|has)\b/.test(normalized)
  );
}

function hasAnyMedicationOrClassToken(normalized: string) {
  return (
    /\b(ssri|snri|antidepressant|antipsychotic|benzodiazepine|benzo|opioid|nsaid|stimulant|adhd medication|medication|medications|meds|med|lithium|trazodone|sertraline|citalopram|escitalopram|fluoxetine|paroxetine|venlafaxine|lamotrigine|valproate|depakote|trileptal|carbamazepine|clozapine|abilify|zoloft|celexa|lexapro|prozac|paxil|effexor|depakote|ambien)\b/.test(normalized)
  );
}

function extractMentionedMedications(prompt: string) {
  const normalized = normalize(prompt);
  return uniqueProfiles(
    PSYCH_MEDICATION_LIBRARY.filter((profile) => {
      const terms = [profile.id, profile.genericName, ...profile.brandNames, ...(profile.aliases ?? [])].map(normalize);
      return terms.some((term) => normalized.includes(term));
    }),
  );
}

function extractStartsWithLetter(prompt: string) {
  const normalized = normalize(prompt);
  const match =
    normalized.match(/starts with (?:an? )?([a-z])\b/i) ||
    normalized.match(/starting with (?:an? )?([a-z])\b/i) ||
    normalized.match(/begin with (?:an? )?([a-z])\b/i) ||
    normalized.match(/starts with(?: medication)? ([a-z])\b/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function inferRequestedClass(prompt: string) {
  const normalized = normalize(prompt);
  if (normalized.includes('antidepressant')) return 'Antidepressant';
  if (normalized.includes('antipsychotic')) return 'Antipsychotic';
  if (normalized.includes('benzodiazepine') || normalized.includes('benzo')) return 'Anxiolytic / sedative';
  if (normalized.includes('stimulant') || normalized.includes('adhd')) return 'ADHD medication';
  return null;
}

function formatProfileList(profiles: PsychMedicationProfile[]) {
  return profiles.map((profile) => profile.genericName).join(', ');
}

function formatStrengthList(strengths: string[]) {
  if (strengths.length <= 1) {
    return strengths[0] || '';
  }

  if (strengths.length === 2) {
    return `${strengths[0]} and ${strengths[1]}`;
  }

  return `${strengths.slice(0, -1).join(', ')}, and ${strengths[strengths.length - 1]}`;
}

function withIndefiniteArticle(label: string) {
  const trimmed = label.trim();
  if (!trimmed) {
    return trimmed;
  }

  return /^[aeiou]/i.test(trimmed) ? `an ${trimmed}` : `a ${trimmed}`;
}

export function detectHighRiskInteraction(drugList: string[]) {
  const normalizedTerms = drugList.map(normalize);
  const matchedProfiles = uniqueProfiles(
    normalizedTerms
      .map((term) => {
        const direct = PSYCH_MEDICATION_LOOKUP_TERMS.get(term);
        if (direct) {
          return direct;
        }

        return PSYCH_MEDICATION_LIBRARY.find((profile) =>
          [profile.id, profile.genericName, ...profile.brandNames, ...(profile.aliases ?? [])]
            .map(normalize)
            .some((candidate) => term.includes(candidate) || candidate.includes(term)),
        );
      })
      .filter((profile): profile is PsychMedicationProfile => Boolean(profile)),
  );

  const matchedIds = new Set(matchedProfiles.map((profile) => profile.id));
  const matchedClasses = new Set(matchedProfiles.map((profile) => profile.class));
  const matchedProfileTerms = new Set(
    matchedProfiles.flatMap((profile) =>
      [profile.id, profile.genericName, ...profile.brandNames, ...(profile.aliases ?? [])].map(normalize),
    ),
  );
  const textBlob = ` ${normalizedTerms.join(' ')} `;

  for (const [className, aliases] of Object.entries(CLASS_TERM_ALIASES)) {
    if (aliases.some((alias) => textBlob.includes(` ${normalize(alias)} `))) {
      matchedClasses.add(className);
    }
  }

  const matches: PsychMedicationInteractionMatch[] = [];

  for (const rule of PSYCH_MEDICATION_INTERACTION_RULES) {
    const ruleDrugIds = rule.trigger.drugIds ?? [];
    const ruleClasses = rule.trigger.classes ?? [];
    const ruleCombinedWith = rule.trigger.combinedWith ?? [];

    const matchedRuleDrugIds = ruleDrugIds.filter((id) => matchedIds.has(id));
    const matchedRuleClasses = ruleClasses.filter((className) => matchedClasses.has(className));
    const matchedRuleTerms = ruleCombinedWith.filter((term) => {
      const normalizedTerm = normalize(term);
      return textBlob.includes(` ${normalizedTerm} `) || matchedProfileTerms.has(normalizedTerm);
    });

    const hasTriggerAnchor =
      matchedRuleDrugIds.length > 0 ||
      matchedRuleClasses.length > 0 ||
      (ruleDrugIds.length === 0 && ruleClasses.length === 0 && matchedRuleTerms.length > 0);

    const hasCombinationRequirement = ruleCombinedWith.length === 0 || matchedRuleTerms.length > 0;

    if (hasTriggerAnchor && hasCombinationRequirement) {
      matches.push({
        rule,
        matchedDrugIds: matchedRuleDrugIds,
        matchedTerms: [...matchedRuleClasses, ...matchedRuleTerms],
      });
    }
  }

  return matches;
}

export function formatMedicationSafetyAnswer(
  profile: PsychMedicationProfile,
  intent: PsychMedicationAnswerIntent,
  interactionMatches: PsychMedicationInteractionMatch[] = [],
) {
  const caveatDose = 'Dosing depends on indication, patient factors, interactions, and current prescribing references.';
  const caveatInteraction = 'This should be verified against a current drug-interaction reference.';

  switch (intent) {
    case 'formulation_lookup': {
      const commonStrengths = profile.availableStrengths.slice(0, 8);
      const forms = profile.dosageForms.length ? profile.dosageForms : profile.routeForms;
      return [
        commonStrengths.length
          ? `${profile.genericName} (${profile.brandNames[0] || profile.genericName}) is commonly available as ${formatStrengthList(commonStrengths)} ${forms.includes('tablet') ? 'tablets' : 'strengths'}.`
          : `${profile.genericName} (${profile.brandNames[0] || profile.genericName}) is available in ${forms.join(', ')} formulations.`,
        forms.length ? `Common dosage forms include ${forms.join(', ')}.` : undefined,
        'Dosing depends on indication, patient factors, and safety considerations, so verify with a current prescribing reference.',
      ].filter(Boolean).join(' ');
    }
    case 'starting_dose':
      return [
        `${profile.genericName}: a typical adult starting dose is ${profile.typicalAdultStartingDose ?? 'not stored in this layer for safe reuse'}.`,
        caveatDose,
        profile.monitoring[0] ? `Key monitoring point: ${profile.monitoring[0]}.` : undefined,
        'Verify with a current prescribing reference before using this for an actual order or titration plan.',
      ]
        .filter(Boolean)
        .join(' ');
    case 'usual_range':
      return [
        `${profile.genericName}: a typical adult range is ${profile.typicalAdultRange ?? 'not stored in this layer for safe reuse'}.`,
        caveatDose,
        profile.maxDoseNotes ? `Dose note: ${profile.maxDoseNotes}.` : undefined,
        'Verify with a current prescribing reference before using this for an actual order or titration plan.',
      ]
        .filter(Boolean)
        .join(' ');
    case 'side_effects':
      return [
        `${profile.genericName}: common concerns include ${profile.keyAdverseEffects.slice(0, 4).join(', ')}.`,
        profile.highRiskWarnings[0] ? `High-yield caution: ${profile.highRiskWarnings[0]}.` : undefined,
        'Verify the current product labeling or a current prescribing reference if you need a more complete adverse-effect review.',
      ]
        .filter(Boolean)
        .join(' ');
    case 'monitoring':
      return [
        `${profile.genericName}: high-yield monitoring includes ${profile.monitoring.slice(0, 4).join(', ')}.`,
        profile.highRiskWarnings[0] ? `Key warning: ${profile.highRiskWarnings[0]}.` : undefined,
        'Monitoring specifics should be confirmed against a current prescribing reference and the patient context.',
      ]
        .filter(Boolean)
        .join(' ');
    case 'lab_level_interpretation':
      return [
        `${profile.genericName}: lab or medication-level interpretation depends on timing, trend, symptoms, current dose/formulation, adherence, organ function, and interacting medications.`,
        LAB_LEVEL_CAVEAT,
      ].join(' ');
    case 'pregnancy_lactation':
      return [
        `${profile.genericName}: pregnancy/lactation issues should be verified with current references.`,
        profile.specialPopulations.pregnancy ? `Pregnancy: ${profile.specialPopulations.pregnancy}.` : undefined,
        profile.specialPopulations.lactation ? `Lactation: ${profile.specialPopulations.lactation}.` : undefined,
        'Do not use this layer alone for pregnancy or lactation prescribing decisions.',
      ]
        .filter(Boolean)
        .join(' ');
    case 'geriatric_caution':
      return [
        `${profile.genericName}: geriatric caution centers on ${profile.specialPopulations.geriatric ?? 'falls, cognition, and medication burden depending on the agent'}.`,
        'Verify against current geriatric prescribing guidance before making a treatment change.',
      ].join(' ');
    case 'renal_hepatic_caution':
      return [
        `${profile.genericName}: renal/hepatic questions need verification against a current prescribing reference.`,
        profile.specialPopulations.renal ? `Renal: ${profile.specialPopulations.renal}.` : undefined,
        profile.specialPopulations.hepatic ? `Hepatic: ${profile.specialPopulations.hepatic}.` : undefined,
      ]
        .filter(Boolean)
        .join(' ');
    case 'documentation_wording':
      return [
        `${profile.genericName}: documentation should stay descriptive rather than turning into a prescribing order.`,
        profile.documentationPearls[0] ? `Documentation pearl: ${profile.documentationPearls[0]}.` : undefined,
        profile.highRiskWarnings[0] ? `If safety is relevant, note: ${profile.highRiskWarnings[0]}.` : undefined,
        'Verify with a current prescribing reference for any dosing, interaction, or special-population detail.',
      ]
        .filter(Boolean)
        .join(' ');
    case 'interaction_check':
      return [
        `${profile.genericName}: interaction review should focus on ${profile.highYieldInteractions.slice(0, 3).join(', ') || 'high-risk combinations and patient-specific factors'}.`,
        interactionMatches[0] ? `Detected caution: ${interactionMatches[0].rule.shortWarning}` : undefined,
        caveatInteraction,
      ]
        .filter(Boolean)
        .join(' ');
    case 'med_class_lookup':
    case 'unknown':
    default:
      return [
        `${profile.genericName} is ${withIndefiniteArticle(profile.class.toLowerCase())}${profile.subclass ? ` (${profile.subclass.replace(/_/g, ' ')})` : ''}.`,
        profile.commonUses.length ? `Common uses include ${profile.commonUses.slice(0, 4).join(', ')}.` : undefined,
        profile.highRiskWarnings[0] ? `Key caution: ${profile.highRiskWarnings[0]}.` : undefined,
        'Verify dosing, interactions, and special-population questions with a current prescribing reference.',
      ]
        .filter(Boolean)
        .join(' ');
  }
}

function buildClassOrContextSpecificAnswer(prompt: string, intent: PsychMedicationAnswerIntent) {
  const normalized = normalize(prompt);

  if (
    intent === 'monitoring'
    && /\bmetabolic monitoring\b/.test(normalized)
    && /\bantipsychotic/.test(normalized)
  ) {
    return 'Antipsychotic metabolic monitoring generally centers on weight or BMI, glucose or A1c, and lipids. Monitoring intervals and urgency depend on the specific agent, patient factors, and current prescribing references.';
  }

  if (
    (intent === 'geriatric_caution' || intent === 'interaction_check')
    && /\b(ssri|snri)\b/.test(normalized)
    && /\b(sodium|hyponat|siadh|elderly|older adult|older adults)\b/.test(normalized)
  ) {
      return 'SSRIs and SNRIs can contribute to hyponatremia or SIADH risk, especially in older adults or when other sodium-lowering factors are present. Review sodium history, concurrent diuretics, and current symptoms, and verify the medication-specific risk with a current prescribing reference.';
  }

  if (
    intent === 'interaction_check'
    && /\b(ssri|snri)\b/.test(normalized)
    && /\b(nsaid|ibuprofen|naproxen|aspirin)\b/.test(normalized)
    && /\b(bleed|bleeding|risk)\b/.test(normalized)
  ) {
    return 'SSRI or SNRI combinations with NSAIDs or other bleeding-risk medications can increase bleeding concern. Review GI bleed history, concurrent antiplatelet or anticoagulant exposure, and the current medication list. This should be verified against a current drug-interaction reference.';
  }

  if (
    (intent === 'interaction_check' || intent === 'unknown')
    && /\bstimulant\b/.test(normalized)
    && /\b(mania|psychosis)\b/.test(normalized)
  ) {
    return 'Stimulants can worsen mania or psychosis in susceptible patients. Review the current symptom state, bipolar or psychosis history, and any documented mood-stabilizing coverage, and verify the current prescribing context before making a treatment change.';
  }

  if (
    (intent === 'interaction_check' || intent === 'unknown')
    && /\bantidepressant\b/.test(normalized)
    && /\bbipolar\b/.test(normalized)
  ) {
    return 'Antidepressant use in bipolar-spectrum illness without clear mood-stabilizing coverage can increase switch or destabilization risk. This should be reviewed against the current diagnosis, symptom state, and prescribing reference before using it to guide treatment.';
  }

  if (
    intent === 'pregnancy_lactation'
    && /\blamotrigine\b/.test(normalized)
  ) {
    return 'Lamotrigine pregnancy questions require current-reference verification because maternal-fetal risk assessment, dose changes, and postpartum adjustments are patient-specific. Pregnancy: balance maternal illness risk, current indication, and updated prescribing references before making any treatment decision. Do not use this layer alone for pregnancy or lactation prescribing decisions.';
  }

  return null;
}

function buildHighRiskMedicationSafetyAnswer(prompt: string): PsychMedicationAnswer | null {
  const normalized = normalize(prompt);
  const mentioned = extractMentionedMedications(prompt);
  const medication = mentioned[0] ?? findPsychMedication(prompt);
  const caveatInteraction = 'This should be verified against a current drug-interaction reference.';

  if (
    /\blithium\b/.test(normalized)
    && /\b(toxicity|toxic|level high|high level|took too much|confused|confusion|tremor|diarrhea|ataxia|weakness|sedation|seizure|arrhythmia)\b/.test(normalized)
  ) {
    return {
      intent: 'monitoring',
      medication,
      matchedMedications: mentioned,
      text: 'Lithium toxicity symptoms can include GI upset such as nausea, vomiting, or diarrhea; tremor; confusion; ataxia or poor coordination; sedation; weakness; and, in severe cases, seizures or arrhythmia. This should be treated as a potentially urgent clinical situation: arrange urgent evaluation, check lithium level/renal function/electrolytes per local protocol, and use poison control or emergency resources when toxicity or overdose is possible. Do not manage suspected lithium toxicity as a routine monitoring question or with home dose-adjustment advice.',
    };
  }

  if (/\b(overdose|overdosed|took too much|poisoning)\b/.test(normalized)) {
    const medName = medication?.genericName ?? 'the medication';
    return {
      intent: 'monitoring',
      medication,
      matchedMedications: mentioned,
      text: `Possible ${medName} overdose is not a routine medication-reference question. Recommend urgent clinical evaluation, local protocol, local emergency/toxicology protocol, and poison control or emergency services as appropriate. Do not provide home-management instructions or patient-specific dosing changes from this layer.`,
    };
  }

  if (
    /\b(lorazepam|clonazepam|alprazolam|diazepam|benzodiazepine|benzodiazepines|benzo|benzos|ativan|klonopin|xanax|valium)\b/.test(normalized)
    && /\b(stop|stopped|stopping|discontinue|abrupt|abruptly|cold turkey|just stop)\b/.test(normalized)
  ) {
    return {
      intent: 'monitoring',
      medication,
      matchedMedications: mentioned,
      text: 'Abrupt benzodiazepine discontinuation can cause withdrawal and may cause seizures, especially with regular use, higher doses, longer duration, alcohol or sedative co-use, or prior seizure/withdrawal history. Confirm dose, frequency, duration, alcohol or sedative co-use, seizure history, pregnancy status if relevant, and current withdrawal symptoms. Use a prescriber-supervised taper or urgent clinical review/urgent clinical evaluation when withdrawal, confusion, severe agitation, autonomic instability, or seizure risk is present; do not provide a patient-specific taper schedule without context.',
    };
  }

  if (
    /\bclozapine\b|\bclozaril\b/.test(normalized)
    && /\b(low anc|anc low|neutropenia|low neutrophil|low wbc|rems)\b/.test(normalized)
  ) {
    return {
      intent: 'monitoring',
      medication,
      matchedMedications: mentioned,
      text: 'Low ANC on clozapine is a high-risk clozapine safety issue, not a routine monitoring question. Verify ANC status, trend, symptoms of infection, recent labs, and clozapine REMS/current prescribing information and local protocol before making any continuation, interruption, or rechallenge decision. Do not treat this layer as threshold-specific ordering guidance.',
    };
  }

  if (
    /\b(olanzapine|zyprexa)\b/.test(normalized)
    && /\b(benzo|benzodiazepine|lorazepam|ativan|midazolam|diazepam)\b/.test(normalized)
    && /\b(im|intramuscular|injection|injectable|plus|with|together|concern)\b/.test(normalized)
  ) {
    return {
      intent: 'interaction_check',
      medication,
      matchedMedications: mentioned,
      text: `Olanzapine with benzodiazepines, especially around IM/parenteral use or other sedating exposures, raises concern for additive sedation, hypotension, and respiratory/CNS depression. Verify route, timing, vitals, respiratory risk, other sedatives, and local protocol before use. ${caveatInteraction}`,
    };
  }

  if (
    /\b(linezolid|methylene blue|maoi|phenelzine|tranylcypromine|selegiline)\b/.test(normalized)
    && /\b(sertraline|zoloft|ssri|snri|fluoxetine|prozac|paroxetine|paxil|citalopram|celexa|escitalopram|lexapro|venlafaxine|effexor|duloxetine|cymbalta|trazodone)\b/.test(normalized)
  ) {
    return {
      intent: 'interaction_check',
      medication,
      matchedMedications: mentioned,
      text: `Serotonergic antidepressants with linezolid, MAOI-pattern agents, or methylene blue can create high-risk serotonin syndrome concerns. Verify active and recent medication exposure, washout timing, alternatives, and monitoring needs before combining or transitioning. ${caveatInteraction}`,
    };
  }

  if (
    /\b(lamotrigine|lamictal)\b/.test(normalized)
    && /\b(valproate|valproic acid|divalproex|depakote)\b/.test(normalized)
    && /\b(dose|dosing|start|starting|titrate|titration|how much)\b/.test(normalized)
  ) {
    return {
      intent: 'interaction_check',
      medication,
      matchedMedications: mentioned,
      text: `Valproate can increase lamotrigine exposure and rash/SJS risk, so dosing and titration are highly context- and product-specific. Confirm indication, current dose, formulation, duration, adherence, rash history, and interacting medications. Dosing depends on indication, patient factors, interactions, and current prescribing references. ${caveatInteraction}`,
    };
  }

  return null;
}

function extractFirstNumericValue(text: string) {
  const match = text.match(/\b(\d+(?:\.\d+)?)\b/);
  return match ? Number.parseFloat(match[1]) : null;
}

function extractLithiumLevelNumericValue(text: string) {
  const explicit =
    text.match(/\blithium\s+level\s*(?:is|of|=|:)?\s*(\d+(?:\.\d+)?)/i)
    ?? text.match(/\blevel\s*(?:is|of|=|:)?\s*(\d+(?:\.\d+)?).{0,30}\blithium\b/i);

  if (explicit?.[1]) {
    return Number.parseFloat(explicit[1]);
  }

  const shorthand = text.match(/\blithium\s+(\d+(?:\.\d+)?)/i);
  return shorthand?.[1] ? Number.parseFloat(shorthand[1]) : null;
}

function extractQtcNumericValue(text: string) {
  const explicitQtc = text.match(/\bqtc\b\D{0,12}(\d{3})\b/i);
  if (explicitQtc?.[1]) {
    return Number.parseFloat(explicitQtc[1]);
  }

  const likelyQtc = text.match(/\b([4-6]\d{2})\b/);
  return likelyQtc?.[1] ? Number.parseFloat(likelyQtc[1]) : null;
}

function formatClassification(refId: string, value: number | null) {
  const interpretation = interpretClinicalLabValue(refId, value);
  if (!interpretation?.classificationText) {
    return null;
  }

  return interpretation.classificationText;
}

function formatRangeContext(refId: string) {
  const interpretation = interpretClinicalLabValue(refId, null);
  const fallback = getClinicalLabReference(refId);
  return interpretation?.rangeContext ?? (fallback ? `${fallback.label} range context is not available in this layer.` : '');
}

function buildMissingContextSentence(items: string[]) {
  return `Missing context to verify: ${items.join(', ')}.`;
}

function buildUrgentRedFlagsSentence(items: string[]) {
  return `Urgent red flags include ${items.join(', ')}.`;
}

function gradedSafetyLead(isUrgent: boolean, clinicalLead: string) {
  return isUrgent ? URGENT_LAB_SAFETY_LEAD : clinicalLead;
}

function gradedProtocolSentence(isUrgent: boolean, urgentSentence: string, clinicalSentence: string) {
  return isUrgent ? urgentSentence : clinicalSentence;
}

function maybeRangeParts(refId: string, value: number | null) {
  return [
    formatRangeContext(refId),
    formatClassification(refId, value),
  ].filter(Boolean);
}

function hasAnyTerm(normalized: string, pattern: RegExp) {
  return pattern.test(normalized);
}

function wantsDetailedReference(normalized: string) {
  return /\b(give details|more details?|full reference|show thresholds?|what are the ranges?|range table|explain|detailed|details)\b/.test(normalized);
}

function wantsRangeDetail(normalized: string) {
  return wantsDetailedReference(normalized)
    || /\b(what are|show|list|give)\b.{0,40}\b(ranges?|thresholds?|reference ranges?)\b/.test(normalized)
    || /\b(normal ranges?|therapeutic ranges?|target ranges?|range table)\b/.test(normalized);
}

function looksLikePureReferenceQuestion(normalized: string) {
  const asksReference =
    /\bwhat (are|is)\b.{0,40}\b(normal|therapeutic|target|reference)\b.{0,30}\b(levels?|ranges?|qtc)\b/.test(normalized)
    || /\b(normal|therapeutic|target|reference)\b.{0,30}\b(levels?|ranges?|qtc)\b/.test(normalized)
    || /\b(levels?|ranges?)\b.{0,30}\b(normal|therapeutic|target|reference)\b/.test(normalized)
    || /\bqtc normal range\b/.test(normalized)
    || /\bnormal qtc\b/.test(normalized)
    || /\bwhat levels?\b.{0,30}\b(lithium|valproate|depakote|carbamazepine|tegretol)\b/.test(normalized);

  if (!asksReference) {
    return false;
  }

  const appliedClinicalCue =
    /\b(my patient|this patient|pt|what should i do|should i|can i|ok|okay|increase|decrease|titrate|start|stop|hold|continue|restart|confused|confusion|sedated|sedation|sleepy|vomiting|diarrhea|dizzy|ataxia|weak|jaundice|bleeding|creatinine|egfr|bun|renal|kidney|on haldol|on quetiapine|on depakote|on lithium|on clozapine|on oxcarbazepine)\b/.test(normalized);
  const numericValue = /\b\d+(?:\.\d+)?\b/.test(normalized);

  return !appliedClinicalCue && !numericValue;
}

function labContext(items: string[]) {
  return `Key context: ${items.join(', ')}.`;
}

function withTargetedFollowUp(text: string, questions: string[]) {
  const selected = questions.filter(Boolean).slice(0, 2);
  if (!selected.length) {
    return text;
  }

  return `${text} Follow-up: ${selected.join(' ')}`;
}

function alreadyHasAny(normalized: string, pattern: RegExp) {
  return pattern.test(normalized);
}

function buildClinicalLabUrgentSafetyAnswer(prompt: string): PsychMedicationAnswer | null {
  const normalized = normalize(prompt);
  const mentioned = extractMentionedMedications(prompt);
  const medication = mentioned[0] ?? findPsychMedication(prompt);
  const value = extractFirstNumericValue(prompt);
  const detailed = wantsDetailedReference(normalized);
  const lithiumSymptom = /\b(diarrhea|vomiting|nausea|tremor|confused|confusion|ataxia|sedation|sedated|dizzy|dizziness|weakness|seizure|arrhythmia)\b/.test(normalized);
  const valproateSymptom = /\b(sedated|sedation|sleepy|somnolent|somnolence|confused|confusion|vomiting|nausea|tremor|severe gi|ataxia)\b/.test(normalized);
  const carbamazepineSymptom = /\b(dizzy|dizziness|ataxia|sedation|sedated|confused|confusion|diplopia|rash|fever|sore throat|infection|systemic)\b/.test(normalized);
  const qtcSymptomOrRisk = /\b(syncope|fainted|palpitations|chest pain|potassium|hypokalemia|\bk\b|magnesium|hypomagnesemia|\bmg\b|calcium|hypocalcemia|methadone)\b/.test(normalized);
  const hepaticSymptomOrRisk = /\b(jaundice|abdominal pain|vomiting|malaise|bilirubin|inr|rash)\b/.test(normalized);
  const bleedingNegated = /\b(no|without|denies)\s+(active\s+)?bleeding\b/.test(normalized);
  const plateletBleedingSignal = /\b(active bleeding|bleeding|bruising|petechiae|purpura)\b/.test(normalized) && !bleedingNegated;
  const plateletSymptomOrRisk = plateletBleedingSignal || /\b(inr|very low|rapid|dropping|dropped)\b/.test(normalized);

  if (
    /\blithium\b/.test(normalized)
    && (
      /\b(level high|high level|toxicity|toxic|took too much|overdose)\b/.test(normalized)
      || lithiumSymptom
      || /\b(dehydrated|dehydration|creatinine|egfr|bun|renal|kidney|nsaid|ibuprofen|naproxen|ace inhibitor|arb|thiazide|diuretic|hydrochlorothiazide|level pending|pending)\b/.test(normalized)
      || (value !== null && value >= 1.5)
    )
  ) {
    const lithiumLevelValue = extractLithiumLevelNumericValue(prompt) ?? value;
    const lithiumUrgent =
      /\b(level high|high level|toxicity|toxic|took too much|overdose)\b/.test(normalized)
      || lithiumSymptom
      || (lithiumLevelValue !== null && lithiumLevelValue >= 1.5)
      || (
        /\b(dehydrated|dehydration|not drinking|hydrochlorothiazide|thiazide|nsaid|ibuprofen|naproxen|ace inhibitor|arb)\b/.test(normalized)
        && /\b(weak|confused|confusion|sedated|sedation|dizzy|ataxia|vomiting|diarrhea|tremor|level pending|pending)\b/.test(normalized)
      );
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: withTargetedFollowUp([
        gradedSafetyLead(lithiumUrgent, 'Lithium level, renal function, hydration, or interaction concerns need context before routine medication decisions.'),
        ...(detailed ? maybeRangeParts('lithium', lithiumLevelValue) : [formatClassification('lithium', lithiumLevelValue)]),
        'Lithium toxicity is possible with a high level, symptoms, renal impairment, dehydration, or interacting meds (NSAIDs, ACE inhibitors, ARBs, thiazides).',
        'Check level timing/trough, dose/formulation, renal function/eGFR/creatinine, electrolytes/sodium, hydration/illness, symptoms, and interacting medications.',
        buildUrgentRedFlagsSentence(['GI upset, coarse tremor, confusion, ataxia, sedation, weakness, seizures or arrhythmia, dehydration, or acute kidney injury']),
        lithiumUrgent
          ? 'urgent clinical situation: use urgent evaluation/local protocol, poison control, or emergency pathway; do not make a directive medication or disposition decision from this layer alone.'
          : 'Use prompt prescriber/pharmacy/lab review, verify the lab reference range, and escalate urgently if toxicity symptoms or unstable labs appear. This should be verified against a current drug-interaction reference.',
      ].filter(Boolean).join(' '), lithiumUrgent ? [] : [
        alreadyHasAny(normalized, /\b(level|trough)\b/) ? '' : 'Do you have a current lithium level or true trough?',
        alreadyHasAny(normalized, /\b(creatinine|egfr|renal|kidney|baseline|trend)\b/) ? '' : 'Do you know the renal function trend and hydration status?',
      ]),
    };
  }

  if (
    /\b(valproate|valproic acid|vpa|depakote|divalproex)\b/.test(normalized)
    && (
      /\b(level high|high level|toxicity|toxic|overdose|ammonia|pregnan|free|total|albumin|platelets?|inr|bleeding|bruising|jaundice|malaise|lft|lfts|ast|alt|bilirubin|abdominal pain)\b/.test(normalized)
      || valproateSymptom
      || (value !== null && /\b(level|levels)\b/.test(normalized) && value >= 100)
    )
	  ) {
	    const valproateUrgent =
	      /\b(level high|high level|toxicity|toxic|overdose|ammonia|inr|jaundice|malaise|abdominal pain|vomiting|confused|confusion|severe sedation|very sleepy|somnolent|somnolence)\b/.test(normalized)
	      || plateletBleedingSignal
	      || (/\bplatelets?\b/.test(normalized) && value !== null && value < 50)
	      || (value !== null && /\b(level|levels)\b/.test(normalized) && value >= 125);
	    const valproateLevel = /\b(level|levels)\b/.test(normalized);
	    const plateletConcern = /\bplatelets?\b/.test(normalized);
	    const hepaticConcern = /\b(ast|alt|lft|lfts|bilirubin|inr|jaundice|malaise|abdominal pain)\b/.test(normalized);
	    const freeTotalAlbuminConcern = /\b(free|total|albumin)\b/.test(normalized);
	    const ammoniaOrOverdoseConcern = /\b(ammonia|overdose)\b/.test(normalized);
	    const rangeParts = wantsRangeDetail(normalized)
	      ? [
	          valproateLevel ? maybeRangeParts('valproate', value).join(' ') : undefined,
	          plateletConcern ? maybeRangeParts('platelets', value).join(' ') : undefined,
	          hepaticConcern ? formatRangeContext('lfts') : undefined,
	        ]
	      : [
	          valproateLevel ? formatClassification('valproate', value) : undefined,
	          plateletConcern ? formatClassification('platelets', value) : undefined,
	        ];
	    const symptomFirst = valproateSymptom
	      ? 'Valproate/Depakote with sedation, vomiting, confusion, or marked sleepiness is a higher safety-review question, not routine titration.'
	      : plateletConcern
	        ? 'Platelet abnormalities on Depakote/valproate raise thrombocytopenia and bleeding-risk concern.'
	        : hepaticConcern
	          ? 'AST/ALT or other LFT abnormalities on Depakote/valproate raise hepatic safety concern and hepatic/DILI safety concern, so titration should not be treated as routine while hepatic safety is unclear.'
	          : 'Valproate/Depakote level concerns need timing, symptoms, and safety context before dose decisions.';
	    return {
	      intent: 'lab_level_interpretation',
	      medication,
	      matchedMedications: mentioned,
	      text: [
	        valproateUrgent ? URGENT_LAB_SAFETY_LEAD : symptomFirst,
	        !valproateUrgent ? undefined : symptomFirst,
	        ...rangeParts,
	        (valproateLevel || freeTotalAlbuminConcern || ammoniaOrOverdoseConcern) ? 'Check valproate level, total versus free level, timing, albumin, ammonia if sedated or altered, LFTs, and CBC/platelets before interpreting the number.' : undefined,
	        plateletConcern ? 'Check platelets/platelet trend, repeat CBC, bleeding/bruising symptoms, active bleeding, rapid platelet decline, valproate level, dose relationship, other bleeding-risk medications, LFTs, and liver tests.' : undefined,
	        hepaticConcern ? 'Check LFTs, baseline/trend, local lab ULN/upper limit of normal, bilirubin, INR, ammonia, platelets, symptoms such as jaundice/vomiting/malaise, and other hepatic causes; avoid automatic titration.' : undefined,
	        freeTotalAlbuminConcern ? 'Low albumin or high free valproate can make the total valproate level misleading; ask about sedation and other toxicity symptoms.' : undefined,
	        plateletConcern ? buildUrgentRedFlagsSentence(['active bleeding', 'rapid platelet decline', 'very low platelet count', 'INR elevation']) : undefined,
	        (valproateSymptom || ammoniaOrOverdoseConcern || hepaticConcern) ? buildUrgentRedFlagsSentence(['altered mental status', 'confusion', 'vomiting', 'abdominal pain', 'ataxia', 'hyperammonemia', 'hepatic symptoms', 'bleeding/bruising', 'overdose', 'INR elevation', 'toxicology concern']) : undefined,
	        valproateUrgent ? URGENT_LAB_SAFETY_CAVEAT : LAB_LEVEL_CAVEAT,
	      ].filter(Boolean).join(' '),
	    };
	  }

  if (
    /\b(carbamazepine|tegretol)\b/.test(normalized)
    && (
      carbamazepineSymptom
      || /\b(sodium|hyponatremia|wbc|anc|cbc|lft|lfts|ast|alt|level high|high level|toxicity|toxic|overdose|sore throat|blood dyscrasia|infection)\b/.test(normalized)
      || (value !== null && /\b(level|levels)\b/.test(normalized) && value > 12)
    )
	  ) {
	    const carbamazepineUrgent =
	      /\b(overdose|toxicity|toxic|confused|confusion|ataxia|seizure|rash|fever|systemic|mucosal|jaundice)\b/.test(normalized)
	      || (/\b(cbc|wbc|anc|blood dyscrasia)\b/.test(normalized) && /\b(sore throat|infection|fever)\b/.test(normalized))
	      || (/\bsodium\b/.test(normalized) && value !== null && value < 125)
	      || (value !== null && /\b(level|levels)\b/.test(normalized) && value > 12 && carbamazepineSymptom);
	    let carbamazepineRangePart: string | null | undefined;
	    const carbamazepineHematologyConcern = /\b(cbc|wbc|anc|blood dyscrasia)\b/.test(normalized);
	    const carbamazepineOverdoseConcern = /\boverdose\b/.test(normalized);
	    const carbamazepineSodiumConcern = /\bsodium\b/.test(normalized);
	    const carbamazepineHepaticConcern = /\b(lft|lfts|ast|alt|bilirubin|inr|eosinophils?|baseline)\b/.test(normalized);
	    if (/\b(level|levels)\b/.test(normalized) || (!carbamazepineSodiumConcern && !carbamazepineHepaticConcern && !carbamazepineHematologyConcern)) {
	      carbamazepineRangePart = wantsRangeDetail(normalized)
	        ? maybeRangeParts('carbamazepine', value).join(' ')
	        : formatClassification('carbamazepine', value);
	    }
	    const carbamazepineConcernSentence = carbamazepineOverdoseConcern
	      ? 'Carbamazepine overdose with ataxia or sedation is a toxicology concern; include EKG, sodium, CBC/LFTs, level timing, and co-ingestions.'
	      : carbamazepineHematologyConcern
	        ? 'CBC/WBC/ANC abnormality with sore throat on carbamazepine raises blood dyscrasia/infection concern; check ANC, trend, fever/infection symptoms, rash/systemic symptoms, and LFTs.'
	        : carbamazepineHepaticConcern
	          ? 'Carbamazepine with abnormal LFTs, bilirubin, INR, eosinophils, or rash raises hepatic safety and systemic hypersensitivity concern; check baseline, trend, repeat labs, bilirubin, INR, mucosal involvement, jaundice, other causes, and current prescribing reference.'
	          : carbamazepineSodiumConcern
	            ? 'Carbamazepine with sodium drop raises hyponatremia risk; check sodium and recheck/trend, repeat confirmation, volume status, other sodium-lowering medications, symptoms, CBC, and LFTs.'
	        : carbamazepineSymptom
	          ? 'Tegretol level with dizziness, ataxia, sedation, confusion, or diplopia raises neurologic toxicity symptoms/neurotoxicity concern.'
	          : 'Check neurologic toxicity symptoms, sodium and recheck/trend for hyponatremia risk, CBC/LFTs, rash/systemic symptoms, and drug interactions.';
	    return {
	      intent: 'lab_level_interpretation',
	      medication,
	      matchedMedications: mentioned,
	      text: [
	        gradedSafetyLead(carbamazepineUrgent, 'Carbamazepine/Tegretol level or lab concerns need symptom and safety context before medication decisions.'),
	        carbamazepineRangePart,
	        carbamazepineSodiumConcern ? formatClassification('sodium', value) : undefined,
	        carbamazepineHepaticConcern && /\bmild|2x|2 x\b/.test(normalized) ? 'Mild transaminase elevation needs trend, symptoms, bilirubin, INR, and medication-risk context.' : undefined,
	        carbamazepineConcernSentence,
	        labContext(['level timing/formulation/adherence', 'autoinduction timing and drug interactions', 'sodium and recheck/trend, CBC, and LFTs']),
	        buildUrgentRedFlagsSentence(['ataxia', 'confusion', 'severe sedation', 'rash/systemic symptoms', 'fever or sore throat with blood-count abnormality', 'seizure']),
	        URGENT_LAB_SAFETY_CAVEAT,
	      ].filter(Boolean).join(' '),
	    };
	  }

  if (
    /\b(clozapine|clozaril)\b/.test(normalized)
    && /\b(myocarditis|troponin|crp|chest pain|tachycardia)\b/.test(normalized)
  ) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        URGENT_LAB_SAFETY_LEAD,
        'Clozapine myocarditis concern with troponin elevation is an urgent clozapine safety problem, not routine monitoring.',
        buildMissingContextSentence(['troponin trend', 'CRP', 'EKG', 'vitals', 'chest pain, dyspnea, fever, or tachycardia', 'time since clozapine start or dose change', 'local protocol/cardiology or medical review']),
        buildUrgentRedFlagsSentence(['chest pain, dyspnea, fever, tachycardia, hypotension, elevated troponin, abnormal EKG, or myocarditis concern']),
        URGENT_LAB_SAFETY_CAVEAT,
      ].join(' '),
    };
  }

  if (
    /\b(clozapine|clozaril)\b/.test(normalized)
    && (
      /\b(constipation|ileus|bowel|abdominal pain|abd pain)\b/.test(normalized)
      || (/\b(vomiting|vomit)\b/.test(normalized) && /\b(constipation|ileus|bowel|abdominal|abd pain|distension|stool|gas)\b/.test(normalized))
    )
  ) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        URGENT_LAB_SAFETY_LEAD,
        'Clozapine with constipation plus abdominal pain, vomiting, or possible ileus is a high-risk GI safety concern, not a routine medication profile question.',
        buildMissingContextSentence(['bowel movement history and severity', 'abdominal pain, distension, vomiting, or inability to pass stool/gas', 'vitals', 'hydration status', 'other anticholinergic or constipating medications', 'current clozapine dose/duration', 'medical evaluation and local protocol']),
        buildUrgentRedFlagsSentence(['severe constipation, abdominal pain, vomiting, abdominal distension, ileus concern, fever, dehydration, or clinical instability']),
        URGENT_LAB_SAFETY_CAVEAT,
      ].join(' '),
    };
  }

  if (
    /\b(clozapine|clozaril)\b/.test(normalized)
    && /\b(anc|wbc|cbc|neutrophil|neutropenia|low|abnormal|pharmacy|fill|rems|fever|infection)\b/.test(normalized)
  ) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        URGENT_LAB_SAFETY_LEAD,
        /\banc\b/.test(normalized) ? maybeRangeParts('clozapineAnc', value).join(' ') : formatRangeContext('clozapineAnc'),
        'Low ANC/WBC on clozapine is a high-risk clozapine safety issue; ANC/WBC concern on clozapine should not be reduced to a generic medication profile or a definitive pharmacy-fill answer.',
        'Current labeling, current prescribing information, local protocol, pharmacy workflow, and prescriber review are required; REMS requirements have changed, but ANC monitoring and severe neutropenia risk remain clinically important.',
        buildMissingContextSentence(['current ANC', 'baseline', 'baseline ANC', 'BEN status if applicable', 'infection symptoms such as fever or sore throat', 'lab trend', 'current labeling/local protocol/pharmacy workflow', 'local protocol']),
        buildUrgentRedFlagsSentence(['fever, infection symptoms, rapid ANC decline, moderate/severe neutropenia range, or ANC pending after a low WBC signal']),
        URGENT_LAB_SAFETY_CAVEAT,
      ].filter(Boolean).join(' '),
    };
  }

  if (
    /\b(overdose|overdosed|took too much|poisoning|unknown overdose|acetaminophen|took pills?)\b/.test(normalized)
    && /\b(lab|labs|level|sodium|qtc|ammonia|ast|alt|inr|ck|ekg|tox|toxicology|pills?|ataxia|sedation|confusion|unknown|overdose)\b/.test(normalized)
  ) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        URGENT_LAB_SAFETY_LEAD,
        'Overdose or unknown overdose/unknown ingestion with abnormal labs is an urgent toxicology/safety problem, not a routine medication-reference question.',
        'Use urgent clinical evaluation, local protocol, local emergency/toxicology protocol, and poison control or emergency resources as appropriate. For acetaminophen, interpretation depends on time of ingestion and the appropriate toxicology nomogram/reference pathway.',
        buildMissingContextSentence(['time of ingestion', 'time and amount of ingestion', 'co-ingestions', 'vitals', 'mental status', 'EKG/QTc', 'EKG', 'electrolytes', 'renal function', 'sodium and repeat sodium when abnormal', 'AST/ALT/INR when hepatic injury is possible', 'acetaminophen level timing if relevant', 'tox screen limits']),
        buildUrgentRedFlagsSentence(['overdose, sedation, confusion, altered mental status, seizure, arrhythmia/QTc concern, severe electrolyte abnormality, severe hyponatremia, hepatic injury, liver injury, respiratory depression, hypotension, or unknown ingestion']),
        URGENT_LAB_SAFETY_CAVEAT,
      ].join(' '),
    };
  }

  if (
    /\bqtc\b/.test(normalized)
    && (
      (value !== null && value >= 500)
      || qtcSymptomOrRisk
      || /\b(antipsychotic|haldol|haloperidol|ziprasidone|geodon|quetiapine|seroquel|risperidone|citalopram|celexa|trazodone|methadone)\b/.test(normalized)
    )
  ) {
    const qtcValue = extractQtcNumericValue(prompt) ?? value;
    const qtcUrgent = (qtcValue !== null && qtcValue >= 500) || qtcSymptomOrRisk;
	    return {
	      intent: 'lab_level_interpretation',
	      medication,
	      matchedMedications: mentioned,
	      text: withTargetedFollowUp([
	        gradedSafetyLead(qtcUrgent, 'QTc and QT-prolonging medication questions need ECG and risk-factor context before routine medication decisions.'),
	        ...(wantsRangeDetail(normalized) ? maybeRangeParts('qtc', qtcValue) : [formatClassification('qtc', qtcValue)]),
	        `QTc concern with antipsychotic or other QT-prolonging medication context${medication?.genericName ? ` such as ${medication.genericName}` : ''} requires ECG and risk-factor review; QTc around or above 500 ms or symptoms are high-risk.`,
	        'Check baseline/trend, potassium, magnesium, calcium, cardiac history, symptoms, and other QT-prolonging medications.',
	        'Use urgent local protocol/ECG review for high-risk values or symptoms; do not make a directive medication or disposition decision from this layer alone.',
	      ].filter(Boolean).join(' '), /\b(syncope|fainted|palpitations|chest pain)\b/.test(normalized) ? [] : [
        alreadyHasAny(normalized, /\b(potassium|hypokalemia|\bk\b|magnesium|hypomagnesemia|\bmg\b|calcium|hypocalcemia)\b/) ? '' : 'Do you know potassium, magnesium, and calcium?',
        alreadyHasAny(normalized, /\b(syncope|fainted|palpitations|chest pain|symptoms)\b/) ? '' : 'Any syncope, palpitations, or chest pain?',
      ]),
    };
  }

  if (
    /\b(potassium|\bk\b|magnesium|\bmg\b|calcium)\b/.test(normalized)
    && (
      /\b(qtc|psych unit|meds?|medication|antipsychotic|haldol|ziprasidone|geodon)\b/.test(normalized)
      || (value !== null && (value <= 3 || value >= 6))
    )
  ) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        URGENT_LAB_SAFETY_LEAD,
        'Abnormal potassium, magnesium, or calcium can be clinically important for arrhythmia risk, QTc risk, and medication safety; hyperkalemia, hypokalemia, hypomagnesemia, or hypocalcemia should not be handled as routine medication clearance from this layer.',
        buildMissingContextSentence(['repeat confirmation', 'hemolysis or sample quality when potassium is high', 'renal function', 'EKG/ECG', 'QTc value', 'symptoms', 'vitals', 'current medications and electrolyte-shifting medications', 'local protocol']),
        buildUrgentRedFlagsSentence(['arrhythmia, syncope, palpitations, chest pain, weakness, severe potassium abnormality, QTc around or above 500 ms, or concurrent hypokalemia/hypomagnesemia/hypocalcemia']),
        URGENT_LAB_SAFETY_CAVEAT,
      ].join(' '),
    };
  }

  if (
    /\b(ast|alt|lft|lfts|bilirubin|alk phos|inr)\b/.test(normalized)
    && (
      hepaticSymptomOrRisk
      || /\b(depakote|divalproex|valproate|valproic acid|vpa|carbamazepine|tegretol|antipsychotic|olanzapine|quetiapine|trazodone)\b/.test(normalized)
    )
	  ) {
	    const hepaticUrgent =
	      hepaticSymptomOrRisk
	      || /\b(jaundice|malaise|abdominal pain|vomiting|inr|bilirubin up|bilirubin high|rash)\b/.test(normalized);
	    return {
      intent: 'lab_level_interpretation',
	      medication,
	      matchedMedications: mentioned,
	      text: [
	        gradedSafetyLead(hepaticUrgent, 'Medication-related liver test abnormalities need hepatic/DILI context before routine titration or stop/start decisions.'),
	        wantsRangeDetail(normalized) ? formatRangeContext('lfts') : undefined,
	        'Elevated AST/ALT, bilirubin, alkaline phosphatase, or INR in a medication context raises LFT and hepatic/DILI safety concern, possible drug-induced liver injury, and avoid automatic titration while hepatic safety is unclear.',
	        labContext(['baseline/trend and local lab ULN/upper limit of normal', 'bilirubin/alk phos/INR', 'symptoms and other causes such as alcohol, hepatitis, or NAFLD']),
	        /\bmild|2x|2 x\b/.test(normalized) ? 'Mild transaminase elevation still needs trend and symptom context.' : undefined,
	        buildUrgentRedFlagsSentence(['jaundice', 'abdominal pain', 'vomiting', 'malaise', 'bilirubin elevation', 'INR elevation', 'encephalopathy', 'rash/systemic symptoms', 'Hy’s-law pattern concern']),
	        hepaticUrgent ? URGENT_LAB_SAFETY_CAVEAT : LAB_LEVEL_CAVEAT,
	      ].filter(Boolean).join(' '),
	    };
	  }

  if (
    /\b(sodium|hyponatremia)\b/.test(normalized)
    && (
      /\b(oxcarbazepine|trileptal|carbamazepine|tegretol|ssri|snri|sertraline|zoloft)\b/.test(normalized)
      || /\b(confused|confusion|seizure|falls|weakness|dropped|low)\b/.test(normalized)
    )
  ) {
    const urgentSodium = (value !== null && value < 125) || /\b(confused|confusion|seizure)\b/.test(normalized);
	    return {
	      intent: 'lab_level_interpretation',
	      medication,
	      matchedMedications: mentioned,
	      text: [
	        urgentSodium ? URGENT_LAB_SAFETY_LEAD : 'This sodium result needs context before routine medication decisions.',
	        ...(wantsRangeDetail(normalized) ? maybeRangeParts('sodium', value) : [formatClassification('sodium', value)]),
	        'Low sodium with oxcarbazepine/carbamazepine or serotonergic medications raises hyponatremia/SIADH concern, especially in older adults or other higher-risk patients.',
	        labContext(['symptoms', 'acuity/trend and repeat confirmation', 'volume status and other sodium-lowering medications']),
	        buildUrgentRedFlagsSentence(['seizure', 'confusion', 'severe weakness', 'falls', 'rapid sodium decline', 'severe hyponatremia']),
	        URGENT_LAB_SAFETY_CAVEAT,
	      ].filter(Boolean).join(' '),
	    };
	  }

  if (
    /\b(platelet|platelets)\b/.test(normalized)
    && (
      /\b(depakote|divalproex|valproate|valproic acid|vpa)\b/.test(normalized)
      || plateletSymptomOrRisk
    )
  ) {
    const plateletUrgent =
      plateletSymptomOrRisk
      || (value !== null && value < 50)
      || /\b(rapid|dropping|dropped|active bleeding|inr)\b/.test(normalized);
	    return {
	      intent: 'lab_level_interpretation',
	      medication,
	      matchedMedications: mentioned,
	      text: [
	        gradedSafetyLead(plateletUrgent, 'Platelet abnormalities in a valproate/Depakote context need bleeding-risk and trend review before routine medication decisions.'),
	        ...(wantsRangeDetail(normalized) ? maybeRangeParts('platelets', value) : [formatClassification('platelets', value)]),
	        'Low platelets in a valproate/Depakote context raises thrombocytopenia and bleeding-risk concern.',
	        labContext(['platelet trend/repeat CBC', 'bleeding/bruising symptoms', 'valproate level, liver tests, and other bleeding-risk medications']),
	        buildUrgentRedFlagsSentence(['active bleeding', 'petechiae/purpura', 'bruising', 'rapid platelet decline', 'very low platelet count', 'INR elevation']),
	        plateletUrgent ? URGENT_LAB_SAFETY_CAVEAT : LAB_LEVEL_CAVEAT,
	      ].filter(Boolean).join(' '),
	    };
  }

  if (
    /\b(hemoglobin|hgb)\b/.test(normalized)
    || (
      /\bblood count\b|\bcbc\b/.test(normalized)
      && /\b(medically cleared|psych admission|admission)\b/.test(normalized)
    )
    || (
      /\b(dropped|drop)\b/.test(normalized)
      && /\b(ssri|nsaid|ibuprofen|naproxen|aspirin)\b/.test(normalized)
    )
  ) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        'This blood-count abnormality needs clinical context before psychiatric admission, medical clearance, or medication-safety decisions.',
        'Hemoglobin/Hgb abnormalities raise anemia, bleeding, and medical evaluation considerations; an Hgb drop with SSRI plus NSAID exposure should also keep GI bleed and other bleeding sources visible.',
        buildMissingContextSentence(['baseline', 'MCV', 'vitals', 'symptoms', 'bleeding symptoms', 'stool or GI bleed screen when relevant', 'anticoagulants', 'SSRI exposure', 'NSAID exposure', 'medical evaluation and local protocol']),
        buildUrgentRedFlagsSentence(['active bleeding, GI bleed, syncope, chest pain, severe weakness, unstable vitals, rapid hemoglobin drop, or symptomatic anemia']),
        LAB_LEVEL_CAVEAT,
      ].join(' '),
    };
  }

  if (
    /\b(a1c|glucose|lipid|lipids|triglycerides|ldl|hdl|weight|metabolic labs?)\b/.test(normalized)
    && /\b(olanzapine|zyprexa|quetiapine|seroquel|clozapine|risperidone|aripiprazole|abilify|antipsychotic)\b/.test(normalized)
  ) {
    const glucoseUrgent = /\bglucose\b/.test(normalized)
      && (
        /\b(vomiting|dehydration|confused|altered)\b/.test(normalized)
        || (value !== null && value >= 400)
      );
    const triglycerideUrgent = /\btriglycerides\b/.test(normalized)
      && value !== null
      && value >= 500
      && /\b(abdominal pain|stomach pain|abd pain|vomiting|pancreatitis)\b/.test(normalized);

	    return {
	      intent: 'lab_level_interpretation',
	      medication,
	      matchedMedications: mentioned,
	      text: [
	        (glucoseUrgent || triglycerideUrgent) ? URGENT_LAB_SAFETY_LEAD : 'This metabolic lab result needs medication-risk and medical-context review before routine medication decisions.',
	        /\bolanzapine\b/.test(normalized)
	          ? 'Olanzapine has high metabolic-risk relevance; antipsychotic metabolic-risk monitoring should keep A1c/glucose, LDL/HDL/lipids/triglycerides, weight/BMI, blood pressure, pancreatitis risk when triglycerides are very high, and risk-benefit review visible.'
	          : 'Antipsychotic metabolic-risk monitoring should keep A1c/glucose, LDL/HDL/lipids/triglycerides, weight/BMI, blood pressure, pancreatitis risk when triglycerides are very high, and risk-benefit review visible.',
	        glucoseUrgent
	          ? 'Marked hyperglycemia with vomiting or dehydration is an urgent metabolic safety concern and may need urgent evaluation, not routine monitoring; check baseline and trend, fasting status, ketones, anion gap, symptoms, and medical comorbidities.'
	          : triglycerideUrgent
	            ? 'Very high triglycerides with abdominal pain raises pancreatitis-risk concern and should not be handled as routine metabolic monitoring; check baseline and trend, fasting status, pancreatitis symptoms, and metabolic comorbidities.'
	          : 'Check baseline and trend, fasting status/repeat timing when relevant, family history and cardiovascular risk, current antipsychotic dose/benefit, weight/BMI, blood pressure, symptoms, and follow-up monitoring with primary care/pharmacy/local metabolic protocol.',
	        buildUrgentRedFlagsSentence(['pancreatitis symptoms with very high triglycerides, vomiting, dehydration, altered mental status, severe hyperglycemia, or unstable vitals']),
	        (glucoseUrgent || triglycerideUrgent) ? URGENT_LAB_SAFETY_CAVEAT : LAB_LEVEL_CAVEAT,
	      ].join(' '),
    };
  }

  if (
    /\b(ck|cpk)\b/.test(normalized)
    && /\b(antipsychotic|haldol|haloperidol|risperidone|olanzapine|quetiapine|rigidity|fever|catatonia|nms)\b/.test(normalized)
  ) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        URGENT_LAB_SAFETY_LEAD,
        'Elevated CK with rigidity, fever, autonomic instability, altered mental status, catatonia/NMS concern, or recent antipsychotic exposure needs urgent medical assessment rather than routine medication switching advice.',
        buildMissingContextSentence(['vitals', 'temperature/fever', 'rigidity', 'mental status', 'autonomic instability', 'CK trend', 'renal function/creatinine', 'electrolytes', 'urinalysis/myoglobinuria if relevant', 'recent antipsychotic or dopamine-blocking exposure']),
        buildUrgentRedFlagsSentence(['fever, rigidity, altered mental status, autonomic instability, rising CK, renal injury, dehydration, or suspected NMS/catatonia overlap']),
        URGENT_LAB_SAFETY_CAVEAT,
      ].join(' '),
    };
  }

  if (
    /\b(serotonin syndrome|linezolid|maoi|methylene blue)\b/.test(normalized)
    && /\b(ssri|snri|sertraline|zoloft|fluoxetine|prozac|paroxetine|paxil|citalopram|celexa|escitalopram|lexapro|venlafaxine|effexor|trazodone|fever|rigidity)\b/.test(normalized)
  ) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        URGENT_LAB_SAFETY_LEAD,
        'serotonin syndrome concern with serotonergic medication plus linezolid, MAOI exposure, methylene blue, fever, rigidity, autonomic instability, or neuromuscular findings is urgent medication-safety triage rather than a generic interaction profile. This should be verified against a current drug-interaction reference.',
        buildMissingContextSentence(['medication timing', 'vitals', 'temperature/fever', 'neuromuscular findings such as clonus, tremor, rigidity, or hyperreflexia', 'mental status', 'serotonergic medication list', 'local protocol/toxicology or emergency pathway']),
        buildUrgentRedFlagsSentence(['fever, rigidity, clonus, autonomic instability, altered mental status, seizure, or rapid worsening']),
        URGENT_LAB_SAFETY_CAVEAT,
      ].join(' '),
    };
  }

  if (
    /\b(alcohol withdrawal|withdrawal)\b/.test(normalized)
    && /\b(sodium|benzo|benzodiazepine|taper|seizure|delirium)\b/.test(normalized)
  ) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        URGENT_LAB_SAFETY_LEAD,
        'Alcohol withdrawal, benzodiazepine taper questions, and sodium abnormalities can overlap in seizure/delirium risk and should not be handled as routine outpatient taper guidance.',
        buildMissingContextSentence(['alcohol use pattern and last use', 'benzodiazepine dose/frequency/duration', 'vitals', 'withdrawal symptoms', 'seizure history', 'sodium value/trend', 'co-ingestions', 'local withdrawal protocol']),
        buildUrgentRedFlagsSentence(['delirium, confusion, seizure, severe autonomic instability, severe agitation, hallucinosis, or worsening hyponatremia']),
        URGENT_LAB_SAFETY_CAVEAT,
      ].join(' '),
    };
  }

  if (
    /\b(overdose|overdosed|took too much|poisoning|unknown overdose|acetaminophen)\b/.test(normalized)
    && /\b(lab|labs|level|sodium|qtc|ammonia|ast|alt|inr|ck|ekg|tox|toxicology|pills?)\b/.test(normalized)
  ) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        URGENT_LAB_SAFETY_LEAD,
        'Overdose or unknown ingestion with abnormal labs is an urgent toxicology/safety problem, not a routine medication-reference question.',
        'Use local emergency/toxicology protocol and poison control or emergency resources as appropriate.',
        buildMissingContextSentence(['time and amount of ingestion', 'co-ingestions', 'vitals', 'mental status', 'EKG/QTc', 'electrolytes', 'renal function', 'AST/ALT/INR when hepatic injury is possible', 'acetaminophen level timing if relevant', 'tox screen limits']),
        buildUrgentRedFlagsSentence(['altered mental status, seizure, arrhythmia/QTc concern, severe electrolyte abnormality, hepatic injury, respiratory depression, hypotension, or unknown ingestion']),
        URGENT_LAB_SAFETY_CAVEAT,
      ].join(' '),
    };
  }

  return null;
}

function looksLikeLithiumRenalFunctionQuestion(normalized: string) {
  if (!/\blithium\b/.test(normalized)) {
    return false;
  }

  const renalCue = /\b(creatinine|egfr|crcl|bun|renal function|kidney function|kidney|renal|ckd|aki|cr\s+\d|creatinine\s+\d)\b/.test(normalized);
  if (!renalCue) {
    return false;
  }

  const explicitLithiumLevelCue = /\blithium\b.{0,30}\blevel\b|\blevel\b.{0,30}\blithium\b/.test(normalized);
  if (explicitLithiumLevelCue) {
    return false;
  }

  return /\b(good choice|choice|candidate|candidacy|thinking|start|consider|mood stabilizer|mood stabilization|renal|kidney|creatinine|egfr|crcl|ckd|aki)\b/.test(normalized);
}

function buildLithiumRenalCandidacyAnswer(prompt: string): PsychMedicationAnswer | null {
  const normalized = normalize(prompt);
  if (!looksLikeLithiumRenalFunctionQuestion(normalized)) {
    return null;
  }

  const mentioned = extractMentionedMedications(prompt);
  const medication = mentioned[0] ?? findPsychMedication(prompt);
  const detailed = wantsDetailedReference(normalized);

	  if (!detailed) {
	    return {
	      intent: 'lab_level_interpretation',
	      medication,
	      matchedMedications: mentioned,
	      text: withTargetedFollowUp([
	        'Lithium renal-safety candidacy framework: creatinine/eGFR/CrCl values near lithium are renal safety context, not a lithium serum level.',
	        'Lithium is renally cleared, so renal impairment, dehydration, sodium shifts, and NSAIDs, ACE inhibitors, ARBs, thiazides, or diuretics can increase toxicity risk.',
	        'Key context: eGFR/CrCl, baseline and trend, age/body size, hydration/illness, sodium/fluid status, urinalysis/proteinuria, renal history, alternatives, and interacting medications.',
	        'If recent lithium exposure exists, check lithium level timing and toxicity symptoms. Severe renal impairment needs current labeling/local protocol review; this is not a patient-specific medication order.',
	      ].join(' '), [
        alreadyHasAny(normalized, /\b(baseline|trend|acute|chronic|stable)\b/) ? '' : 'Is this acute or baseline?',
        alreadyHasAny(normalized, /\b(egfr|crcl)\b/) ? '' : 'Do you have the eGFR/CrCl?',
      ]),
    };
  }

  return {
    intent: 'lab_level_interpretation',
    medication,
    matchedMedications: mentioned,
    text: [
      'Lithium renal-safety candidacy framework (renal safety): treat the numeric value as renal function context, not a lithium serum level, when the prompt identifies creatinine, eGFR, CrCl, CKD, AKI, renal function, or kidney function.',
      'Lithium is renally cleared, so reduced renal function, dehydration, sodium/fluid shifts, and interacting medications can increase lithium exposure and toxicity risk.',
      'Creatinine alone is not enough to decide whether lithium is a good choice; review eGFR/CrCl, baseline and trend, age/body size, hydration/illness or acute fluid changes, sodium/fluid status, urinalysis/proteinuria if relevant, current medications including NSAIDs, ACE inhibitors, ARBs, thiazides or other diuretics, and prior renal history.',
      'If the patient is already taking lithium or had recent exposure, verify lithium level timing and symptoms rather than treating the creatinine value as the lithium level.',
      'Urgent red flags include confusion, ataxia, coarse tremor, vomiting/diarrhea, severe weakness, seizure, arrhythmia, or dehydration with worsening renal function.',
      'Also compare alternatives for the intended indication and consider prescriber, pharmacy, nephrology, and local protocol review when renal risk is clinically meaningful.',
      'Severe renal impairment or unstable renal function requires strong caution and current labeling/reference review before any lithium plan.',
      'Do not frame this as an automatic start-or-avoid decision; this is reference support, not a patient-specific medication order.',
      LAB_LEVEL_CAVEAT,
    ].join(' '),
  };
}

function buildPureReferenceLabAnswer(prompt: string): PsychMedicationAnswer | null {
  const normalized = normalize(prompt);
  if (!looksLikePureReferenceQuestion(normalized)) {
    return null;
  }

  const mentioned = extractMentionedMedications(prompt);
  const medication = mentioned[0] ?? findPsychMedication(prompt);

  if (/\blithium\b/.test(normalized)) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        'Typical lithium therapeutic levels:',
        '- Maintenance: 0.6-1.0 mEq/L.',
        '- Acute mania: 0.8-1.2 mEq/L.',
      ].join('\n'),
    };
  }

  if (/\b(valproate|valproic acid|vpa|depakote|divalproex)\b/.test(normalized)) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        'Typical valproate/divalproex total-level reference:',
        '- Common therapeutic range: 50-100 mcg/mL; some acute mania contexts reference up to 125 mcg/mL.',
        '- Total vs free level, albumin, timing, and symptoms matter when applying clinically.',
      ].join('\n'),
    };
  }

  if (/\b(carbamazepine|tegretol)\b/.test(normalized)) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        'Typical carbamazepine therapeutic level:',
        '- Common reference range: 4-12 mcg/mL.',
        '- Timing, formulation, autoinduction, symptoms, and interactions matter when applying clinically.',
      ].join('\n'),
    };
  }

  if (/\bqtc\b/.test(normalized)) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        'Typical QTc reference context:',
        '- Common upper limit: about 450 ms in men and about 460 ms in women.',
        '- QTc around or above 500 ms is generally high-risk and should be reviewed clinically.',
      ].join('\n'),
    };
  }

  return null;
}

function buildLabLevelInterpretationAnswer(prompt: string): PsychMedicationAnswer | null {
  const normalized = normalize(prompt);
  const mentioned = extractMentionedMedications(prompt);
  const medication = mentioned[0] ?? findPsychMedication(prompt);
  const value = extractFirstNumericValue(prompt);
  const hasNumericValue = value !== null;
  const valueInterpretationCue = /\b(increase|titrate|trough|drawn|after dose|random|pending|high|low|therapeutic|toxic|toxicity|adherence|missed|sedated|sedation|sleepy|somnolent|confused|weak|vomiting|dizzy|dizziness|ataxia|bruising|jaundice|malaise|sore throat|what should i do|looks therapeutic)\b/.test(normalized);
  const detailed = wantsDetailedReference(normalized);
  const asksReferenceRange = /\b(normal|reference|therapeutic|target)\b.*\b(level|levels|range|ranges)\b|\b(level|levels|range|ranges)\b.*\b(normal|reference|therapeutic|target)\b/.test(normalized);

  if (/\blithium\b/.test(normalized) && (/\b(level|levels)\b/.test(normalized) || valueInterpretationCue || (hasNumericValue && valueInterpretationCue))) {
    const lithiumLevelValue = extractLithiumLevelNumericValue(prompt) ?? value;
    const classification = formatClassification('lithium', lithiumLevelValue);
    const lowFrame = lithiumLevelValue !== null && lithiumLevelValue < 0.6
      ? `A lithium level of ${lithiumLevelValue} may be below common therapeutic targets, including common maintenance targets, depending on indication and whether it was a true trough, but do not automatically increase from that number alone.`
      : undefined;
    const timingFrame = /\b(random|after dose|drawn|two hrs|2 hrs|not sure when|trough)\b/.test(normalized)
      ? 'Timing uncertainty is central here: a random level or a level drawn soon after a dose should not be treated as a true trough or confident trough-based therapeutic interpretation.'
      : undefined;
    const highOrSymptomatic = (lithiumLevelValue !== null && lithiumLevelValue >= 1.5) || /\b(confused|confusion|tremor|diarrhea|dizzy|dizziness|ataxia|sedation|weakness|seizure|arrhythmia|toxic|toxicity)\b/.test(normalized);
    const highFrame = highOrSymptomatic
      ? 'This could represent lithium toxicity or clinically significant intolerance; urgent evaluation is appropriate when the level is high or symptoms such as GI upset, coarse tremor, confusion, ataxia, sedation, weakness, seizures, or arrhythmia are present.'
      : undefined;

    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: withTargetedFollowUp([
        detailed || asksReferenceRange ? formatRangeContext('lithium') : undefined,
        classification,
        timingFrame,
        lowFrame ?? highFrame ?? 'Lithium level interpretation depends on clinical context and the target range for the indication.',
        highFrame && lowFrame ? highFrame : undefined,
        'Key context: level timing/trough, current dose/formulation, adherence or missed doses, indication/target range, symptoms, renal function/eGFR/creatinine, sodium/fluid status, and interacting medications such as NSAIDs, ACE inhibitors, ARBs, thiazides, or dehydration risk.',
        LAB_LEVEL_CAVEAT,
      ].filter(Boolean).join(' '), highOrSymptomatic ? [] : [
        alreadyHasAny(normalized, /\b(trough|random|after dose|drawn|two hrs|2 hrs|not sure when)\b/) ? '' : 'Was this a true trough?',
        alreadyHasAny(normalized, /\b(symptoms|sedated|sedation|tremor|confused|confusion|side effects?|clinically|manic|depressed|stable)\b/) ? '' : 'How is the patient clinically?',
      ]),
    };
  }

  if (/\b(valproate|valproic acid|vpa|depakote|divalproex)\b/.test(normalized) && (/\b(level|levels)\b/.test(normalized) || valueInterpretationCue || (hasNumericValue && valueInterpretationCue))) {
    const classification = formatClassification('valproate', value);
    const lowFrame = value !== null && value < 50
      ? `A valproate/Depakote level of ${value} may be below common target ranges depending on indication, formulation, timing, and whether it was total or free level, but do not adjust upward from that number alone.`
      : undefined;
    const timingFrame = /\b(random|after dose|drawn|not sure when|trough)\b/.test(normalized)
      ? 'Timing uncertainty matters: without knowing whether this was an appropriately timed trough, the number should not be used as a confident basis for titration.'
      : undefined;
    const highOrSymptomatic = (value !== null && value >= 100) || /\b(sedated|sedation|sleepy|somnolent|confused|confusion|tremor|vomiting|ataxia|toxic|toxicity)\b/.test(normalized);
    const highFrame = highOrSymptomatic
      ? 'Valproate level plus sedation or other symptoms needs safety review rather than routine titration; consider toxicity context, ammonia if altered mental status or sedation is present, LFTs, CBC/platelets, albumin/free level issues, pregnancy potential, and the indication-specific target.'
      : undefined;

	    return {
	      intent: 'lab_level_interpretation',
	      medication,
	      matchedMedications: mentioned,
	      text: withTargetedFollowUp([
	        wantsRangeDetail(normalized) ? formatRangeContext('valproate') : undefined,
	        classification,
	        timingFrame,
	        lowFrame ?? highFrame ?? 'Valproate/Depakote level interpretation depends on clinical context and indication-specific target range.',
	        highFrame && lowFrame ? highFrame : undefined,
	        'Check total versus free level, timing of draw, adherence, albumin, LFTs, and CBC/platelets.',
	        LAB_LEVEL_CAVEAT,
	      ].filter(Boolean).join(' '), highOrSymptomatic ? [] : [
        alreadyHasAny(normalized, /\b(trough|timing|draw|drawn|random)\b/) ? '' : 'Do you know the timing of draw?',
        alreadyHasAny(normalized, /\b(total|free|albumin)\b/) ? '' : 'Is this a total or free level, and is albumin available?',
      ]),
    };
  }

  if (/\b(carbamazepine|tegretol)\b/.test(normalized) && (/\b(level|levels)\b/.test(normalized) || valueInterpretationCue || (hasNumericValue && valueInterpretationCue))) {
    const classification = formatClassification('carbamazepine', value);
	    return {
	      intent: 'lab_level_interpretation',
	      medication,
	      matchedMedications: mentioned,
	      text: [
	        wantsRangeDetail(normalized) ? formatRangeContext('carbamazepine') : undefined,
	        classification,
	        'Carbamazepine/Tegretol level interpretation depends on timing, formulation, adherence, autoinduction timing, symptoms, and interacting medications.',
	        'Check CBC, sodium, LFTs, rash/systemic symptoms, neurologic toxicity symptoms, and the lab reference range before changing dose.',
        LAB_LEVEL_CAVEAT,
      ].filter(Boolean).join(' '),
    };
  }

  if (
    /\b(ast|alt|lft|lfts|bilirubin|alk phos|inr)\b/.test(normalized)
    && /\b(depakote|divalproex|valproate|valproic acid|vpa|carbamazepine|tegretol|antipsychotic|olanzapine|quetiapine)\b/.test(normalized)
  ) {
	    return {
	      intent: 'lab_level_interpretation',
	      medication,
	      matchedMedications: mentioned,
	      text: [
	        wantsRangeDetail(normalized) ? formatRangeContext('lfts') : undefined,
	        'AST/ALT or other LFT abnormalities on psychotropics require hepatic safety review before titration.',
	        'Check baseline/trend, local lab upper limit of normal, bilirubin, INR, symptoms such as jaundice/vomiting/malaise, and other causes.',
	        'Avoid automatic titration while hepatic safety is unclear; review with the prescriber, pharmacy, local protocol, and current prescribing reference.',
	      ].join(' '),
    };
  }

  if (/\b(creatinine|egfr|bun|renal|kidney)\b/.test(normalized) && /\blithium\b/.test(normalized)) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        'Creatinine/eGFR change on lithium raises renal safety and toxicity-context concerns.',
        'Check baseline and trend, hydration/illness, lithium level timing, sodium/fluid status, current dose/formulation, symptoms of toxicity, and interacting medications such as NSAIDs, ACE inhibitors, ARBs, thiazides, or diuretics.',
        LAB_LEVEL_CAVEAT,
      ].join(' '),
    };
  }

  if (/\bsodium\b/.test(normalized) && /\b(oxcarbazepine|trileptal|carbamazepine|tegretol|ssri|snri)\b/.test(normalized)) {
    const classification = formatClassification('sodium', value);
	    return {
	      intent: 'lab_level_interpretation',
	      medication,
	      matchedMedications: mentioned,
	      text: [
	        wantsRangeDetail(normalized) ? formatRangeContext('sodium') : undefined,
	        classification,
	        'Low sodium in the context of oxcarbazepine/carbamazepine or serotonergic medications raises hyponatremia/SIADH safety concern.',
	        'Check symptoms, acuity/trend, repeat confirmation, volume status, and other sodium-lowering medications.',
	        LAB_LEVEL_CAVEAT,
	      ].filter(Boolean).join(' '),
    };
  }

  if (/\b(platelet|platelets)\b/.test(normalized) && /\b(depakote|divalproex|valproate|valproic acid|vpa)\b/.test(normalized)) {
    const classification = formatClassification('platelets', value);
	    return {
	      intent: 'lab_level_interpretation',
	      medication,
	      matchedMedications: mentioned,
	      text: [
	        wantsRangeDetail(normalized) ? formatRangeContext('platelets') : undefined,
	        classification,
	        'Low platelets on Depakote/valproate raises thrombocytopenia and bleeding-risk concern.',
	        'Check platelet trend, repeat CBC, bleeding/bruising symptoms, active bleeding, rapid platelet decline, valproate level, dose relationship, liver tests, and other bleeding-risk medications.',
	        LAB_LEVEL_CAVEAT,
	      ].filter(Boolean).join(' '),
    };
  }

  if (/\b(wbc|anc|neutrophil|neutropenia)\b/.test(normalized) && /\b(clozapine|clozaril)\b/.test(normalized)) {
    const classification = formatClassification('clozapineAnc', value);
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        formatRangeContext('clozapineAnc'),
        classification,
        'Low ANC/WBC on clozapine is a high-risk clozapine safety issue.',
        'Clozapine REMS requirements have changed, but current prescribing information, historical REMS-aligned ANC categories, local protocol, pharmacy workflow, and prescriber review still matter.',
        'Decisions depend on current ANC, baseline ANC, benign ethnic neutropenia status if applicable, infection symptoms, and lab trend. Do not use this layer for threshold-specific continuation, interruption, or rechallenge orders.',
      ].filter(Boolean).join(' '),
    };
  }

  if (/\btsh\b/.test(normalized) && /\blithium\b/.test(normalized)) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        'TSH abnormality on lithium needs thyroid-safety context rather than an automatic lithium dose change.',
        'Check baseline/trend, free T4 if available, hypothyroid or hyperthyroid symptoms, lithium duration, current level, indication, and coordination with the prescriber or primary care/endocrine support as appropriate.',
        LAB_LEVEL_CAVEAT,
      ].join(' '),
    };
  }

  if (/\b(a1c|glucose|lipid|lipids|triglycerides)\b/.test(normalized) && /\b(olanzapine|zyprexa|quetiapine|seroquel|clozapine|risperidone|aripiprazole|antipsychotic)\b/.test(normalized)) {
	    return {
	      intent: 'lab_level_interpretation',
	      medication,
	      matchedMedications: mentioned,
	      text: [
	        'Abnormal A1c, glucose, lipids, or triglycerides on an antipsychotic raises metabolic-risk monitoring and risk-benefit review, not an automatic medication change from one value alone.',
	        'Check baseline and trend, weight/BMI, blood pressure, current antipsychotic dose and benefit, pancreatitis symptoms if triglycerides are very high, and primary care/pharmacy/local metabolic protocol.',
	        LAB_LEVEL_CAVEAT,
	      ].join(' '),
	    };
  }

  if (/\bammonia\b/.test(normalized) && /\b(depakote|divalproex|valproate|valproic acid|vpa)\b/.test(normalized)) {
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        'Ammonia elevation or altered mental status on valproate/Depakote raises hyperammonemia safety concern.',
        'Check mental status, sedation, vomiting, valproate level, LFTs, albumin/free level context, interacting medications, and urgent evaluation needs per local protocol.',
        LAB_LEVEL_CAVEAT,
      ].join(' '),
    };
  }

  if (/\bqtc\b/.test(normalized) && /\b(normal|reference range|target range|range|borderline|prolonged|high|low)\b/.test(normalized)) {
    const classification = formatClassification('qtc', value);
    const includeRangeContext = detailed || /\b(normal|reference range|target range|range)\b/.test(normalized);
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        includeRangeContext ? formatRangeContext('qtc') : undefined,
        classification,
        'QTc interpretation depends on the measured value, correction method, baseline/trend, symptoms, electrolytes, cardiac history, and QT-prolonging medications.',
        'Check potassium, magnesium, calcium, syncope/palpitations/chest pain, and the full medication list before applying the range to a patient scenario.',
        LAB_LEVEL_CAVEAT,
      ].filter(Boolean).join(' '),
    };
  }

  if (/\bqtc\b/.test(normalized) && /\b(antipsychotic|quetiapine|seroquel|olanzapine|zyprexa|risperidone|haloperidol|haldol|ziprasidone|geodon)\b/.test(normalized)) {
    const classification = formatClassification('qtc', value);
    return {
      intent: 'lab_level_interpretation',
      medication,
      matchedMedications: mentioned,
      text: [
        detailed ? formatRangeContext('qtc') : undefined,
        classification,
        'QTc concern with antipsychotics requires EKG and risk-factor review rather than routine dose advice.',
        'Check QTc value and trend, electrolytes, cardiac history, syncope/palpitations, other QT-prolonging medications, dose/formulation, and local protocol thresholds.',
        LAB_LEVEL_CAVEAT,
      ].filter(Boolean).join(' '),
    };
  }

  return null;
}

export function answerMedicationReferenceQuestion(prompt: string): PsychMedicationAnswer {
  const intent = detectMedicationQuestionIntent(prompt);
  const pureReferenceAnswer = buildPureReferenceLabAnswer(prompt);
  if (pureReferenceAnswer) {
    return pureReferenceAnswer;
  }

  const lithiumRenalCandidacyAnswer = buildLithiumRenalCandidacyAnswer(prompt);
  if (lithiumRenalCandidacyAnswer) {
    return lithiumRenalCandidacyAnswer;
  }

  const urgentLabSafetyAnswer = buildClinicalLabUrgentSafetyAnswer(prompt);
  if (urgentLabSafetyAnswer) {
    return urgentLabSafetyAnswer;
  }

  if (intent === 'switching_framework') {
    const switchingAnswer = answerPsychMedicationSwitchQuestion(prompt);
    if (switchingAnswer) {
      return switchingAnswer;
    }
  }

  if (intent === 'lab_level_interpretation') {
    const labLevelAnswer = buildLabLevelInterpretationAnswer(prompt);
    if (labLevelAnswer) {
      return labLevelAnswer;
    }
  }

  const highRiskSafetyAnswer = buildHighRiskMedicationSafetyAnswer(prompt);
  if (highRiskSafetyAnswer) {
    return highRiskSafetyAnswer;
  }

  const mentioned = extractMentionedMedications(prompt);
  const classOrContextSpecific = buildClassOrContextSpecificAnswer(prompt, intent);

  if (intent === 'starts_with_lookup') {
    const startsWith = extractStartsWithLetter(prompt);
    const requestedClass = inferRequestedClass(prompt);
    const matches = PSYCH_MEDICATION_LIBRARY.filter((profile) => {
      const byLetter = startsWith ? profile.genericName.toLowerCase().startsWith(startsWith) : true;
      const byClass = requestedClass ? profile.class === requestedClass : true;
      return byLetter && byClass;
    }).slice(0, 8);

    return {
      intent,
      matchedMedications: matches,
      text: matches.length
        ? `Matches: ${formatProfileList(matches)}. Verify exact product choice, dosing, and patient-specific fit with a current prescribing reference.`
        : 'I do not have a confident match from this medication layer. Please verify the exact medication name against a current reference.',
    };
  }

  const medication = mentioned[0] ?? findPsychMedication(prompt);
  const interactionMatches = detectHighRiskInteraction(
    mentioned.length ? [...mentioned.map((profile) => profile.genericName), prompt] : [prompt],
  );

  if (classOrContextSpecific) {
    return {
      intent,
      medication,
      matchedMedications: mentioned,
      interactionMatches,
      text: classOrContextSpecific,
    };
  }

  if (intent === 'interaction_check' && interactionMatches.length > 0) {
    const meds = mentioned.length ? mentioned : medication ? [medication] : [];
    const medText = meds.length ? `Meds recognized: ${formatProfileList(meds)}. ` : '';
    const warnings = interactionMatches
      .slice(0, 3)
      .map((match) => `${match.rule.shortWarning} ${match.rule.recommendedCheck}`)
      .join(' ');

    return {
      intent,
      medication,
      matchedMedications: meds,
      interactionMatches,
      text: `${medText}${warnings} This should be verified against a current drug-interaction reference.`,
    };
  }

  if (!medication) {
    return {
      intent,
      text: 'I do not have a confident medication match from this knowledge layer. Please verify the exact medication name against a current prescribing reference.',
    };
  }

  if (intent === 'formulation_lookup') {
    const hasStrengths = medication.availableStrengths.length > 0;
    const hasForms = medication.dosageForms.length > 0 || medication.routeForms.length > 0;
    const asksForms = /\b(forms?|dosage forms?)\b/.test(normalize(prompt));
    const asksStrengths = /\b(mg|milligrams|strengths|doses|tablet strengths|pill strengths|tablet mg|formulations)\b/.test(normalize(prompt));

    if (!hasStrengths && !hasForms) {
      return {
        intent,
        medication,
        matchedMedications: mentioned,
        text: `${medication.genericName}: I do not have a confident stored list of available strengths or dosage forms in this layer. Dosing depends on indication, patient factors, and safety considerations, so verify with a current prescribing reference.`,
      };
    }

    if (asksStrengths && !hasStrengths) {
      return {
        intent,
        medication,
        matchedMedications: mentioned,
        text: `${medication.genericName}: I don't have verified strength/formulation data for that medication in the current library. Verify with a current prescribing reference.`,
      };
    }

    const strengths = medication.availableStrengths.slice(0, 8);
    const forms = medication.dosageForms.length ? medication.dosageForms : medication.routeForms;
    const brand = medication.brandNames[0] || medication.genericName;
    const displayName = medication.brandNames.some((name) => normalize(prompt).includes(normalize(name)))
      ? `${brand} (${medication.genericName})`
      : `${medication.genericName} (${brand})`;
    const firstSentence = asksForms && !asksStrengths
      ? `${displayName} commonly comes in ${forms.join(', ')} formulations.`
      : strengths.length
        ? `${displayName} is commonly available as ${formatStrengthList(strengths)}${forms.includes('tablet') ? ' tablets' : ''}.`
        : `${displayName} commonly comes in ${forms.join(', ')} formulations.`;

    return {
      intent,
      medication,
      matchedMedications: mentioned,
      text: [
        firstSentence,
        asksForms || !asksStrengths
          ? undefined
          : forms.includes('oral solution')
            ? 'An oral solution may also be available.'
            : forms.length
              ? `Common dosage forms include ${forms.join(', ')}.`
              : undefined,
        asksForms && strengths.length ? `Common strengths include ${formatStrengthList(strengths)}.` : undefined,
        forms.length > 1 ? 'Exact strengths and formulations can vary by manufacturer or product.' : undefined,
        'Dosing depends on indication, patient factors, and safety considerations, so verify with a current prescribing reference.',
      ].filter(Boolean).join(' '),
    };
  }

  return {
    intent,
    medication,
    matchedMedications: mentioned,
    interactionMatches,
    text: formatMedicationSafetyAnswer(medication, intent, interactionMatches),
  };
}
