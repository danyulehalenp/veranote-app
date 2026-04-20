import type { PsychiatryDiagnosisSeedBundle } from '@/types/psychiatry-diagnosis';

export function normalizeDiagnosisLookupKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function isPsychiatryDiagnosisBundle(value: unknown): value is PsychiatryDiagnosisSeedBundle {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PsychiatryDiagnosisSeedBundle>;

  return (
    !!candidate.meta
    && Array.isArray(candidate.taxonomy)
    && Array.isArray(candidate.diagnoses)
    && Array.isArray(candidate.timeframe_rules)
    && Array.isArray(candidate.alias_map)
    && Array.isArray(candidate.differential_cautions)
    && Array.isArray(candidate.specifier_library)
    && Array.isArray(candidate.icd_linkage)
    && Array.isArray(candidate.terms_to_avoid)
    && Array.isArray(candidate.product_design)
  );
}
