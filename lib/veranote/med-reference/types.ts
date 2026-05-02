export type MedReferenceIntent =
  | 'formulations'
  | 'monitoring'
  | 'safety'
  | 'class_use'
  | 'unsupported';

export type MedReleaseType =
  | 'immediate_release'
  | 'extended_release'
  | 'orally_disintegrating'
  | 'chewable_dispersible'
  | 'solution'
  | 'capsule'
  | 'injection'
  | 'long_acting_injection'
  | 'other';

export type MedReferenceSource = {
  id: string;
  label: string;
  url: string;
  type: 'labeling' | 'reference';
};

export type MedFormulation = {
  label: string;
  route: string;
  releaseType: MedReleaseType;
  strengths: string[];
  notes?: string;
  sourceRefs: string[];
};

export type MedSafetySummary = {
  boxedWarnings: string[];
  majorWarnings: string[];
  monitoring: string[];
  interactionFlags: string[];
};

export type MedClinicalBoundaries = {
  patientSpecificDosingRequiresContext: boolean;
  requiresCurrentReferenceVerification: boolean;
  notForEmergencyUse: boolean;
};

export type PsychMedReferenceEntry = {
  genericName: string;
  brandNames: string[];
  aliases: string[];
  class: string;
  commonPsychUses: string[];
  formulations: MedFormulation[];
  keySafety: MedSafetySummary;
  clinicalBoundaries: MedClinicalBoundaries;
  updatedAt: string;
  sourceRefs: MedReferenceSource[];
};

export type MedReferenceQuery = {
  raw: string;
  normalized: string;
  intent: MedReferenceIntent;
  medication: PsychMedReferenceEntry;
  asksExtendedRelease: boolean;
};

export type MedReferenceAnswer = {
  intent: MedReferenceIntent;
  medication: PsychMedReferenceEntry;
  text: string;
  sourceRefs: MedReferenceSource[];
};
