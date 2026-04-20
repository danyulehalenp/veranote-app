import { findAliasCautionEntries, getDiagnosisByName } from '@/lib/psychiatry-diagnosis/seed-loader';
import { normalizeDiagnosisLookupKey } from '@/lib/psychiatry-diagnosis/schema';
import type { StructuredPsychDiagnosisProfileEntry } from '@/types/session';

export function createEmptyDiagnosisProfileEntry(): StructuredPsychDiagnosisProfileEntry {
  return {
    id: `diagnosis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    rawLabel: '',
    status: 'current-working',
    certainty: 'unclear',
  };
}

function normalizeDiagnosisProfileEntry(entry: StructuredPsychDiagnosisProfileEntry): StructuredPsychDiagnosisProfileEntry {
  const rawLabel = typeof entry.rawLabel === 'string' ? entry.rawLabel : '';
  const rawLabelForLookup = rawLabel.trim();
  if (!rawLabelForLookup) {
    return {
      ...entry,
      rawLabel,
      normalizedDiagnosisId: undefined,
      normalizedDisplayName: undefined,
      category: undefined,
    };
  }

  const directMatch = getDiagnosisByName(rawLabelForLookup);
  const aliasMatches = directMatch ? [] : findAliasCautionEntries(rawLabelForLookup);
  const aliasMatch = aliasMatches.length === 1 ? getDiagnosisByName(aliasMatches[0].formal_diagnosis) : null;
  const resolved = directMatch || aliasMatch;

  return {
    ...entry,
    rawLabel,
    normalizedDiagnosisId: resolved?.id,
    normalizedDisplayName: resolved?.diagnosis_name,
    category: resolved?.category,
    timeframeNote: typeof entry.timeframeNote === 'string' ? entry.timeframeNote : undefined,
    evidenceNote: typeof entry.evidenceNote === 'string' ? entry.evidenceNote : undefined,
    clinicianComment: typeof entry.clinicianComment === 'string' ? entry.clinicianComment : undefined,
  };
}

export function normalizeDiagnosisProfile(
  entries: StructuredPsychDiagnosisProfileEntry[] | undefined | null,
): StructuredPsychDiagnosisProfileEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => normalizeDiagnosisProfileEntry(entry))
    .filter((entry) =>
      entry.rawLabel.trim()
      || entry.familyFocus?.trim()
      || entry.timeframeNote?.trim()
      || entry.evidenceNote?.trim()
      || entry.clinicianComment?.trim(),
    );
}

export function buildDiagnosisProfileSummary(entries: StructuredPsychDiagnosisProfileEntry[] | undefined | null) {
  return normalizeDiagnosisProfile(entries)
    .filter((entry) => entry.rawLabel.trim())
    .map((entry) => {
    const parts = [entry.normalizedDisplayName || entry.rawLabel.trim()];

    if (entry.status) {
      parts.push(entry.status.replace(/-/g, ' '));
    }

    if (entry.certainty && entry.certainty !== 'unclear') {
      parts.push(`${entry.certainty} certainty`);
    }

    if (entry.timeframeNote?.trim()) {
      parts.push(entry.timeframeNote.trim());
    }

      return parts.join(' | ');
    });
}

export function buildDiagnosisProfilePromptLines(entries: StructuredPsychDiagnosisProfileEntry[] | undefined | null) {
  return normalizeDiagnosisProfile(entries)
    .filter((entry) => entry.rawLabel.trim())
    .map((entry) => {
    const parts = [
      `Diagnosis/profile label: ${entry.normalizedDisplayName || entry.rawLabel}`,
      `status=${entry.status || 'current-working'}`,
      `certainty=${entry.certainty || 'unclear'}`,
    ];

    if (entry.category) {
      parts.push(`category=${entry.category}`);
    }

    if (entry.familyFocus?.trim()) {
      parts.push(`family focus=${entry.familyFocus.trim()}`);
    }

    if (entry.timeframeNote?.trim()) {
      parts.push(`timeframe note=${entry.timeframeNote.trim()}`);
    }

    if (entry.evidenceNote?.trim()) {
      parts.push(`evidence note=${entry.evidenceNote.trim()}`);
    }

    if (entry.clinicianComment?.trim()) {
      parts.push(`clinician comment=${entry.clinicianComment.trim()}`);
    }

      return `- ${parts.join(' | ')}`;
    });
}

export function hasDiagnosisProfileUnresolvedEntries(entries: StructuredPsychDiagnosisProfileEntry[] | undefined | null) {
  return normalizeDiagnosisProfile(entries).some((entry) => {
    if (entry.normalizedDiagnosisId) {
      return false;
    }

    const lookup = normalizeDiagnosisLookupKey(entry.rawLabel.trim());
    return Boolean(lookup);
  });
}
