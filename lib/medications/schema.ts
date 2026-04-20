import type {
  MedicationLibraryBundle,
  PsychMedicationCategory,
  PsychMedicationEntry,
} from '@/types/medication';

export const MEDICATION_LIBRARY_IMPORT_VERSION = 'veranote-psych-med-v1';

export const PSYCH_MEDICATION_CATEGORIES: PsychMedicationCategory[] = [
  'antidepressant',
  'antipsychotic',
  'mood-stabilizer',
  'stimulant',
  'non-stimulant-adhd',
  'anxiolytic',
  'hypnotic-sedative',
  'substance-use-treatment',
  'sleep-agent',
  'movement-side-effect-treatment',
  'alpha-agonist',
  'beta-blocker',
  'other-psych',
];

export function createEmptyMedicationLibraryBundle(): MedicationLibraryBundle {
  return {
    libraryVersion: MEDICATION_LIBRARY_IMPORT_VERSION,
    generatedAt: new Date(0).toISOString(),
    sourceSummary: [],
    medications: [],
  };
}

export function isMedicationLibraryBundle(value: unknown): value is MedicationLibraryBundle {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MedicationLibraryBundle>;

  return (
    typeof candidate.libraryVersion === 'string'
    && typeof candidate.generatedAt === 'string'
    && Array.isArray(candidate.sourceSummary)
    && Array.isArray(candidate.medications)
  );
}

export function validateMedicationEntry(entry: PsychMedicationEntry) {
  const issues: string[] = [];

  if (!entry.id.trim()) {
    issues.push('Medication entry is missing id.');
  }

  if (!entry.genericName.trim()) {
    issues.push(`Medication ${entry.id || '(unknown)'} is missing genericName.`);
  }

  if (!Array.isArray(entry.categories) || entry.categories.length === 0) {
    issues.push(`Medication ${entry.genericName || entry.id} is missing categories.`);
  }

  if (!entry.classFamily.trim()) {
    issues.push(`Medication ${entry.genericName || entry.id} is missing classFamily.`);
  }

  if (!Array.isArray(entry.highRiskFlags)) {
    issues.push(`Medication ${entry.genericName || entry.id} is missing highRiskFlags.`);
  }

  if (!Array.isArray(entry.sourceLinks) || entry.sourceLinks.length === 0) {
    issues.push(`Medication ${entry.genericName || entry.id} is missing sourceLinks.`);
  }

  return issues;
}

export function indexMedicationNames(bundle: MedicationLibraryBundle) {
  const index = new Map<string, PsychMedicationEntry>();

  for (const medication of bundle.medications) {
    const names = [
      medication.genericName,
      ...medication.brandNames,
      ...medication.commonAliases,
      ...medication.commonAbbreviations,
    ];

    for (const name of names) {
      const normalized = normalizeMedicationToken(name);
      if (!normalized || index.has(normalized)) {
        continue;
      }
      index.set(normalized, medication);
    }
  }

  return index;
}

export function normalizeMedicationToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
