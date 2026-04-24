export type RiskCategory = 'suicide' | 'violence' | 'grave_disability';
export type RiskSubtype =
  | 'passive_ideation'
  | 'active_ideation'
  | 'plan'
  | 'intent'
  | 'prior_attempts'
  | 'threats'
  | 'aggression'
  | 'impulsivity'
  | 'self_care_failure'
  | 'disorganized_behavior'
  | 'unsafe_environment';

export type RiskLanguageConcept = {
  id: string;
  category: RiskCategory;
  subtype: RiskSubtype;
  detectionKeywords: string[];
  confidenceLevel: 'low' | 'moderate' | 'high';
  documentationCaution: string;
};

export const RISK_LANGUAGE_CONCEPTS: RiskLanguageConcept[] = [
  {
    id: 'suicide_passive_ideation',
    category: 'suicide',
    subtype: 'passive_ideation',
    detectionKeywords: ['passive si', 'passive suicidal', 'wish i would not wake up', 'wish i was dead', 'wish i could disappear', 'better off dead'],
    confidenceLevel: 'moderate',
    documentationCaution: 'Passive death-wish language should not be flattened into either no risk or active intent.',
  },
  {
    id: 'suicide_active_ideation',
    category: 'suicide',
    subtype: 'active_ideation',
    detectionKeywords: ['suicidal ideation', 'active si', 'wants to kill self', 'wants to die', 'kill myself', 'goodbye text', 'goodbye texts'],
    confidenceLevel: 'high',
    documentationCaution: 'Document active ideation exactly as reported without adding plan or intent unless supported.',
  },
  {
    id: 'suicide_plan',
    category: 'suicide',
    subtype: 'plan',
    detectionKeywords: ['plan to overdose', 'suicide plan', 'planned to hang', 'planned to shoot', 'has a plan'],
    confidenceLevel: 'high',
    documentationCaution: 'Plan language should stay specific and source-bound; do not broaden a vague statement into a detailed plan.',
  },
  {
    id: 'suicide_intent',
    category: 'suicide',
    subtype: 'intent',
    detectionKeywords: ['intent to die', 'wants to act on it', 'means to do it tonight', 'unable to contract for safety', 'do not trust myself', "don't trust myself", 'does not trust herself', 'does not trust himself'],
    confidenceLevel: 'high',
    documentationCaution: 'Intent should only be documented when the source clearly supports intent rather than passive ideation alone.',
  },
  {
    id: 'suicide_prior_attempts',
    category: 'suicide',
    subtype: 'prior_attempts',
    detectionKeywords: ['suicide attempt', 'attempted overdose', 'attempted hanging', 'prior overdose', 'previous attempt'],
    confidenceLevel: 'high',
    documentationCaution: 'Past attempt history supports risk context but does not by itself prove current intent.',
  },
  {
    id: 'violence_threats',
    category: 'violence',
    subtype: 'threats',
    detectionKeywords: ['threatened to hurt', 'homicidal ideation', 'violent threats', 'threatened staff'],
    confidenceLevel: 'high',
    documentationCaution: 'Threat language should stay attributed and should not be escalated into intent unless the source says so.',
  },
  {
    id: 'violence_aggression',
    category: 'violence',
    subtype: 'aggression',
    detectionKeywords: ['aggressive', 'combative', 'assaultive', 'hit staff', 'kicked staff'],
    confidenceLevel: 'moderate',
    documentationCaution: 'Aggression history should not be rewritten into future intent without explicit support.',
  },
  {
    id: 'violence_impulsivity',
    category: 'violence',
    subtype: 'impulsivity',
    detectionKeywords: ['impulsive', 'poor impulse control', 'rage', 'unable to control anger'],
    confidenceLevel: 'low',
    documentationCaution: 'Impulsivity can raise concern but is not equivalent to homicidal intent.',
  },
  {
    id: 'grave_disability_self_care',
    category: 'grave_disability',
    subtype: 'self_care_failure',
    detectionKeywords: ['not eating', 'not showering', 'poor hygiene', 'unable to care for self', 'not taking meds and cannot manage self-care'],
    confidenceLevel: 'moderate',
    documentationCaution: 'Self-care failure should stay concrete; do not generalize into grave disability without supporting facts.',
  },
  {
    id: 'grave_disability_disorganized_behavior',
    category: 'grave_disability',
    subtype: 'disorganized_behavior',
    detectionKeywords: ['wandering', 'disorganized behavior', 'cannot state address', 'responding to internal stimuli and unsafe'],
    confidenceLevel: 'moderate',
    documentationCaution: 'Disorganized behavior should remain observational and time-anchored.',
  },
  {
    id: 'grave_disability_unsafe_environment',
    category: 'grave_disability',
    subtype: 'unsafe_environment',
    detectionKeywords: ['unsafe if discharged', 'cannot maintain safety at home', 'unsafe environment', 'no safe discharge environment'],
    confidenceLevel: 'moderate',
    documentationCaution: 'Unsafe environment language should be linked to actual documented conditions, not inferred from vague instability.',
  },
];

export const RISK_ANALYSIS_WARNING = 'Absence of evidence is not absence of risk; if risk is unclear, say insufficient data rather than risk absent.';
