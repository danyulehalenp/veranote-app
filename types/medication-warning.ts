export type MedicationWarningSeverity = 'hard_stop' | 'major' | 'moderate' | 'info';

export type MedicationWarningEvidenceBasis =
  | 'source_backed_label_anchor'
  | 'source_backed_identity_anchor'
  | 'guideline_needed'
  | 'provisional_seed_logic';

export type MedicationWarningRuleSeed = {
  ruleId: string;
  status: string;
  severity: MedicationWarningSeverity;
  category: string;
  triggerDescription: string;
  actionSummary: string;
  medicationTags: string[];
  medicationIds: string[];
  contextInputs: string[];
  filters: Record<string, string>;
  evidenceBasis: MedicationWarningEvidenceBasis;
  sourceDocumentIds: string[];
  provisional: boolean;
  sourceBacked: boolean;
};

export type MedicationWarningBundle = {
  libraryVersion: string;
  generatedAt: string;
  sourceSummary: string[];
  rules: MedicationWarningRuleSeed[];
};

export type MedicationRuntimeInput = {
  activeMedicationIds: string[];
  recentMedicationIds?: string[];
  activeMedicationTags?: string[];
  recentMedicationTags?: string[];
  context: Record<string, unknown>;
};

export type EmittedMedicationWarning = {
  code: string;
  severity: MedicationWarningSeverity;
  title: string;
  summary: string;
  whyTriggered: string[];
  actions: string[];
  evidenceBasis: MedicationWarningEvidenceBasis;
  sourceDocumentIds: string[];
  medicationIds: string[];
  missingInputs: string[];
  requiresClinicianReview: boolean;
  provisional: boolean;
};
