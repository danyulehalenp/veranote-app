export type ClinicalLabSpecialty = 'general_medicine' | 'psychiatry';

export type ClinicalLabSeverity = 'reference' | 'mild' | 'moderate' | 'high' | 'critical';

export type ClinicalLabRange = {
  label: string;
  min?: number;
  max?: number;
  unit: string;
  severity: ClinicalLabSeverity;
  context: string;
};

export type ClinicalLabReference = {
  id: string;
  label: string;
  category: string;
  specialties: ClinicalLabSpecialty[];
  ranges: ClinicalLabRange[];
  urgentRedFlags: string[];
  missingContextPrompts: string[];
  conservativeDecisionSupport: string;
  sourceRefs: string[];
  safetyNotes: string[];
};

export type ClinicalLabInterpretation = {
  reference: ClinicalLabReference;
  range: ClinicalLabRange | null;
  value: number | null;
  rangeContext: string;
  classificationText: string | null;
};
