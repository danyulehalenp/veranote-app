import { resolveMedReferenceQuery } from '@/lib/veranote/med-reference/query';
import type {
  MedFormulation,
  MedReferenceAnswer,
  MedReferenceQuery,
  MedReferenceSource,
  PsychMedReferenceEntry,
} from '@/lib/veranote/med-reference/types';

const FORMULATION_CAVEAT = 'verify with a current prescribing reference or pharmacy for availability and substitution details.';
const GENERAL_CAVEAT = 'This is general reference support and should be verified with a current prescribing reference before use for a real patient.';

function uniqueSources(sources: MedReferenceSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.id)) {
      return false;
    }
    seen.add(source.id);
    return true;
  });
}

function displayName(medication: PsychMedReferenceEntry) {
  const primaryBrand = medication.brandNames[0];
  if (!primaryBrand) {
    return medication.genericName;
  }
  return `${medication.genericName}/${primaryBrand}`;
}

function brandGenericName(medication: PsychMedReferenceEntry) {
  const primaryBrand = medication.brandNames[0];
  if (!primaryBrand) {
    return medication.genericName;
  }
  return `${primaryBrand} (${medication.genericName})`;
}

function indefiniteArticleFor(value: string) {
  return /^[aeiou]/i.test(value.trim()) ? 'an' : 'a';
}

function joinSeries(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? '';
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function formatStrengths(strengths: string[]) {
  return joinSeries(strengths.map((strength) => strength.replace(/\s+/g, ' ').trim()));
}

function formatFormulation(formulation: MedFormulation) {
  const notes = formulation.notes ? ` (${formulation.notes})` : '';
  return `${formulation.label} ${formatStrengths(formulation.strengths)}${notes}`;
}

function sourceRefsForFormulations(medication: PsychMedReferenceEntry, formulations: MedFormulation[]) {
  const sourceIds = new Set(formulations.flatMap((formulation) => formulation.sourceRefs));
  const matched = medication.sourceRefs.filter((source) => sourceIds.has(source.id));
  return uniqueSources(matched.length ? matched : medication.sourceRefs);
}

function formatFormulationAnswer(query: MedReferenceQuery): MedReferenceAnswer {
  const medication = query.medication;
  const formulations = query.asksExtendedRelease
    ? medication.formulations.filter((formulation) => formulation.releaseType === 'extended_release')
    : medication.formulations;

  if (!formulations.length) {
    return {
      intent: query.intent,
      medication,
      text: `I do not have verified extended-release formulation data for ${brandGenericName(medication)} in the current structured library. ${FORMULATION_CAVEAT}`,
      sourceRefs: medication.sourceRefs,
    };
  }

  const lead = query.asksExtendedRelease
    ? `${displayName(medication)} extended-release/XR formulations in the current structured library include ${formulations.map(formatFormulation).join('; ')}.`
    : `${displayName(medication)} is commonly available as ${formulations.map(formatFormulation).join('; ')}.`;

  return {
    intent: query.intent,
    medication,
    text: `${lead} ${FORMULATION_CAVEAT}`,
    sourceRefs: sourceRefsForFormulations(medication, formulations),
  };
}

function formatMonitoringAnswer(query: MedReferenceQuery): MedReferenceAnswer {
  const medication = query.medication;
  const monitoring = medication.keySafety.monitoring.length
    ? medication.keySafety.monitoring
    : ['clinical response and adverse effects'];

  return {
    intent: query.intent,
    medication,
    text: `${displayName(medication)}: high-yield monitoring includes ${joinSeries(monitoring)}. Monitoring depends on indication, patient factors, duration of therapy, comorbidities, and interacting medications. ${GENERAL_CAVEAT}`,
    sourceRefs: medication.sourceRefs,
  };
}

function formatSafetyAnswer(query: MedReferenceQuery): MedReferenceAnswer {
  const medication = query.medication;
  const warnings = [
    ...medication.keySafety.boxedWarnings,
    ...medication.keySafety.majorWarnings,
  ];

  const warningText = warnings.length
    ? joinSeries(warnings)
    : 'major safety concerns should be checked in current labeling';

  return {
    intent: query.intent,
    medication,
    text: `${displayName(medication)} key safety warnings include ${warningText}. ${GENERAL_CAVEAT}`,
    sourceRefs: medication.sourceRefs,
  };
}

function formatClassUseAnswer(query: MedReferenceQuery): MedReferenceAnswer {
  const medication = query.medication;
  const uses = medication.commonPsychUses.length
    ? joinSeries(medication.commonPsychUses)
    : 'uses should be verified in current labeling';

  return {
    intent: query.intent,
    medication,
    text: `${medication.genericName} is ${indefiniteArticleFor(medication.class)} ${medication.class}. Common psychiatric uses include ${uses}. This is general medication reference support, not a patient-specific treatment recommendation; verify indication-specific use with a current prescribing reference.`,
    sourceRefs: medication.sourceRefs,
  };
}

export function formatMedReferenceAnswer(query: MedReferenceQuery): MedReferenceAnswer {
  if (query.intent === 'formulations') {
    return formatFormulationAnswer(query);
  }

  if (query.intent === 'monitoring') {
    return formatMonitoringAnswer(query);
  }

  if (query.intent === 'safety') {
    return formatSafetyAnswer(query);
  }

  return formatClassUseAnswer(query);
}

export function answerStructuredMedReferenceQuestion(prompt: string): MedReferenceAnswer | null {
  const query = resolveMedReferenceQuery(prompt);
  if (!query) {
    return null;
  }

  return formatMedReferenceAnswer(query);
}
