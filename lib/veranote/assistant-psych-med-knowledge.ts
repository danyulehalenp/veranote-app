import type { AssistantReferenceSource, AssistantResponsePayload, AssistantThreadTurn } from '@/types/assistant';
import {
  answerMedicationReferenceQuestion,
  detectMedicationQuestionIntent,
  findPsychMedication,
} from '@/lib/veranote/meds/psych-med-answering';
import { PSYCH_MEDICATION_LIBRARY } from '@/lib/veranote/meds/psych-med-library';

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
  return text.toLowerCase();
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

function buildMonitoringAnswer(query: string): AssistantResponsePayload | null {
  const response = answerMedicationReferenceQuestion(query);
  const profile = response.medication;
  if (!profile) {
    return null;
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

  if (looksLikeStandaloneMedicationDocumentationPrompt(normalized)) {
    const documentationHelp = buildMedicationDocumentationHelp(normalizedMessage);
    if (documentationHelp) {
      return documentationHelp;
    }
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

  if (intent === 'monitoring' && /\b(depakote|divalproex|valproate|valproic acid)\b/i.test(normalized)) {
    return buildMonitoringAnswer(normalized);
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

  return {
    message: response.text,
    suggestions: [
      ...(intent === 'interaction_check'
        ? ['Interaction support is high yield only and should not replace a current interaction checker.']
        : ['General reference only, not patient-specific prescribing guidance.']),
    ],
    references,
    answerMode: 'medication_reference_answer',
  };
}

export function listPsychMedicationReferenceCandidates(prefix?: string) {
  const normalizedPrefix = prefix?.trim().toLowerCase();
  return PSYCH_MEDICATION_LIBRARY.filter((profile) => (
    !normalizedPrefix || profile.genericName.toLowerCase().startsWith(normalizedPrefix)
  ));
}
