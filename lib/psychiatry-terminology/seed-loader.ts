import terminologyBundle from '@/data/psych-psychiatry-terminology.seed.json';
import { isPsychiatrySeedBundle, normalizeTerminologyLookupKey } from '@/lib/psychiatry-terminology/schema';
import type {
  PsychiatryAbbreviationEntry,
  PsychiatryAliasEntry,
  PsychiatryAvoidTermEntry,
  PsychiatryMSEEntry,
  PsychiatryRiskLanguageEntry,
  PsychiatrySeedBundle,
} from '@/types/psychiatry-terminology';

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

export function getPsychiatryTerminologyBundle(): PsychiatrySeedBundle {
  if (!isPsychiatrySeedBundle(terminologyBundle)) {
    throw new Error('Psychiatry terminology bundle is malformed.');
  }

  return terminologyBundle;
}

export function suggestAbbreviationExpansion(abbreviation: string) {
  const entry = getPsychiatryTerminologyBundle()
    .abbreviations
    .find((item) => item.abbreviation.toLowerCase() === abbreviation.trim().toLowerCase());

  if (!entry) {
    return null;
  }

  return {
    abbreviation: entry.abbreviation,
    expansion: entry.expansion,
    safeToApply: entry.safe_for_auto_expansion,
    requiresReview: entry.should_trigger_review_warning,
    ambiguityLevel: entry.ambiguity_level,
    alternateMeanings: entry.alternate_meanings_if_ambiguous,
  };
}

export function findAliasEntries(term: string) {
  const lookup = normalizeTerminologyLookupKey(term);
  if (!lookup) {
    return [];
  }

  return getPsychiatryTerminologyBundle().aliases.filter((entry) => {
    const candidates = [
      ...entry.common_provider_wording,
      ...entry.shorthand_chart_wording,
      ...entry.patient_language_equivalent,
      ...entry.common_misspellings_or_variants,
    ];

    return candidates.some((candidate) => normalizeTerminologyLookupKey(candidate) === lookup);
  });
}

export function findAvoidTermsInText(text: string): Array<{ matchedText: string; entry: PsychiatryAvoidTermEntry }> {
  return getPsychiatryTerminologyBundle().terms_to_avoid
    .filter((entry) => includesWholeTerm(text, entry.term))
    .map((entry) => ({
      matchedText: entry.term,
      entry,
    }));
}

export function detectRiskTerms(text: string): Array<{ matchedText: string; entry: PsychiatryRiskLanguageEntry }> {
  const normalizedText = normalizeTerminologyLookupKey(text);

  return getPsychiatryTerminologyBundle().risk_language_library
    .filter((entry) => normalizedText.includes(normalizeTerminologyLookupKey(entry.term)))
    .map((entry) => ({
      matchedText: entry.term,
      entry,
    }));
}

export function findAbbreviationMentionsInText(text: string) {
  const matches: Array<{ matchedText: string; entry: PsychiatryAbbreviationEntry }> = [];

  for (const entry of getPsychiatryTerminologyBundle().abbreviations) {
    if (includesWholeTerm(text, entry.abbreviation)) {
      matches.push({
        matchedText: entry.abbreviation,
        entry,
      });
    }
  }

  return matches;
}

export function findMseTermsInText(text: string): Array<{ matchedText: string; entry: PsychiatryMSEEntry }> {
  const normalizedText = normalizeTerminologyLookupKey(text);

  return getPsychiatryTerminologyBundle().mse_library
    .filter((entry) => normalizedText.includes(normalizeTerminologyLookupKey(entry.term)))
    .map((entry) => ({
      matchedText: entry.term,
      entry,
    }));
}

export function listReviewFirstAbbreviations() {
  return getPsychiatryTerminologyBundle().abbreviations.filter((entry) => entry.should_trigger_review_warning);
}

export function listHighAmbiguityAbbreviations() {
  return getPsychiatryTerminologyBundle().abbreviations.filter((entry) => entry.ambiguity_level === 'high');
}

export function buildAbbreviationMap() {
  return new Map<string, PsychiatryAbbreviationEntry>(
    getPsychiatryTerminologyBundle().abbreviations.map((entry) => [entry.abbreviation.toLowerCase(), entry]),
  );
}

export function buildAvoidTermMap() {
  return new Map<string, PsychiatryAvoidTermEntry>(
    getPsychiatryTerminologyBundle().terms_to_avoid.map((entry) => [normalizeTerminologyLookupKey(entry.term), entry]),
  );
}

export function buildRiskActionMap() {
  return new Map<string, PsychiatryRiskLanguageEntry>(
    getPsychiatryTerminologyBundle().risk_language_library.map((entry) => [normalizeTerminologyLookupKey(entry.term), entry]),
  );
}

export function buildAliasMap() {
  const map = new Map<string, PsychiatryAliasEntry[]>();

  for (const entry of getPsychiatryTerminologyBundle().aliases) {
    const candidates = [
      ...entry.common_provider_wording,
      ...entry.shorthand_chart_wording,
      ...entry.patient_language_equivalent,
      ...entry.common_misspellings_or_variants,
    ];

    for (const candidate of candidates) {
      const key = normalizeTerminologyLookupKey(candidate);
      if (!key) {
        continue;
      }
      const bucket = map.get(key) || [];
      bucket.push(entry);
      map.set(key, bucket);
    }
  }

  return map;
}
