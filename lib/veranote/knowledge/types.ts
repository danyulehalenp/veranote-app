export type KnowledgeAuthority =
  | 'structured-database'
  | 'seed-bundle'
  | 'workflow-rules'
  | 'trusted-external'
  | 'provider-memory'
  | 'legacy-helper';

export type KnowledgeUseMode =
  | 'suggestive-only'
  | 'workflow-guidance'
  | 'reference-only'
  | 'provider-memory'
  | 'internal-review';

export type KnowledgeEvidenceConfidence = 'low' | 'moderate' | 'high';

export type KnowledgeReviewStatus =
  | 'seeded'
  | 'provisional'
  | 'reviewed'
  | 'internal-only';

export type SourceAttribution = {
  label: string;
  url?: string;
  authority: string;
  kind: 'seed' | 'external' | 'internal';
};

export type KnowledgeIntent =
  | 'coding_help'
  | 'diagnosis_help'
  | 'medication_help'
  | 'substance_help'
  | 'clinical_mse_help'
  | 'workflow_help'
  | 'draft_support'
  | 'reference_help';

export type BaseKnowledgeItem = {
  id: string;
  authority: KnowledgeAuthority;
  useMode: KnowledgeUseMode;
  evidenceConfidence: KnowledgeEvidenceConfidence;
  reviewStatus: KnowledgeReviewStatus;
  ambiguityFlags: string[];
  conflictMarkers: string[];
  sourceAttribution: SourceAttribution[];
  retrievalDate: string;
};

export type DiagnosisConcept = BaseKnowledgeItem & {
  displayName: string;
  category?: string;
  aliases: string[];
  hallmarkFeatures: string[];
  overlapFeatures: string[];
  ruleOutCautions: string[];
  documentationCautions: string[];
  mseSignals: string[];
  riskSignals: string[];
  codingHooks: string[];
  summary?: string;
  timeframeNotes?: string;
};

export type DiagnosisCodingEntry = BaseKnowledgeItem & {
  label: string;
  diagnosisOrFamily: string;
  aliases: string[];
  likelyIcd10Family: string;
  specificityIssues: string;
  uncertaintyIssues: string;
};

export type PsychMedicationConcept = BaseKnowledgeItem & {
  displayName: string;
  genericName: string;
  aliases: string[];
  categories: string[];
  documentationCautions: string[];
  highRiskFlags: string[];
};

export type EmergingDrugConcept = BaseKnowledgeItem & {
  displayName: string;
  streetNames: string[];
  aliases: string[];
  intoxicationSignals: string[];
  withdrawalSignals: string[];
  testingLimitations: string[];
  documentationCautions: string[];
  psychSignals: string[];
  medicalRedFlags: string[];
};

export type WorkflowGuidance = BaseKnowledgeItem & {
  label: string;
  category: 'cpt' | 'medical-necessity' | 'documentation';
  aliases: string[];
  guidance: string[];
  cautions: string[];
};

export type TrustedReference = BaseKnowledgeItem & {
  label: string;
  url: string;
  domain: string;
  categories: string[];
  aliases: string[];
};

export type ProviderMemoryItem = BaseKnowledgeItem & {
  label: string;
  summary: string;
  providerIdentityId?: string;
  memoryType: 'preference' | 'relationship' | 'workflow';
};

export type KnowledgeQuery = {
  text: string;
  intent: KnowledgeIntent;
  limit?: number;
  limitPerDomain?: number;
  includeReferences?: boolean;
  includeMemory?: boolean;
  stage?: 'compose' | 'review';
  noteType?: string;
};

export type KnowledgeBundle = {
  query: KnowledgeQuery;
  matchedIntents: KnowledgeIntent[];
  diagnosisConcepts: DiagnosisConcept[];
  codingEntries: DiagnosisCodingEntry[];
  medicationConcepts: PsychMedicationConcept[];
  emergingDrugConcepts: EmergingDrugConcept[];
  workflowGuidance: WorkflowGuidance[];
  trustedReferences: TrustedReference[];
  memoryItems: ProviderMemoryItem[];
};
