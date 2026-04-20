export type TerminologyAmbiguityLevel = 'low' | 'moderate' | 'high';
export type TerminologyDataOrigin = 'reported' | 'observed' | 'inferred';
export type TerminologyCareSetting = 'cross-setting' | 'inpatient' | 'outpatient' | 'telehealth' | 'therapy';
export type TerminologyStatus =
  | 'standard clinical term'
  | 'common chart shorthand'
  | 'colloquial/local jargon'
  | 'outdated/discouraged';

export type RiskAction =
  | 'allow_silently'
  | 'highlight_for_review'
  | 'warn_against_strengthening'
  | 'warn_against_softening';

export type AvoidTermAction =
  | 'warning'
  | 'rewrite_suggestion'
  | 'internal_normalization_only';

export type PsychiatrySeedMetadata = {
  project: string;
  version: string;
  date_context_assumed_by_user: string;
  scope_note: string;
  important_constraints: string[];
  source_hierarchy: string[];
  counts: {
    lexicon_terms: number;
    abbreviations: number;
    mse_items: number;
    risk_language_items: number;
    alias_mappings: number;
    terms_to_avoid: number;
    source_documents: number;
  };
};

export type PsychiatrySourceReference = {
  title: string;
  url: string;
  authority: string;
  notes: string;
};

export type PsychiatryLexiconEntry = {
  id: string;
  type: 'lexicon';
  family: string;
  term: string;
  category: string;
  definition: string;
  common_documentation_meaning: string;
  plain_language: string | null;
  confusion_risks: string[];
  terminology_status: TerminologyStatus;
  care_setting: TerminologyCareSetting[];
  data_origin: TerminologyDataOrigin;
  ambiguity_level: TerminologyAmbiguityLevel;
  review_flag: boolean;
  notes: string | null;
  source_links: string[];
  source_basis: string[];
};

export type PsychiatryAbbreviationEntry = {
  id: string;
  type: 'abbreviation';
  abbreviation: string;
  expansion: string;
  category: string;
  psych_context_meaning: string;
  alternate_meanings_if_ambiguous: string[];
  safe_for_auto_expansion: boolean;
  should_trigger_review_warning: boolean;
  most_common_setting: TerminologyCareSetting | string;
  ambiguity_level: TerminologyAmbiguityLevel;
  terminology_status: TerminologyStatus;
  notes: string | null;
  source_links: string[];
  source_basis: string[];
};

export type PsychiatryMSEEntry = {
  id: string;
  type: 'mse';
  domain: string;
  term: string;
  concise_definition: string;
  typical_chart_use: string;
  important_distinctions_from_similar_terms: string[];
  overstatement_risks: string[];
  understatement_risks: string[];
  should_trigger_extra_review: boolean;
  notes: string | null;
  source_links: string[];
  source_basis: string[];
};

export type PsychiatryRiskLanguageEntry = {
  id: string;
  type: 'risk_language';
  category: string;
  term: string;
  meaning: string;
  distinctions_from_similar_terms: string[];
  common_misuse_risks: string[];
  veranote_action: RiskAction;
  notes: string | null;
  source_links: string[];
  source_basis: string[];
};

export type PsychiatryAliasEntry = {
  id: string;
  type: 'alias';
  category: string;
  formal_term: string;
  common_provider_wording: string[];
  shorthand_chart_wording: string[];
  patient_language_equivalent: string[];
  common_misspellings_or_variants: string[];
  terms_that_should_not_auto_map: string[];
  notes: string | null;
  source_links: string[];
  source_basis: string[];
};

export type PsychiatryAvoidTermEntry = {
  id: string;
  type: 'avoid_term';
  term: string;
  category: string;
  why_risky: string;
  safer_alternative: string;
  recommended_system_action: AvoidTermAction;
  notes: string | null;
  source_links: string[];
  source_basis: string[];
};

export type PsychiatrySeedBundle = {
  metadata: PsychiatrySeedMetadata;
  sources: PsychiatrySourceReference[];
  lexicon: PsychiatryLexiconEntry[];
  abbreviations: PsychiatryAbbreviationEntry[];
  mse_library: PsychiatryMSEEntry[];
  risk_language_library: PsychiatryRiskLanguageEntry[];
  aliases: PsychiatryAliasEntry[];
  terms_to_avoid: PsychiatryAvoidTermEntry[];
  product_design_recommendations: Array<{
    library: string;
    purpose: string;
    required_fields: string[];
    editable_later: boolean;
    provider_visible_or_internal_only: string;
  }>;
  setting_modifier_examples: Array<{
    setting: TerminologyCareSetting;
    term_or_abbreviation: string;
    preferred_interpretation: string;
    do_not_auto_map: boolean;
    risk_threshold_modifier: string;
    notes: string;
  }>;
  json_ready_schema: Record<string, unknown>;
};
