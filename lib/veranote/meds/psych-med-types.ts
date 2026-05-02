export type PsychMedicationAnswerIntent =
  | 'starting_dose'
  | 'usual_range'
  | 'formulation_lookup'
  | 'side_effects'
  | 'monitoring'
  | 'lab_level_interpretation'
  | 'interaction_check'
  | 'switching_framework'
  | 'pregnancy_lactation'
  | 'geriatric_caution'
  | 'renal_hepatic_caution'
  | 'med_class_lookup'
  | 'starts_with_lookup'
  | 'documentation_wording'
  | 'unknown';

export type PsychMedicationSeverity = 'low' | 'moderate' | 'high' | 'critical';

export type PsychMedicationSpecialPopulations = {
  pregnancy?: string;
  lactation?: string;
  geriatric?: string;
  pediatric?: string;
  hepatic?: string;
  renal?: string;
};

export type PsychMedicationProfile = {
  id: string;
  genericName: string;
  brandNames: string[];
  class: string;
  subclass?: string;
  commonUses: string[];
  typicalAdultStartingDose?: string;
  typicalAdultRange?: string;
  maxDoseNotes?: string;
  availableStrengths: string[];
  dosageForms: string[];
  routeForms: string[];
  keyAdverseEffects: string[];
  highRiskWarnings: string[];
  majorContraindicationsOrCautions: string[];
  monitoring: string[];
  highYieldInteractions: string[];
  specialPopulations: PsychMedicationSpecialPopulations;
  clinicalPearls: string[];
  documentationPearls: string[];
  verificationRequiredFor: string[];
  aliases?: string[];
};

export type PsychMedicationInteractionRule = {
  id: string;
  trigger: {
    drugIds?: string[];
    classes?: string[];
    combinedWith?: string[];
  };
  severity: PsychMedicationSeverity;
  shortWarning: string;
  clinicalReason: string;
  recommendedCheck: string;
  veraResponseInstruction: string;
};

export type PsychMedicationInteractionMatch = {
  rule: PsychMedicationInteractionRule;
  matchedDrugIds: string[];
  matchedTerms: string[];
};

export type PsychMedicationSwitchStrategyType =
  | 'direct_switch'
  | 'taper_then_switch'
  | 'cross_taper'
  | 'taper_washout_switch'
  | 'washout_required'
  | 'overlap_bridge'
  | 'oral_to_lai_transition'
  | 'taper_only'
  | 'specialist_reference_required'
  | 'avoid_cross_taper';

export type PsychMedicationSwitchStrategy = {
  id: PsychMedicationSwitchStrategyType;
  label: string;
  description: string;
  whenUsed: string[];
  safetyNotes: string[];
  monitoring: string[];
  verificationRequired: string[];
};

export type PsychMedicationSwitchRule = {
  id: string;
  severity: PsychMedicationSeverity;
  strategy: PsychMedicationSwitchStrategyType;
  summary: string;
  appliesWhen: string[];
  doNotLine: string;
  monitoring: string[];
  verificationRequired: string[];
};

export type PsychMedicationAnswer = {
  intent: PsychMedicationAnswerIntent;
  medication?: PsychMedicationProfile | null;
  matchedMedications?: PsychMedicationProfile[];
  text: string;
  interactionMatches?: PsychMedicationInteractionMatch[];
  switchStrategy?: PsychMedicationSwitchStrategy | null;
  switchRuleIds?: string[];
  fromMedication?: PsychMedicationProfile | null;
  toMedication?: PsychMedicationProfile | null;
};
