export type NextAction = {
  suggestion: string;
  rationale: string;
  confidence: 'low' | 'moderate' | 'high';
};

export type TriageSuggestion = {
  level:
    | 'emergency'
    | 'urgent'
    | 'routine'
    | 'unclear';
  reasoning: string[];
  confidence: 'low' | 'moderate' | 'high';
};

export type DischargeStatus = {
  readiness:
    | 'not_ready'
    | 'possibly_ready'
    | 'ready'
    | 'unclear';
  supportingFactors: string[];
  barriers: string[];
};

export type WorkflowTask = {
  task: string;
  reason: string;
  priority: 'low' | 'medium' | 'high';
};

export type LongitudinalContextSummary = {
  symptomTrends: string[];
  riskTrends: string[];
  responseToTreatment: string[];
  recurringIssues: string[];
};
