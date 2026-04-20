import medicationBundle from '@/data/psych-medication-library.seed.json';
import warningBundle from '@/data/psych-medication-warning-rules.seed.json';
import { indexMedicationNames, isMedicationLibraryBundle, normalizeMedicationToken } from '@/lib/medications/schema';
import type { MedicationLibraryBundle, PsychMedicationEntry } from '@/types/medication';
import type { MedicationWarningBundle } from '@/types/medication-warning';

export function getPsychMedicationLibrary(): MedicationLibraryBundle {
  if (!isMedicationLibraryBundle(medicationBundle)) {
    throw new Error('Psych medication library bundle is malformed.');
  }

  return medicationBundle;
}

export function getPsychMedicationWarningBundle() {
  return warningBundle as MedicationWarningBundle;
}

export function findMedicationByName(term: string) {
  const bundle = getPsychMedicationLibrary();
  const index = indexMedicationNames(bundle);
  return index.get(normalizeMedicationToken(term)) || null;
}

export function listPsychMedications() {
  return getPsychMedicationLibrary().medications;
}

export function getMedicationById(id: string): PsychMedicationEntry | null {
  return getPsychMedicationLibrary().medications.find((item) => item.id === id) || null;
}

export function findMedicationMentionsInText(text: string) {
  const normalizedText = ` ${normalizeMedicationToken(text)} `;
  const matchedMedicationIds = new Set<string>();
  const matchedTerms = new Set<string>();

  for (const medication of getPsychMedicationLibrary().medications) {
    const candidateTerms = [
      medication.displayName,
      medication.genericName,
      ...medication.brandNames,
      ...medication.commonAliases,
      ...medication.commonAbbreviations,
    ];

    for (const candidate of candidateTerms) {
      const normalizedCandidate = normalizeMedicationToken(candidate);
      if (!normalizedCandidate) {
        continue;
      }

      if (normalizedText.includes(` ${normalizedCandidate} `)) {
        matchedMedicationIds.add(medication.id);
        matchedTerms.add(candidate);
      }
    }
  }

  return {
    medicationIds: [...matchedMedicationIds],
    matchedTerms: [...matchedTerms],
  };
}
