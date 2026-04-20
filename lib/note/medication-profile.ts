import { findMedicationByName, getMedicationById } from '@/lib/medications/seed-loader';
import type { StructuredPsychMedicationProfileEntry } from '@/types/session';

export function createEmptyMedicationProfileEntry(): StructuredPsychMedicationProfileEntry {
  return {
    id: `med-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    rawName: '',
    status: 'current',
  };
}

export function normalizeMedicationProfile(
  entries: StructuredPsychMedicationProfileEntry[] | undefined,
): StructuredPsychMedicationProfileEntry[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      const rawName = typeof entry.rawName === 'string' ? entry.rawName : '';
      const rawNameForLookup = rawName.trim();
      const matchedMedication = rawNameForLookup ? findMedicationByName(rawNameForLookup) : null;
      const normalizedMedication = entry.normalizedMedicationId
        ? getMedicationById(entry.normalizedMedicationId)
        : matchedMedication;

      return {
        id: typeof entry.id === 'string' && entry.id.trim() ? entry.id : createEmptyMedicationProfileEntry().id,
        rawName,
        normalizedMedicationId: normalizedMedication?.id,
        normalizedDisplayName: normalizedMedication?.displayName,
        doseText: typeof entry.doseText === 'string' ? entry.doseText : '',
        scheduleText: typeof entry.scheduleText === 'string' ? entry.scheduleText : '',
        route: typeof entry.route === 'string' ? entry.route : '',
        status: entry.status || 'current',
        adherenceNote: typeof entry.adherenceNote === 'string' ? entry.adherenceNote : '',
        sideEffectNote: typeof entry.sideEffectNote === 'string' ? entry.sideEffectNote : '',
        clinicianComment: typeof entry.clinicianComment === 'string' ? entry.clinicianComment : '',
      };
    })
    .filter((entry) => entry.rawName.trim());
}

export function buildMedicationProfilePromptLines(entries: StructuredPsychMedicationProfileEntry[] | undefined) {
  const normalizedEntries = normalizeMedicationProfile(entries);
  if (!normalizedEntries.length) {
    return [];
  }

  return normalizedEntries.map((entry) => {
    const segments = [
      entry.normalizedDisplayName
        ? `${entry.rawName.trim()} (normalized to ${entry.normalizedDisplayName})`
        : `${entry.rawName.trim()} (not yet normalized in the med library)`,
      entry.status ? `status: ${entry.status}` : '',
      entry.doseText?.trim() ? `dose: ${entry.doseText.trim()}` : '',
      entry.scheduleText?.trim() ? `schedule: ${entry.scheduleText.trim()}` : '',
      entry.route?.trim() ? `route: ${entry.route.trim()}` : '',
      entry.adherenceNote?.trim() ? `adherence: ${entry.adherenceNote.trim()}` : '',
      entry.sideEffectNote?.trim() ? `side effects: ${entry.sideEffectNote.trim()}` : '',
      entry.clinicianComment?.trim() ? `comment: ${entry.clinicianComment.trim()}` : '',
    ].filter(Boolean);

    return `- ${segments.join('; ')}.`;
  });
}

export function buildMedicationProfileSummary(entries: StructuredPsychMedicationProfileEntry[] | undefined) {
  return normalizeMedicationProfile(entries).map((entry) => {
    const parts = [
      entry.normalizedDisplayName || entry.rawName,
      entry.doseText?.trim(),
      entry.scheduleText?.trim(),
      entry.status && entry.status !== 'current' ? entry.status : '',
    ].filter(Boolean);

    return parts.join(' | ');
  });
}

export function buildMedicationProfileGapSummary(entries: StructuredPsychMedicationProfileEntry[] | undefined) {
  const normalizedEntries = normalizeMedicationProfile(entries);

  return {
    unresolvedEntries: normalizedEntries.filter((entry) => !entry.normalizedMedicationId && entry.rawName.trim()),
    missingRegimenEntries: normalizedEntries.filter(
      (entry) => entry.normalizedMedicationId && (!entry.doseText?.trim() || !entry.scheduleText?.trim()),
    ),
    missingRouteEntries: normalizedEntries.filter(
      (entry) => entry.normalizedMedicationId && !entry.route?.trim() && entry.status !== 'recently-stopped',
    ),
  };
}

export function hasMedicationProfileUnresolvedEntries(entries: StructuredPsychMedicationProfileEntry[] | undefined) {
  const gapSummary = buildMedicationProfileGapSummary(entries);

  return Boolean(
    gapSummary.unresolvedEntries.length
    || gapSummary.missingRegimenEntries.length
    || gapSummary.missingRouteEntries.length,
  );
}
