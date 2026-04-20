import diagnosisBundle from '@/data/psych-psychiatry-diagnosis.seed.json';
import { isPsychiatryDiagnosisBundle, normalizeDiagnosisLookupKey } from '@/lib/psychiatry-diagnosis/schema';
import type {
  DifferentialCautionEntry,
  DiagnosisAliasEntry,
  DiagnosisAvoidTermEntry,
  DiagnosisLibraryEntry,
  DiagnosisTimeframeRule,
  PsychiatryDiagnosisSeedBundle,
} from '@/types/psychiatry-diagnosis';

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function includesWholeTerm(text: string, term: string) {
  const trimmed = term.trim();
  if (!trimmed) {
    return false;
  }

  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(trimmed)}(?=$|[^a-z0-9])`, 'i');
  return pattern.test(text);
}

export function getPsychiatryDiagnosisBundle(): PsychiatryDiagnosisSeedBundle {
  if (!isPsychiatryDiagnosisBundle(diagnosisBundle)) {
    throw new Error('Psychiatry diagnosis bundle is malformed.');
  }

  return diagnosisBundle;
}

export function getDiagnosisByName(name: string) {
  const lookup = normalizeDiagnosisLookupKey(name);
  if (!lookup) {
    return null;
  }

  return getPsychiatryDiagnosisBundle().diagnoses.find(
    (entry) => normalizeDiagnosisLookupKey(entry.diagnosis_name) === lookup,
  ) || null;
}

export function getTimeframeRuleForDiagnosis(name: string) {
  const lookup = normalizeDiagnosisLookupKey(name);
  if (!lookup) {
    return null;
  }

  return getPsychiatryDiagnosisBundle().timeframe_rules.find(
    (entry) => normalizeDiagnosisLookupKey(entry.diagnosis_name) === lookup,
  ) || null;
}

export function getDifferentialCautionForDiagnosis(name: string) {
  const lookup = normalizeDiagnosisLookupKey(name);
  if (!lookup) {
    return null;
  }

  return getPsychiatryDiagnosisBundle().differential_cautions.find(
    (entry) => normalizeDiagnosisLookupKey(entry.diagnosis_name) === lookup,
  ) || null;
}

function buildDiagnosisCandidates(entry: DiagnosisLibraryEntry, aliasEntry?: DiagnosisAliasEntry | null) {
  return [
    entry.diagnosis_name,
    ...entry.aliases,
    ...entry.shorthand,
    ...entry.common_chart_wording,
    ...(aliasEntry?.common_provider_wording || []),
    ...(aliasEntry?.shorthand_chart_wording || []),
    ...(aliasEntry?.common_misspellings_variants || []),
  ];
}

export function findDiagnosisMentionsInText(text: string): Array<{
  matchedText: string;
  diagnosis: DiagnosisLibraryEntry;
  aliasEntry: DiagnosisAliasEntry | null;
  timeframeRule: DiagnosisTimeframeRule | null;
  differentialCaution: DifferentialCautionEntry | null;
}> {
  const matches: Array<{
    matchedText: string;
    diagnosis: DiagnosisLibraryEntry;
    aliasEntry: DiagnosisAliasEntry | null;
    timeframeRule: DiagnosisTimeframeRule | null;
    differentialCaution: DifferentialCautionEntry | null;
  }> = [];

  const bundle = getPsychiatryDiagnosisBundle();

  for (const diagnosis of bundle.diagnoses) {
    const aliasEntry = bundle.alias_map.find(
      (entry) => normalizeDiagnosisLookupKey(entry.formal_diagnosis) === normalizeDiagnosisLookupKey(diagnosis.diagnosis_name),
    ) || null;
    const matchedCandidate = buildDiagnosisCandidates(diagnosis, aliasEntry).find((candidate) => includesWholeTerm(text, candidate));

    if (!matchedCandidate) {
      continue;
    }

    matches.push({
      matchedText: matchedCandidate,
      diagnosis,
      aliasEntry,
      timeframeRule: getTimeframeRuleForDiagnosis(diagnosis.diagnosis_name),
      differentialCaution: getDifferentialCautionForDiagnosis(diagnosis.diagnosis_name),
    });
  }

  return matches;
}

export function findDiagnosisAvoidTermsInText(text: string): Array<{ matchedText: string; entry: DiagnosisAvoidTermEntry }> {
  return getPsychiatryDiagnosisBundle().terms_to_avoid
    .filter((entry) => includesWholeTerm(text, entry.term_or_phrase))
    .map((entry) => ({
      matchedText: entry.term_or_phrase,
      entry,
    }));
}

export function findAliasCautionEntries(term: string) {
  const lookup = normalizeDiagnosisLookupKey(term);
  if (!lookup) {
    return [];
  }

  return getPsychiatryDiagnosisBundle().alias_map.filter((entry) => {
    const candidates = [
      entry.formal_diagnosis,
      ...entry.common_provider_wording,
      ...entry.shorthand_chart_wording,
      ...entry.likely_patient_language_equivalent,
      ...entry.common_misspellings_variants,
    ];

    return candidates.some((candidate) => normalizeDiagnosisLookupKey(candidate) === lookup);
  });
}

export function findDiagnosisNonAutoMapTermsInText(text: string): Array<{ matchedText: string; entry: DiagnosisAliasEntry }> {
  const matches: Array<{ matchedText: string; entry: DiagnosisAliasEntry }> = [];

  for (const entry of getPsychiatryDiagnosisBundle().alias_map) {
    const matched = entry.terms_that_should_not_auto_map.find((term) => includesWholeTerm(text, term));
    if (!matched) {
      continue;
    }

    matches.push({
      matchedText: matched,
      entry,
    });
  }

  return matches;
}

const PREFERRED_CATEGORY_ORDER = [
  'Depressive disorders',
  'Bipolar and related disorders',
  'Schizophrenia spectrum and other psychotic disorders',
  'Trauma- and stressor-related disorders',
  'Anxiety disorders',
  'Neurodevelopmental disorders',
  'Substance-related and addictive disorders',
  'Personality disorders',
];

export function listDiagnosisCategoryQuickPicks() {
  const categories = getPsychiatryDiagnosisBundle().taxonomy.map((entry) => entry.category_name);
  const categorySet = new Set(categories);
  const preferred = PREFERRED_CATEGORY_ORDER.filter((item) => categorySet.has(item));
  const remaining = categories.filter((item) => !preferred.includes(item));
  return [...preferred, ...remaining];
}

export function listDiagnosisSuggestions(category?: string) {
  const bundle = getPsychiatryDiagnosisBundle();
  const normalizedCategory = normalizeDiagnosisLookupKey(category || '');

  return bundle.diagnoses
    .filter((entry) => !normalizedCategory || normalizeDiagnosisLookupKey(entry.category) === normalizedCategory)
    .map((entry) => entry.diagnosis_name)
    .sort((left, right) => left.localeCompare(right));
}
