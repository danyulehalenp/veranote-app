export type DiagnosisAmbiguityLevel = 'low' | 'moderate' | 'high';

export type DiagnosisSeedMetadata = {
  project: string;
  assumed_date_context: string;
  notes: string[];
  source_registry: string[];
};

export type DiagnosisTaxonomyEntry = {
  id: string;
  type: 'taxonomy';
  category_name: string;
  short_description: string;
  representative_diagnoses: string[];
  common_provider_aliases_shorthand: string[];
  common_symptom_clusters: string[];
  timeframe_duration_themes: string;
  differential_confusion_areas: string[];
  likely_icd10_cm_family_linkage: string[];
  source_links: string[];
};

export type DiagnosisLibraryEntry = {
  id: string;
  type: 'diagnosis';
  diagnosis_name: string;
  category: string;
  aliases: string[];
  shorthand: string[];
  patient_language_equivalent: string[];
  summary: string;
  timeframe_summary: string;
  minimum_duration: string;
  episodic_pattern: string;
  common_specifiers_modifiers: string[];
  common_exclusion_ruleout_themes: string[];
  common_confusion_with_other_diagnoses: string[];
  common_chart_wording: string[];
  outpatient_certainty_caution: DiagnosisAmbiguityLevel | string;
  warn_before_upgrading_symptoms_to_diagnosis: boolean;
  likely_icd10_family: string;
  source_links: string[];
  ambiguity_level: DiagnosisAmbiguityLevel | string;
};

export type DiagnosisTimeframeRule = {
  id: string;
  type: 'timeframe_rule';
  diagnosis_name: string;
  minimum_duration_timeframe: string;
  episodic_structure: string;
  why_timeframe_matters_for_documentation_safety: string;
  common_product_failure_mode_if_ignored: string;
  source_links: string[];
};

export type DiagnosisAliasEntry = {
  id: string;
  type: 'alias_map';
  formal_diagnosis: string;
  category: string;
  common_provider_wording: string[];
  shorthand_chart_wording: string[];
  likely_patient_language_equivalent: string[];
  common_misspellings_variants: string[];
  terms_that_should_not_auto_map: string[];
  ambiguity_level: DiagnosisAmbiguityLevel | string;
  source_links: string[];
};

export type DifferentialCautionEntry = {
  id: string;
  type: 'differential_caution';
  diagnosis_name: string;
  commonly_confused_alternatives: string[];
  what_makes_documentation_risky: string;
  when_app_should_preserve_uncertainty: string;
  when_app_should_avoid_upgrading_symptoms_into_diagnosis: string;
  inpatient_vs_outpatient_certainty_differences: string;
  source_links: string[];
};

export type DiagnosisSpecifierEntry = {
  id: string;
  type: 'specifier_modifier';
  modifier: string;
  meaning: string;
  commonly_applies_to: string[];
  documentation_risk: string;
  safe_for_automatic_suggestion_or_review_only: string;
  source_links: string[];
};

export type DiagnosisIcdLinkageEntry = {
  id: string;
  type: 'icd_linkage';
  label: string;
  diagnosis_or_family: string;
  likely_icd10_cm_family_linkage: string;
  specificity_issues: string;
  uncertainty_issues: string;
  product_implications_for_diagnosis_suggestion_ui: string;
  source_links: string[];
};

export type DiagnosisAvoidTermEntry = {
  id: string;
  type: 'terms_to_avoid';
  term_or_phrase: string;
  why_risky: string;
  safer_alternative_or_handling: string;
  product_action: string;
  source_links: string[];
};

export type DiagnosisProductDesignEntry = {
  id: string;
  library_name: string;
  purpose: string;
  required_fields: string[];
  provider_visible_or_internal_only: string;
  safe_for_auto_suggestion_or_review_only: string;
  editable_later: boolean;
};

export type PsychiatryDiagnosisSeedBundle = {
  meta: DiagnosisSeedMetadata;
  executive_summary: string[];
  concise_narrative_summary: string;
  taxonomy: DiagnosisTaxonomyEntry[];
  diagnoses: DiagnosisLibraryEntry[];
  timeframe_rules: DiagnosisTimeframeRule[];
  alias_map: DiagnosisAliasEntry[];
  differential_cautions: DifferentialCautionEntry[];
  specifier_library: DiagnosisSpecifierEntry[];
  icd_linkage: DiagnosisIcdLinkageEntry[];
  terms_to_avoid: DiagnosisAvoidTermEntry[];
  product_design: DiagnosisProductDesignEntry[];
  final_guidance: string[];
};
