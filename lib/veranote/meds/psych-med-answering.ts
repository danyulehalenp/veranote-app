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

function normalize(text: string) {
  let normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [pattern, replacement] of NORMALIZED_ALIAS_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/\s+/g, ' ').trim();
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
  if (
    /(interaction|combine|together|safe with|can i give.*with|concern)/.test(normalized)
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
  if (/(usual range|dose range|range|max dose|how high)/.test(normalized)) {
    return 'usual_range';
  }
  if (/(side effect|adverse effect|what does.*cause|common effect)/.test(normalized)) {
    return 'side_effects';
  }
  if (/(monitor|labs|cbc|anc|ekg|qtc|a1c|lipid|what do i watch)/.test(normalized)) {
    return 'monitoring';
  }
  if (/(pregnan|lactat|breastfeed)/.test(normalized)) {
    return 'pregnancy_lactation';
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

export function answerMedicationReferenceQuestion(prompt: string): PsychMedicationAnswer {
  const intent = detectMedicationQuestionIntent(prompt);
  if (intent === 'switching_framework') {
    const switchingAnswer = answerPsychMedicationSwitchQuestion(prompt);
    if (switchingAnswer) {
      return switchingAnswer;
    }
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
