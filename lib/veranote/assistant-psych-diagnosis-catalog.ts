import { getPsychiatryDiagnosisBundle } from '@/lib/psychiatry-diagnosis/seed-loader';
import { normalizeDiagnosisLookupKey } from '@/lib/psychiatry-diagnosis/schema';
import type {
  DiagnosisAliasEntry,
  DiagnosisIcdLinkageEntry,
  DiagnosisLibraryEntry,
  DiagnosisTimeframeRule,
  DifferentialCautionEntry,
} from '@/types/psychiatry-diagnosis';
import type { AssistantReferenceSource, AssistantResponsePayload } from '@/types/assistant';

type StructuredDiagnosisMatch = {
  diagnosis: DiagnosisLibraryEntry;
  aliasEntry: DiagnosisAliasEntry | null;
  timeframeRule: DiagnosisTimeframeRule | null;
  differentialCaution: DifferentialCautionEntry | null;
  matchedText: string;
  score: number;
};

type StructuredDiagnosisFamilyMatch = {
  linkage: DiagnosisIcdLinkageEntry;
  matchedText: string;
  score: number;
};

function normalizePhrase(value: string) {
  return normalizeDiagnosisLookupKey(value || '');
}

function containsWholeNormalizedPhrase(text: string, phrase: string) {
  const normalizedText = ` ${normalizePhrase(text)} `;
  const normalizedPhrase = normalizePhrase(phrase);

  if (!normalizedPhrase) {
    return false;
  }

  return normalizedText.includes(` ${normalizedPhrase} `);
}

function containsNormalizedPhraseAlias(text: string, phrases: string[]) {
  return phrases.some((phrase) => containsWholeNormalizedPhrase(text, phrase));
}

function buildPhraseVariants(value: string) {
  const base = value.trim();
  if (!base) {
    return [];
  }

  return Array.from(new Set([
    base,
    base.replaceAll('/', ' '),
    base.replace(/substance\/medication/gi, 'substance'),
    base.replace(/substance\/medication/gi, 'medication'),
    base.replace(/substance\s+medication/gi, 'substance'),
    base.replace(/substance\s+medication/gi, 'medication'),
  ]));
}

function dedupeReferences(links: AssistantReferenceSource[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.url)) {
      return false;
    }
    seen.add(link.url);
    return true;
  });
}

function buildDiagnosisReferences(diagnosis: DiagnosisLibraryEntry) {
  return dedupeReferences(
    diagnosis.source_links.map((url) => ({
      label: diagnosis.diagnosis_name,
      url,
      sourceType: 'external' as const,
    })),
  ).slice(0, 4);
}

function buildFamilyReferences(linkage: DiagnosisIcdLinkageEntry) {
  return dedupeReferences(
    linkage.source_links.map((url) => ({
      label: linkage.label,
      url,
      sourceType: 'external' as const,
    })),
  ).slice(0, 4);
}

function buildDiagnosisCandidates(diagnosis: DiagnosisLibraryEntry, aliasEntry: DiagnosisAliasEntry | null) {
  return [
    ...buildPhraseVariants(diagnosis.diagnosis_name),
    ...diagnosis.aliases,
    ...diagnosis.shorthand,
    ...diagnosis.common_chart_wording,
    ...diagnosis.patient_language_equivalent,
    ...(aliasEntry?.common_provider_wording || []),
    ...(aliasEntry?.shorthand_chart_wording || []),
    ...(aliasEntry?.common_misspellings_variants || []),
  ].filter(Boolean);
}

function buildFamilyCandidates(linkage: DiagnosisIcdLinkageEntry) {
  return [
    linkage.label,
    linkage.diagnosis_or_family,
    linkage.diagnosis_or_family.replaceAll('/', ' '),
    linkage.label.replaceAll('/', ' '),
  ].filter(Boolean);
}

function scoreMatch(normalizedMessage: string, candidate: string, preferredText: string) {
  const normalizedCandidate = normalizePhrase(candidate);
  if (!normalizedCandidate) {
    return 0;
  }

  if (!containsWholeNormalizedPhrase(normalizedMessage, candidate)) {
    return 0;
  }

  let score = normalizedCandidate.length;

  if (normalizePhrase(preferredText) === normalizedCandidate) {
    score += 50;
  }

  if (containsWholeNormalizedPhrase(normalizedMessage, preferredText)) {
    score += 20;
  }
  score += 10;

  return score;
}

function findAliasEntry(diagnosis: DiagnosisLibraryEntry) {
  const diagnosisLookup = normalizePhrase(diagnosis.diagnosis_name);
  return getPsychiatryDiagnosisBundle().alias_map.find(
    (entry) => normalizePhrase(entry.formal_diagnosis) === diagnosisLookup,
  ) || null;
}

function findTimeframeRule(diagnosis: DiagnosisLibraryEntry) {
  const diagnosisLookup = normalizePhrase(diagnosis.diagnosis_name);
  return getPsychiatryDiagnosisBundle().timeframe_rules.find(
    (entry) => normalizePhrase(entry.diagnosis_name) === diagnosisLookup,
  ) || null;
}

function findDifferentialCaution(diagnosis: DiagnosisLibraryEntry) {
  const diagnosisLookup = normalizePhrase(diagnosis.diagnosis_name);
  return getPsychiatryDiagnosisBundle().differential_cautions.find(
    (entry) => normalizePhrase(entry.diagnosis_name) === diagnosisLookup,
  ) || null;
}

export function findStructuredPsychDiagnosisMatch(normalizedMessage: string): StructuredDiagnosisMatch | null {
  const bundle = getPsychiatryDiagnosisBundle();
  const matches: StructuredDiagnosisMatch[] = [];

  for (const diagnosis of bundle.diagnoses) {
    const aliasEntry = findAliasEntry(diagnosis);
    const matchedCandidate = buildDiagnosisCandidates(diagnosis, aliasEntry)
      .map((candidate) => ({
        candidate,
        score: scoreMatch(normalizedMessage, candidate, diagnosis.diagnosis_name),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)[0];

    if (!matchedCandidate) {
      continue;
    }

    matches.push({
      diagnosis,
      aliasEntry,
      timeframeRule: findTimeframeRule(diagnosis),
      differentialCaution: findDifferentialCaution(diagnosis),
      matchedText: matchedCandidate.candidate,
      score: matchedCandidate.score,
    });
  }

  return matches.sort((left, right) => right.score - left.score)[0] || null;
}

const PRIORITY_DIAGNOSIS_IDS = new Set([
  'dx_catatonia',
  'dx_hoarding',
  'dx_bipolar1',
  'dx_bipolar2',
  'dx_specific_learning_disorder',
  'dx_odd',
  'dx_conduct_disorder',
  'dx_premenstrual_dysphoric_disorder',
  'dx_unspecified_anxiety',
  'dx_unspecified_depression',
  'dx_mde',
  'dx_substance_induced_psychotic',
  'dx_substance_induced_depressive',
  'dx_substance_induced_bipolar',
]);

export function findPriorityStructuredPsychDiagnosisMatch(normalizedMessage: string) {
  const match = findStructuredPsychDiagnosisMatch(normalizedMessage);
  if (!match || !PRIORITY_DIAGNOSIS_IDS.has(match.diagnosis.id)) {
    return null;
  }

  const strongPhrases = [
    ...buildPhraseVariants(match.diagnosis.diagnosis_name),
    ...match.diagnosis.aliases,
    ...match.diagnosis.shorthand,
    ...(match.aliasEntry?.common_provider_wording || []),
    ...(match.aliasEntry?.common_misspellings_variants || []),
  ];

  if (!containsNormalizedPhraseAlias(normalizedMessage, strongPhrases)) {
    return null;
  }

  return match;
}

export function findStructuredPsychDiagnosisFamilyMatch(normalizedMessage: string): StructuredDiagnosisFamilyMatch | null {
  const bundle = getPsychiatryDiagnosisBundle();
  const matches: StructuredDiagnosisFamilyMatch[] = [];

  for (const linkage of bundle.icd_linkage) {
    const matchedCandidate = buildFamilyCandidates(linkage)
      .map((candidate) => ({
        candidate,
        score: scoreMatch(normalizedMessage, candidate, linkage.label),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)[0];

    if (!matchedCandidate) {
      continue;
    }

    matches.push({
      linkage,
      matchedText: matchedCandidate.candidate,
      score: matchedCandidate.score,
    });
  }

  return matches.sort((left, right) => right.score - left.score)[0] || null;
}

function buildDiagnosisSuggestions(match: StructuredDiagnosisMatch) {
  const suggestions: string[] = [];

  suggestions.push(
    match.timeframeRule?.minimum_duration_timeframe
      ? `Timeframe matters here: ${match.timeframeRule.minimum_duration_timeframe}`
      : `Timeframe matters here: ${match.diagnosis.timeframe_summary}`,
  );

  suggestions.push(
    match.differentialCaution?.when_app_should_preserve_uncertainty
      ? `Preserve uncertainty when needed: ${match.differentialCaution.when_app_should_preserve_uncertainty}`
      : match.diagnosis.warn_before_upgrading_symptoms_to_diagnosis
        ? 'Keep this as documentation support, not automatic diagnostic hardening.'
        : 'Use the documentation to verify the final diagnosis framing before you finalize the code.',
  );

  suggestions.push(
    match.diagnosis.common_specifiers_modifiers.length
      ? `Common specifiers or modifiers that can change coding: ${match.diagnosis.common_specifiers_modifiers.slice(0, 3).join(', ')}.`
      : `Category: ${match.diagnosis.category}.`,
  );

  if (
    normalizePhrase(match.diagnosis.category) === normalizePhrase('Substance-related and addictive disorders')
    && /alcohol|opioid|cannabis|stimulant|meth|amphetamine|cocaine|substance|medication/.test(normalizedPhrase(match.matchedText))
  ) {
    suggestions.push('Name the specific substance, timing, and whether symptoms are tied to intoxication, withdrawal, or medication exposure before treating this as a final code.');
  }

  return suggestions;
}

function normalizedPhrase(value: string) {
  return normalizePhrase(value);
}

export function buildStructuredPsychDiagnosisCatalogHelp(
  normalizedMessage: string,
  directLead = '',
): AssistantResponsePayload | null {
  const diagnosisMatch = findStructuredPsychDiagnosisMatch(normalizedMessage);

  if (diagnosisMatch) {
    return {
      message: `${directLead}for ${diagnosisMatch.diagnosis.diagnosis_name}, the safest ICD-10-CM path in Atlas right now is the ${diagnosisMatch.diagnosis.likely_icd10_family} family rather than a one-click final code, because documentation details can still change specificity.`,
      suggestions: buildDiagnosisSuggestions(diagnosisMatch),
      references: buildDiagnosisReferences(diagnosisMatch.diagnosis),
    };
  }

  const familyMatch = findStructuredPsychDiagnosisFamilyMatch(normalizedMessage);
  if (!familyMatch) {
    return null;
  }

  return {
    message: `${directLead}for ${familyMatch.linkage.label}, the safest ICD-10-CM path in Atlas right now is ${familyMatch.linkage.likely_icd10_cm_family_linkage}.`,
    suggestions: [
      `Specificity issue: ${familyMatch.linkage.specificity_issues}`,
      `Preserve uncertainty when needed: ${familyMatch.linkage.uncertainty_issues}`,
      `Why Atlas stays conservative here: ${familyMatch.linkage.product_implications_for_diagnosis_suggestion_ui}`,
    ],
    references: buildFamilyReferences(familyMatch.linkage),
  };
}

export function buildPriorityStructuredPsychDiagnosisHelp(
  normalizedMessage: string,
  directLead = '',
): AssistantResponsePayload | null {
  const match = findPriorityStructuredPsychDiagnosisMatch(normalizedMessage);

  if (!match) {
    return null;
  }

  return {
    message: `${directLead}for ${match.diagnosis.diagnosis_name}, the safest ICD-10-CM path in Atlas right now is the ${match.diagnosis.likely_icd10_family} family rather than a one-click final code, because documentation details can still change specificity.`,
    suggestions: buildDiagnosisSuggestions(match),
    references: buildDiagnosisReferences(match.diagnosis),
  };
}
