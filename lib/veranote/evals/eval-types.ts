export type EvalCategory =
  | 'mse'
  | 'risk'
  | 'diagnosis'
  | 'substance'
  | 'contradiction'
  | 'fidelity'
  | 'utility'
  | 'workflow';

export type EvalRuleName =
  | 'no-hallucination'
  | 'mse-integrity'
  | 'risk-overreach'
  | 'diagnosis-overreach'
  | 'contradiction-handling'
  | 'uncertainty-language';

export type EvalCase = {
  id: string;
  name: string;
  input: string;
  expectedChecks: EvalRuleName[];
  expectedPatterns?: string[];
  forbiddenPatterns: string[];
  metadata?: {
    category: EvalCategory;
  };
};

export type EvalRuleOutcome = {
  name: EvalRuleName;
  passed: boolean;
  explanation: string;
};

export type EvalResult = {
  caseId: string;
  passed: boolean;
  failures: string[];
  warnings: string[];
  output: string;
  ruleOutcomes: EvalRuleOutcome[];
  metadata?: EvalCase['metadata'];
};

export type EvalSummary = {
  totalCases: number;
  totalPassed: number;
  totalFailed: number;
  failureBreakdownByCategory: Partial<Record<EvalCategory, number>>;
  results: EvalResult[];
};
