import diagnosisSeed from '@/data/psych-psychiatry-diagnosis.seed.json';
import { DIAGNOSIS_ALIAS_OVERRIDES } from '@/lib/veranote/knowledge/diagnosis/diagnosis-aliases';
import type { DiagnosisCodingEntry, DiagnosisConcept, SourceAttribution } from '@/lib/veranote/knowledge/types';
import type { AssistantReferenceSource } from '@/types/assistant';

type SeedDiagnosis = (typeof diagnosisSeed.diagnoses)[number];
type SeedLinkage = (typeof diagnosisSeed.icd_linkage)[number];

export type LegacyDiagnosisConcept = {
  id: string;
  diagnosisName: string;
  category?: string;
  summary?: string;
  timeframeSummary?: string;
  minimumDuration?: string;
  commonConfusionWithOtherDiagnoses?: string[];
  commonSpecifiersModifiers?: string[];
  likelyIcd10Family?: string;
  sourceLinks: string[];
  matchTerms: string[];
};

const CONCEPT_CUE_PATTERNS = [
  /\bwhat do you know about\b/,
  /\bwhat can you tell me about\b/,
  /\btell me about\b/,
  /\bhelp me understand\b/,
  /\bexplain\b/,
  /\bwhat is\b/,
  /\bvs\b/,
  /\bversus\b/,
];

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function toSourceAttribution(urls: string[], label: string, authority: string): SourceAttribution[] {
  return urls.map((url) => ({
    label,
    url,
    authority,
    kind: url ? 'external' : 'seed',
  }));
}

export const DIAGNOSIS_CONCEPTS: DiagnosisConcept[] = diagnosisSeed.diagnoses.map((diagnosis: SeedDiagnosis) => {
  const override = DIAGNOSIS_ALIAS_OVERRIDES[diagnosis.id] || {};
  const aliases = dedupe([
    diagnosis.diagnosis_name,
    ...(diagnosis.aliases || []),
    ...(diagnosis.shorthand || []),
    ...(diagnosis.patient_language_equivalent || []),
    ...(override.extraAliases || []),
  ]);

  return {
    id: diagnosis.id,
    displayName: diagnosis.diagnosis_name,
    category: diagnosis.category,
    aliases,
    hallmarkFeatures: dedupe([
      ...(override.hallmarkFeatures || []),
      ...(diagnosis.common_chart_wording || []).slice(0, 3),
    ]),
    overlapFeatures: dedupe([
      ...(override.overlapFeatures || []),
      ...(diagnosis.common_confusion_with_other_diagnoses || []).slice(0, 4),
    ]),
    ruleOutCautions: dedupe([
      ...(override.ruleOutCautions || []),
      ...(diagnosis.common_exclusion_ruleout_themes || []).slice(0, 4),
    ]),
    documentationCautions: dedupe([
      ...(override.documentationCautions || []),
      diagnosis.warn_before_upgrading_symptoms_to_diagnosis
        ? 'Preserve symptom-level wording when source support is incomplete.'
        : '',
      diagnosis.outpatient_certainty_caution
        ? `Certainty posture: ${diagnosis.outpatient_certainty_caution}.`
        : '',
    ]),
    mseSignals: dedupe(override.mseSignals || []),
    riskSignals: dedupe(override.riskSignals || []),
    codingHooks: dedupe([
      diagnosis.likely_icd10_family || '',
      ...(diagnosis.common_specifiers_modifiers || []).slice(0, 4),
    ]),
    summary: diagnosis.summary,
    timeframeNotes: diagnosis.timeframe_summary || diagnosis.minimum_duration,
    authority: 'structured-database',
    useMode: 'suggestive-only',
    evidenceConfidence: 'moderate',
    reviewStatus: 'provisional',
    ambiguityFlags: [String(diagnosis.ambiguity_level || '')].filter(Boolean),
    conflictMarkers: diagnosis.common_confusion_with_other_diagnoses || [],
    sourceAttribution: toSourceAttribution(diagnosis.source_links || [], diagnosis.diagnosis_name, 'seed-bundle'),
    retrievalDate: String(diagnosisSeed.meta?.assumed_date_context || '2026-04-21'),
  };
});

export const DIAGNOSIS_CODING_ENTRIES: DiagnosisCodingEntry[] = diagnosisSeed.icd_linkage.map((entry: SeedLinkage) => ({
  id: entry.id,
  label: entry.label,
  diagnosisOrFamily: entry.diagnosis_or_family,
  aliases: dedupe([entry.label, entry.diagnosis_or_family]),
  likelyIcd10Family: entry.likely_icd10_cm_family_linkage,
  specificityIssues: entry.specificity_issues,
  uncertaintyIssues: entry.uncertainty_issues,
  authority: 'structured-database',
  useMode: 'suggestive-only',
  evidenceConfidence: 'moderate',
  reviewStatus: 'provisional',
  ambiguityFlags: [],
  conflictMarkers: [],
  sourceAttribution: toSourceAttribution(entry.source_links || [], entry.label, 'seed-bundle'),
  retrievalDate: String(diagnosisSeed.meta?.assumed_date_context || '2026-04-21'),
}));

export const LEGACY_DIAGNOSIS_CONCEPTS: LegacyDiagnosisConcept[] = DIAGNOSIS_CONCEPTS.map((diagnosis) => ({
  id: diagnosis.id,
  diagnosisName: diagnosis.displayName,
  category: diagnosis.category,
  summary: diagnosis.summary,
  timeframeSummary: diagnosis.timeframeNotes,
  minimumDuration: diagnosis.timeframeNotes,
  commonConfusionWithOtherDiagnoses: diagnosis.overlapFeatures,
  commonSpecifiersModifiers: diagnosis.codingHooks,
  likelyIcd10Family: diagnosis.codingHooks[0],
  sourceLinks: diagnosis.sourceAttribution.map((source) => source.url).filter(Boolean) as string[],
  matchTerms: diagnosis.aliases,
}));

const LEGACY_DIAGNOSIS_BY_ID = new Map(LEGACY_DIAGNOSIS_CONCEPTS.map((diagnosis) => [diagnosis.id, diagnosis]));

export function getLegacyDiagnosisConceptById(id: string) {
  return LEGACY_DIAGNOSIS_BY_ID.get(id);
}

export function mergeDiagnosisConceptReferences(...diagnosisIds: string[]): AssistantReferenceSource[] {
  const seen = new Set<string>();
  return diagnosisIds
    .map((diagnosisId) => getLegacyDiagnosisConceptById(diagnosisId))
    .filter(Boolean)
    .flatMap((diagnosis) => (diagnosis?.sourceLinks || []).map((url) => ({
      label: diagnosis?.diagnosisName || 'Psychiatry reference',
      url,
      sourceType: 'external' as const,
    })))
    .filter((reference) => {
      if (!reference.url || seen.has(reference.url)) {
        return false;
      }
      seen.add(reference.url);
      return true;
    })
    .slice(0, 4);
}

export function hasDiagnosisConceptCue(normalizedMessage: string) {
  return CONCEPT_CUE_PATTERNS.some((pattern) => pattern.test(normalizedMessage));
}

export function looksLikeDiagnosisCodingQuestion(normalizedMessage: string) {
  return /\b(icd|icd-10|icd10|code|coding|billing|billable|cpt|f\d{2}\.?\d*)\b/i.test(normalizedMessage);
}
