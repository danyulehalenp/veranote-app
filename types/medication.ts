export type PsychMedicationCategory =
  | 'antidepressant'
  | 'antipsychotic'
  | 'mood-stabilizer'
  | 'stimulant'
  | 'non-stimulant-adhd'
  | 'anxiolytic'
  | 'hypnotic-sedative'
  | 'substance-use-treatment'
  | 'sleep-agent'
  | 'movement-side-effect-treatment'
  | 'alpha-agonist'
  | 'beta-blocker'
  | 'other-psych';

export type MedicationEvidenceTier =
  | 'authoritative-monograph'
  | 'structured-database'
  | 'clinical-reference'
  | 'product-curated';

export type MedicationSourceStatus =
  | 'provisional_unverified'
  | 'attached_current_label_pointer'
  | 'attached_supporting_extract'
  | 'needs_human_review'
  | 'unknown';

export type MedicationInteractionSeverity =
  | 'major'
  | 'moderate'
  | 'minor'
  | 'monitor'
  | 'unknown';

export type MedicationPregnancyRiskLevel =
  | 'unknown'
  | 'use-caution'
  | 'avoid-if-possible'
  | 'specialist-review';

export type MedicationFormulation = {
  label: string;
  route?: string;
  dosageForms?: string[];
  releaseTypes?: string[];
};

export type MedicationMonitoringItem = {
  label: string;
  rationale?: string;
  cadence?: string;
};

export type MedicationInteractionRule = {
  id: string;
  withMedicationNames?: string[];
  withClasses?: string[];
  severity: MedicationInteractionSeverity;
  mechanismSummary: string;
  clinicalConcern: string;
  suggestedAction?: string;
};

export type PsychMedicationEntry = {
  id: string;
  displayName: string;
  genericName: string;
  brandNames: string[];
  commonAliases: string[];
  commonAbbreviations: string[];
  categories: PsychMedicationCategory[];
  seedPrimaryClass?: string;
  seedSecondaryClass?: string;
  classFamily: string;
  subclass?: string;
  controlledSubstanceSchedule: string;
  isLai: boolean;
  sourceStatus: MedicationSourceStatus;
  usMarketStatus?: string;
  provisional: boolean;
  indications: string[];
  formulations: MedicationFormulation[];
  commonDoseUnits: string[];
  commonScheduleTerms: string[];
  blackBoxSummary?: string;
  pregnancyRisk: MedicationPregnancyRiskLevel;
  lactationSummary?: string;
  renalConsiderations?: string;
  hepaticConsiderations?: string;
  highRiskFlags: string[];
  commonAdverseEffects: string[];
  highRiskAdverseEffects: string[];
  monitoring: MedicationMonitoringItem[];
  interactionRules: MedicationInteractionRule[];
  notesForDocumentation?: string[];
  evidenceTier: MedicationEvidenceTier;
  normalization: {
    priorityBucket?: string;
    rxnormSearchTerm?: string;
    rxnormCui?: string;
    rxnormTermType?: string;
    rxnormName?: string;
    normalizationLevel?: string;
    productFamilyTarget?: string;
    dailymedSetid?: string;
    dailymedTitle?: string;
    normalizationStatus?: string;
    unresolvedGap?: string;
  };
  sourceReview: {
    sourceDocumentIds: string[];
    fieldSourceCount: number;
  };
  sourceLinks: string[];
  sourceTitles?: string[];
};

export type MedicationLibraryBundle = {
  libraryVersion: string;
  generatedAt: string;
  sourceSummary: string[];
  medications: PsychMedicationEntry[];
};
