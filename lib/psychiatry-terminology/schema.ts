import type { PsychiatrySeedBundle } from '@/types/psychiatry-terminology';

export const PSYCHIATRY_TERMINOLOGY_IMPORT_VERSION = 'veranote-psych-terminology-v1';

export function isPsychiatrySeedBundle(value: unknown): value is PsychiatrySeedBundle {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PsychiatrySeedBundle>;
  return (
    typeof candidate.metadata === 'object'
    && Array.isArray(candidate.sources)
    && Array.isArray(candidate.lexicon)
    && Array.isArray(candidate.abbreviations)
    && Array.isArray(candidate.mse_library)
    && Array.isArray(candidate.risk_language_library)
    && Array.isArray(candidate.aliases)
    && Array.isArray(candidate.terms_to_avoid)
  );
}

export function normalizeTerminologyLookupKey(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
