export type MedicalNecessitySignal = {
  category:
    | 'risk'
    | 'functional_impairment'
    | 'symptom_severity'
    | 'treatment_failure'
    | 'safety';
  evidence: string[];
  strength: 'strong' | 'moderate' | 'weak' | 'missing';
};

export type MedicalNecessityAssessment = {
  signals: MedicalNecessitySignal[];
  missingElements: string[];
};

export type LevelOfCareAssessment = {
  suggestedLevel:
    | 'inpatient'
    | 'php'
    | 'iop'
    | 'outpatient'
    | 'unclear';
  justification: string[];
  missingJustification: string[];
};

export type CptSupportAssessment = {
  summary: string;
  documentationElements: string[];
  timeHints: string[];
  riskComplexityIndicators: string[];
  cautions: string[];
};

export type CptRecommendationStrength =
  | 'stronger-documentation-support'
  | 'possible-review'
  | 'insufficient-support';

export type CptRecommendationCandidate = {
  family: string;
  candidateCodes: string[];
  strength: CptRecommendationStrength;
  why: string[];
  missingElements: string[];
  cautions: string[];
};

export type PostNoteCptRecommendationAssessment = {
  summary: string;
  candidates: CptRecommendationCandidate[];
  timeSignals: string[];
  missingGlobalElements: string[];
  guardrails: string[];
};

export type LosAssessment = {
  reasonsForContinuedStay: string[];
  barriersToDischarge: string[];
  stabilityIndicators: string[];
  missingDischargeCriteria: string[];
};

export type AuditRiskFlag = {
  type:
    | 'missing_risk_documentation'
    | 'inconsistent_mse'
    | 'unsupported_diagnosis'
    | 'insufficient_justification';
  severity: 'low' | 'moderate' | 'high';
  message: string;
};
