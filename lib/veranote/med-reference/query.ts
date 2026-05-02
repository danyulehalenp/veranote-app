import {
  normalizeMedReferenceText,
  PSYCH_MED_REFERENCE_BY_ALIAS,
  PSYCH_MED_REFERENCE_LIBRARY,
} from '@/lib/veranote/med-reference/psych-meds';
import type { MedReferenceIntent, MedReferenceQuery, PsychMedReferenceEntry } from '@/lib/veranote/med-reference/types';

const FORMULATION_TERMS = /\b(?:mg|milligram|milligrams|strength|strengths|concentration|concentrations|formulation|formulations|dosage forms?|dose forms?|forms?|come in|available(?: in)?|availabe(?: in)?|tablet mg|tablet strengths?|pill strengths?|injectable strengths?|injection strengths?|have xr|xr|extended release|extended-release|odt|orally disintegrating)\b/i;
const MONITORING_TERMS = /\b(?:monitoring|monitor|labs?|blood work|anc|cbc|cmp|lft|renal|thyroid|level|levels|metabolic)\b/i;
const SAFETY_TERMS = /\b(?:major warning|boxed warning|black box|warning|warnings|safety|risk|risks|danger|dangerous|red flags?)\b/i;
const CLASS_USE_TERMS = /\b(?:used for|use for|class|what kind of med|what type of med|what is .* used for|what's .* used for)\b/i;

const DOCUMENTATION_TERMS = /\b(?:chart wording|wording|document|documentation|note|nonadherence|non adherence|refused|declined|stopped because|without sounding punitive)\b/i;
const SWITCHING_OR_TAPER_TERMS = /\b(?:switch|cross\s*-?\s*taper|cross\s*-?\s*titrate|taper|wean|transition|convert|change from|stop .* start|discontinue .* start|to\s+[a-z][a-z-]+(?:\?|$)|lai|long acting|long-acting)\b/i;
const EMERGENCY_COMPLEX_TERMS = /\b(?:overdose|toxicity|toxic|poisoning|emergency|serotonin syndrome|nms|neuroleptic malignant|catatonia|severe reaction)\b/i;
const PATIENT_SPECIFIC_DOSING_TERMS = /\b(?:my patient|this patient|pt\b|patient)\b/i;
const DOSING_ACTION_TERMS = /\b(?:start|starting|increase|decrease|titrate|give|order|prescribe|dose should|what dose should|how much should)\b/i;

function hasPhraseBoundary(normalizedMessage: string, normalizedAlias: string) {
  const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, 'i').test(normalizedMessage);
}

function displayAliases(medication: PsychMedReferenceEntry) {
  return [medication.genericName, ...medication.brandNames, ...medication.aliases]
    .map((alias) => normalizeMedReferenceText(alias))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

export function findMedReferenceMedication(prompt: string): PsychMedReferenceEntry | null {
  const normalized = normalizeMedReferenceText(prompt);

  for (const alias of Array.from(PSYCH_MED_REFERENCE_BY_ALIAS.keys()).sort((a, b) => b.length - a.length)) {
    if (hasPhraseBoundary(normalized, alias)) {
      return PSYCH_MED_REFERENCE_BY_ALIAS.get(alias) ?? null;
    }
  }

  for (const medication of PSYCH_MED_REFERENCE_LIBRARY) {
    if (displayAliases(medication).some((alias) => hasPhraseBoundary(normalized, alias))) {
      return medication;
    }
  }

  return null;
}

export function detectMedReferenceIntent(prompt: string): MedReferenceIntent {
  const normalized = prompt.toLowerCase().replace(/\bavailabe\b/g, 'available');

  if (FORMULATION_TERMS.test(normalized)) {
    return 'formulations';
  }

  if (MONITORING_TERMS.test(normalized)) {
    return 'monitoring';
  }

  if (SAFETY_TERMS.test(normalized)) {
    return 'safety';
  }

  if (CLASS_USE_TERMS.test(normalized)) {
    return 'class_use';
  }

  return 'unsupported';
}

function shouldKeepOutOfSimpleReference(prompt: string, intent: MedReferenceIntent) {
  if (DOCUMENTATION_TERMS.test(prompt)) {
    return true;
  }

  if (SWITCHING_OR_TAPER_TERMS.test(prompt)) {
    if (
      intent === 'formulations'
      && FORMULATION_TERMS.test(prompt)
      && !/\b(?:switch|cross\s*-?\s*taper|cross\s*-?\s*titrate|taper|wean|transition|convert|restart|missed|overlap|equivalent|from)\b/i.test(prompt)
    ) {
      return false;
    }

    return true;
  }

  if (EMERGENCY_COMPLEX_TERMS.test(prompt)) {
    return true;
  }

  if (
    intent !== 'formulations'
    && PATIENT_SPECIFIC_DOSING_TERMS.test(prompt)
    && DOSING_ACTION_TERMS.test(prompt)
  ) {
    return true;
  }

  if (
    intent === 'formulations'
    && PATIENT_SPECIFIC_DOSING_TERMS.test(prompt)
    && /\b(?:start|starting|titrate|increase|decrease|how much|what dose should)\b/i.test(prompt)
  ) {
    return true;
  }

  return false;
}

export function resolveMedReferenceQuery(prompt: string): MedReferenceQuery | null {
  const medication = findMedReferenceMedication(prompt);
  if (!medication) {
    return null;
  }

  const intent = detectMedReferenceIntent(prompt);
  if (intent === 'unsupported') {
    return null;
  }

  if (shouldKeepOutOfSimpleReference(prompt, intent)) {
    return null;
  }

  return {
    raw: prompt,
    normalized: normalizeMedReferenceText(prompt),
    intent,
    medication,
    asksExtendedRelease: /\b(?:xr|er|extended release|extended-release)\b/i.test(prompt),
  };
}
